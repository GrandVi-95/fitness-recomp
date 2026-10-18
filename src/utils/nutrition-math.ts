// ─────────────────────────────────────────────────────────────────────────────
// Goal-aware nutrition engine — core nutrition math
// Single source of truth for BMR/TDEE/macro-target calculation, training/rest
// day cycling, protein status zones, and the bi-weekly check-in engine.
// Pure functions only — no `db`, no Node built-ins — safe to import from
// Client Components, Server Components, and API routes alike.
//
// Numbers here are evidence-informed STARTING heuristics, not physiological
// cut-offs: Mifflin-St Jeor is an estimate, and the check-in loop exists
// precisely to calibrate it against the athlete's real weight/waist/strength.
// ─────────────────────────────────────────────────────────────────────────────

// ── Goals ────────────────────────────────────────────────────────────────────

export type Goal = "lean_gain" | "recomp" | "fat_loss"

export const GOALS: Goal[] = ["lean_gain", "recomp", "fat_loss"]

export function normalizeGoal(goal: string | null | undefined): Goal {
  return goal === "recomp" || goal === "fat_loss" ? goal : "lean_gain"
}

// Base energy balance per goal, as a multiple of estimated TDEE.
//  lean_gain: modest ~5% surplus (limits fat gain vs. bulk-style surpluses)
//  recomp:    maintenance
//  fat_loss:  ~15% deficit (≈0.5–1% BW/week for most people)
export const GOAL_ENERGY_FACTOR: Record<Goal, number> = {
  lean_gain: 1.05,
  recomp: 1.0,
  fat_loss: 0.85,
}

// Target rate of bodyweight change per goal, % bodyweight per WEEK
// (7-day-average vs prior 7-day-average). Coaching heuristics:
//  lean_gain ≈ +0.1…+0.35 %/wk (≈0.5–1.5 %/month), recomp ≈ flat,
//  fat_loss ≈ −0.4…−1.0 %/wk.
export const GOAL_WEIGHT_BAND: Record<Goal, { min: number; max: number }> = {
  lean_gain: { min: 0.1, max: 0.35 },
  recomp: { min: -0.15, max: 0.15 },
  fat_loss: { min: -1.0, max: -0.4 },
}

// ── BMR / TDEE / calorie target ─────────────────────────────────────────────

/**
 * Mifflin-St Jeor resting energy estimate.
 *  Male:   (10 × kg) + (6.25 × cm) − (5 × age) + 5
 *  Female: (10 × kg) + (6.25 × cm) − (5 × age) − 161
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: string,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(gender === "female" ? base - 161 : base + 5)
}

// TDEE = BMR × activity multiplier. User-configurable (1.2 sedentary → 1.9
// very active); 1.45 is the reference default.
export const DEFAULT_ACTIVITY_MULTIPLIER = 1.45

/**
 * TDEE = BMR × activity multiplier, rounded to nearest 50 kcal.
 * Deliberately does NOT add individual workout calories on top of this —
 * that activity is already reflected in the multiplier, so adding logged
 * workout calories as well would double-count it.
 */
export function calculateTDEE(
  bmr: number,
  activityMultiplier: number = DEFAULT_ACTIVITY_MULTIPLIER,
): number {
  return Math.round((bmr * activityMultiplier) / 50) * 50
}

/** Kept for backwards compatibility — the lean-gain factor. */
export const LEAN_GAIN_SURPLUS = GOAL_ENERGY_FACTOR.lean_gain

/** Base calorie target before any check-in offset: TDEE × goal factor. */
export function calculateBaseTarget(tdee: number, goal: Goal = "lean_gain"): number {
  return Math.round(tdee * GOAL_ENERGY_FACTOR[goal])
}

// The check-in offset is cumulative but bounded: past ±500 kcal the estimate
// itself (activity multiplier, logging accuracy) needs a human review rather
// than more automatic steps.
export const MAX_CALORIE_OFFSET = 500

export function clampOffset(offset: number): number {
  return Math.max(-MAX_CALORIE_OFFSET, Math.min(MAX_CALORIE_OFFSET, offset))
}

/**
 * Current calorie target = (TDEE × goal factor) + the bounded, cumulative
 * check-in offset. When `floorKcal` is given (normally the BMR estimate) the
 * target never drops below it.
 */
export function calculateCurrentTarget(
  tdee: number,
  calorieAdjustmentOffset: number,
  goal: Goal = "lean_gain",
  floorKcal = 0,
): number {
  return Math.max(floorKcal, calculateBaseTarget(tdee, goal) + clampOffset(calorieAdjustmentOffset))
}

// ── Dynamic macro targets ───────────────────────────────────────────────────

export const PROTEIN_PER_KG = 2.2 // g/kg — upper end of the 1.6–2.2 g/kg hypertrophy range
export const FAT_PER_KG = 0.9 // g/kg — starting preference
export const MIN_FAT_PER_KG = 0.6 // g/kg — floor when calories are tight

export function calculateAutoProtein(weightKg: number): number {
  return Math.round(weightKg * PROTEIN_PER_KG)
}

export function calculateTargetFats(weightKg: number): number {
  return Math.round(weightKg * FAT_PER_KG)
}

/** Carbs are the remainder of calories after protein and fat (never negative). */
export function calculateTargetCarbs(
  targetCalories: number,
  targetProtein: number,
  targetFats: number,
): number {
  return Math.max(0, Math.round(macroRemainderKcal(targetCalories, targetProtein, targetFats) / 4))
}

function macroRemainderKcal(calories: number, protein: number, fat: number): number {
  return calories - protein * 4 - fat * 9
}

export interface MacroTargets {
  calories: number
  protein: number
  fat: number
  carbs: number
}

export interface MacroFeasibility {
  feasible: boolean
  /** kcal left for carbs after protein + fat (negative = impossible). */
  remainderKcal: number
}

/** Can protein + fat even fit inside the calorie target? */
export function checkMacroFeasibility(calories: number, protein: number, fat: number): MacroFeasibility {
  const remainderKcal = macroRemainderKcal(calories, protein, fat)
  return { feasible: remainderKcal >= 0, remainderKcal }
}

/**
 * Resolves fat for a calorie budget: starts at FAT_PER_KG and, when protein +
 * fat would leave no room for carbs, steps fat down toward MIN_FAT_PER_KG
 * instead of silently zeroing carbs.
 */
export function resolveFatForBudget(calories: number, protein: number, weightKg: number): number {
  const preferred = calculateTargetFats(weightKg)
  if (macroRemainderKcal(calories, protein, preferred) >= 0) return preferred
  const floor = Math.round(weightKg * MIN_FAT_PER_KG)
  const fit = Math.floor((calories - protein * 4) / 9)
  return Math.max(floor, Math.min(preferred, fit))
}

/**
 * Full dynamic macro-target chain, recomputed off the athlete's (trend)
 * weight — protein and fat scale with bodyweight.
 */
export function calculateDynamicTargets(params: {
  weightKg: number
  heightCm: number
  age: number
  gender: string
  activityMultiplier?: number
  calorieAdjustmentOffset?: number
  goal?: Goal
}): MacroTargets {
  const bmr = calculateBMR(params.weightKg, params.heightCm, params.age, params.gender)
  const tdee = calculateTDEE(bmr, params.activityMultiplier ?? DEFAULT_ACTIVITY_MULTIPLIER)
  const calories = calculateCurrentTarget(tdee, params.calorieAdjustmentOffset ?? 0, params.goal ?? "lean_gain", bmr)
  const protein = calculateAutoProtein(params.weightKg)
  const fat = resolveFatForBudget(calories, protein, params.weightKg)
  const carbs = calculateTargetCarbs(calories, protein, fat)
  return { calories, protein, fat, carbs }
}

// ── Training / rest day cycling (weekly-budget preserving) ──────────────────

// Rest days get this much less than the average day; the saved calories are
// moved onto training days, so the WEEKLY total still equals 7 × the base
// target and the chosen goal's energy balance is preserved.
export const REST_DAY_CALORIE_CUT = 0.1
// How the rest-day reduction is split: mostly carbs (lower glycogen demand),
// some fat. Protein is never cycled.
const REST_DAY_FAT_SHARE = 0.35

export function computeDayTargets(
  base: MacroTargets,
  isTrainingDay: boolean,
  trainingDaysPerWeek: number,
): MacroTargets {
  const training = Math.max(0, Math.min(7, Math.round(trainingDaysPerWeek)))
  const restDays = 7 - training
  // No cycling possible when every day (or no day) is a training day.
  if (training === 0 || restDays === 0) return base

  const restCutKcal = Math.round(base.calories * REST_DAY_CALORIE_CUT)
  if (!isTrainingDay) {
    const fatCut = Math.round((restCutKcal * REST_DAY_FAT_SHARE) / 9)
    const carbCut = Math.round((restCutKcal * (1 - REST_DAY_FAT_SHARE)) / 4)
    return {
      calories: base.calories - restCutKcal,
      protein: base.protein,
      fat: Math.max(0, base.fat - fatCut),
      carbs: Math.max(0, base.carbs - carbCut),
    }
  }
  // Training day: redistribute the rest days' savings, all as carbohydrate.
  const bonusKcal = Math.round((restCutKcal * restDays) / training)
  return {
    calories: base.calories + bonusKcal,
    protein: base.protein,
    fat: base.fat,
    carbs: base.carbs + Math.round(bonusKcal / 4),
  }
}

// ── Sugar reference ─────────────────────────────────────────────────────────

// The app logs TOTAL sugar (natural + added) — it can't tell them apart. WHO's
// <10% energy limit applies to FREE sugars only, so it must not be applied to
// totals. The EU labelling Reference Intake for TOTAL sugars is 90 g at
// 2000 kcal (18% of energy); we scale that to the day's calorie target and
// present it as a reference, not a hard limit.
export const TOTAL_SUGAR_ENERGY_SHARE = 0.18

export function totalSugarReferenceG(calories: number): number {
  return Math.round((calories * TOTAL_SUGAR_ENERGY_SHARE) / 4)
}

// ── Protein status ("Green Zone") ───────────────────────────────────────────

export type ProteinStatus = "optimal" | "good" | "needs_improvement"

export interface ProteinStatusResult {
  status: ProteinStatus
  gPerKg: number
}

// Morton et al. 2018: gains plateau around ~1.6 g/kg (upper CI ~2.2 g/kg).
export const PROTEIN_GOOD_G_PER_KG = 1.6
export const PROTEIN_OPTIMAL_G_PER_KG = 2.0

/**
 * Protein status zones, evaluated in g/kg bodyweight:
 *   >= 2.0 g/kg    → optimal
 *   1.6–1.99 g/kg  → good (Green Zone — a SUCCESS, never flagged as a failure)
 *   < 1.6 g/kg     → needs_improvement
 */
export function classifyProteinStatus(proteinG: number, weightKg: number): ProteinStatusResult {
  if (!weightKg || weightKg <= 0) return { status: "needs_improvement", gPerKg: 0 }
  const gPerKg = proteinG / weightKg
  const status: ProteinStatus =
    gPerKg >= PROTEIN_OPTIMAL_G_PER_KG ? "optimal" : gPerKg >= PROTEIN_GOOD_G_PER_KG ? "good" : "needs_improvement"
  return { status, gPerKg: Math.round(gPerKg * 100) / 100 }
}

/** A day "hits" protein when it's in the Green Zone or better. */
export function isProteinOnTarget(proteinG: number, weightKg: number | null, targetG: number): boolean {
  if (weightKg && weightKg > 0) return classifyProteinStatus(proteinG, weightKg).status !== "needs_improvement"
  return proteinG >= targetG * (PROTEIN_GOOD_G_PER_KG / PROTEIN_PER_KG)
}

// ── Strength (performance) signal ───────────────────────────────────────────

/** Estimated 1RM (Epley). Reliable up to ~12 reps; capped there. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  if (reps === 1) return weightKg
  return weightKg * (1 + Math.min(reps, 12) / 30)
}

export interface PerfSet {
  exerciseId: string
  weightKg: number
  reps: number
}

/** Best e1RM per exercise in a window. */
export function bestE1rmByExercise(sets: PerfSet[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const s of sets) {
    const e = estimateOneRepMax(s.weightKg, s.reps)
    if (e > (best.get(s.exerciseId) ?? 0)) best.set(s.exerciseId, e)
  }
  return best
}

// ── Bi-weekly Check-In Engine ────────────────────────────────────────────────

export type WeightTrend = "fast_loss" | "down" | "stable" | "up" | "fast_gain" | "unknown"
export type WaistTrend = "down" | "stable" | "up" | "unknown"
export type PerfTrend = "down" | "stable" | "up" | "unknown"
export type CheckInDecision = "no_change" | "increase" | "decrease"
/** Where the weight rate sits relative to the GOAL's band. */
export type RateVsGoal = "below" | "in_range" | "above" | "unknown"

export const CHECKIN_MIN_INTERVAL_DAYS = 14
export const CHECKIN_MAX_INTERVAL_DAYS = 21
export const CHECKIN_OFFSET_STEP = 150 // kcal — max adjustment per cycle

// Data-quality gates
export const MIN_WEIGH_IN_DAYS_PER_WEEK = 3 // distinct days with a weigh-in, per 7-day window
export const MIN_LOGGED_DAYS_PER_CYCLE = 10 // of 14 — nutrition logged
export const ADHERENCE_TOLERANCE = 0.1 // logged intake within ±10% of target
export const MIN_MATCHED_EXERCISES = 2 // for a strength trend

// Noise filters (heuristics)
const WEIGHT_STABLE_PCT = 0.1 // |change| ≤ 0.1 %/wk reads as "stable"
const WEIGHT_FAST_PCT = 0.5 // |change| ≥ 0.5 %/wk reads as "fast"
const WAIST_SHIFT_CM = 0.5 // ≥ 0.5 cm vs last check-in = a real shift
const PERF_TREND_PCT = 2 // median e1RM change ≥ 2% = a real change

/** Mean of per-day means — several weigh-ins on one day count once. */
export function dailyAveragedMean(values: { day: string; value: number }[]): { mean: number; days: number } {
  const byDay = new Map<string, number[]>()
  for (const v of values) byDay.set(v.day, [...(byDay.get(v.day) ?? []), v.value])
  const dayMeans = [...byDay.values()].map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length)
  if (dayMeans.length === 0) return { mean: 0, days: 0 }
  return { mean: dayMeans.reduce((a, b) => a + b, 0) / dayMeans.length, days: dayMeans.length }
}

/** Weekly % change (signed) between two 7-day daily-averaged weight windows. */
export function classifyWeightTrend(
  recentAvgKg: number,
  priorAvgKg: number,
): { pctPerWeek: number; label: WeightTrend } {
  if (!priorAvgKg || !recentAvgKg) return { pctPerWeek: 0, label: "unknown" }
  const pctPerWeek = ((recentAvgKg - priorAvgKg) / priorAvgKg) * 100
  const label: WeightTrend =
    pctPerWeek <= -WEIGHT_FAST_PCT ? "fast_loss"
    : pctPerWeek >= WEIGHT_FAST_PCT ? "fast_gain"
    : Math.abs(pctPerWeek) <= WEIGHT_STABLE_PCT ? "stable"
    : pctPerWeek < 0 ? "down"
    : "up"
  return { pctPerWeek: Math.round(pctPerWeek * 1000) / 1000, label }
}

export function rateVsGoal(pctPerWeek: number, label: WeightTrend, goal: Goal): RateVsGoal {
  if (label === "unknown") return "unknown"
  const band = GOAL_WEIGHT_BAND[goal]
  if (pctPerWeek < band.min) return "below"
  if (pctPerWeek > band.max) return "above"
  return "in_range"
}

/** Waist trend from the signed cm change vs. the previous check-in's reading. */
export function classifyWaistTrend(deltaCm: number | null): WaistTrend {
  if (deltaCm == null) return "unknown"
  if (deltaCm >= WAIST_SHIFT_CM) return "up"
  if (deltaCm <= -WAIST_SHIFT_CM) return "down"
  return "stable"
}

/**
 * Strength trend from MATCHED exercises: best estimated 1RM per exercise in
 * the recent window vs the prior window, median % change. Tonnage is not
 * used — a skipped session or a deload would read as a performance drop.
 * Fewer than MIN_MATCHED_EXERCISES matched → "unknown".
 */
export function classifyPerfTrend(recent: PerfSet[], prior: PerfSet[]): PerfTrend {
  const r = bestE1rmByExercise(recent)
  const p = bestE1rmByExercise(prior)
  const changes: number[] = []
  for (const [id, now] of r) {
    const before = p.get(id)
    if (before && before > 0 && now > 0) changes.push(((now - before) / before) * 100)
  }
  if (changes.length < MIN_MATCHED_EXERCISES) return "unknown"
  changes.sort((a, b) => a - b)
  const mid = Math.floor(changes.length / 2)
  const median = changes.length % 2 ? changes[mid] : (changes[mid - 1] + changes[mid]) / 2
  if (median >= PERF_TREND_PCT) return "up"
  if (median <= -PERF_TREND_PCT) return "down"
  return "stable"
}

export interface Adherence {
  loggedDays: number
  /** mean(logged kcal / target kcal) over logged days, or null. */
  ratio: number | null
  adequate: boolean
}

export function assessAdherence(days: { loggedKcal: number; targetKcal: number }[]): Adherence {
  const logged = days.filter((d) => d.loggedKcal > 0 && d.targetKcal > 0)
  if (logged.length === 0) return { loggedDays: 0, ratio: null, adequate: false }
  const ratio = logged.reduce((a, d) => a + d.loggedKcal / d.targetKcal, 0) / logged.length
  return {
    loggedDays: logged.length,
    ratio: Math.round(ratio * 1000) / 1000,
    adequate: logged.length >= MIN_LOGGED_DAYS_PER_CYCLE && Math.abs(ratio - 1) <= ADHERENCE_TOLERANCE,
  }
}

export interface CheckInDecisionInput {
  goal: Goal
  weightPctPerWeek: number
  weightTrend: WeightTrend
  waistTrend: WaistTrend
  perfTrend: PerfTrend
  adherence: Adherence
  // Previous check-in (if it counts — not recorded during creatine calibration)
  previousRateVsGoal: RateVsGoal | null
  previousWaistTrend: WaistTrend | null
  currentOffset: number
  // Creatine Calibration: the matrix still runs, but a "decrease" is
  // overridden to no_change — creatine water weight must never trigger a cut.
  creatineCalibrationActive?: boolean
  // Manual calorie target: the offset isn't applied, so never change it.
  manualCalories?: boolean
}

export interface CheckInDecisionResult {
  decision: CheckInDecision
  offsetDelta: number
  reasoning: string
  rateVsGoal: RateVsGoal
}

const noChange = (reasoning: string, rate: RateVsGoal): CheckInDecisionResult => ({
  decision: "no_change",
  offsetDelta: 0,
  reasoning,
  rateVsGoal: rate,
})

/**
 * Goal-relative decision — max ±150 kcal per cycle, applied to a cumulative
 * but bounded offset. Gates first (data quality, adherence), then the
 * weight rate against the goal's band, refined by waist and strength.
 */
export function decideCheckIn(input: CheckInDecisionInput): CheckInDecisionResult {
  const result = decideCheckInRaw(input)

  if (input.creatineCalibrationActive && result.offsetDelta < 0) {
    return noChange(
      "כיול קריאטין פעיל — עלייה במשקל בתקופה זו משקפת בעיקר נוזלים תוך-שריריים, לכן לא מקצצים קלוריות. אם גם היקף המותן עולה, נבחן זאת שוב אחרי סיום הכיול.",
      result.rateVsGoal,
    )
  }
  if (result.offsetDelta !== 0 && input.manualCalories) {
    return noChange(
      `${result.reasoning.replace(/ — (מוסיפים|מורידים).*$/, "")} — יעד הקלוריות מוגדר ידנית, לכן המנוע לא משנה אותו. שקול לעדכן אותו בהגדרות.`,
      result.rateVsGoal,
    )
  }
  if (result.offsetDelta !== 0) {
    // Shorten the step to the remaining room; refuse only at the bound itself.
    const after = clampOffset(input.currentOffset + result.offsetDelta)
    const delta = after - input.currentOffset
    if (delta === 0) {
      return noChange(
        `ההתאמה המצטברת הגיעה לגבול (±${MAX_CALORIE_OFFSET} קק"ל). כדאי לבדוק ידנית את מקדם הפעילות ואת דיוק התיעוד לפני שינוי נוסף.`,
        result.rateVsGoal,
      )
    }
    if (delta !== result.offsetDelta) {
      return {
        ...result,
        offsetDelta: delta,
        reasoning: result.reasoning.replace(String(CHECKIN_OFFSET_STEP), String(Math.abs(delta))),
      }
    }
  }
  return result
}

function decideCheckInRaw(input: CheckInDecisionInput): CheckInDecisionResult {
  const { goal, weightPctPerWeek, weightTrend, waistTrend, perfTrend, adherence } = input
  const rate = rateVsGoal(weightPctPerWeek, weightTrend, goal)

  if (rate === "unknown") {
    return noChange(
      `אין מספיק שקילות (לפחות ${MIN_WEIGH_IN_DAYS_PER_WEEK} ימי שקילה בכל שבוע) כדי לזהות מגמה — ממשיכים ללא שינוי.`,
      rate,
    )
  }
  if (!adherence.adequate) {
    const detail =
      adherence.loggedDays < MIN_LOGGED_DAYS_PER_CYCLE
        ? `תועדו ${adherence.loggedDays} מתוך 14 ימים`
        : `הצריכה המתועדת הייתה ${Math.round((adherence.ratio ?? 0) * 100)}% מהיעד`
    return noChange(
      `לא משנים יעד שלא נבדק בפועל (${detail}). קודם עקביות סביב היעד הנוכחי, ואז נחליט לפי התוצאות.`,
      rate,
    )
  }

  const waistUp = waistTrend === "up"
  const waistDown = waistTrend === "down"
  const perfDown = perfTrend === "down"
  const perfUp = perfTrend === "up"

  if (rate === "below") {
    // Body composition clearly improving (waist ↓, strength ↑) — a recomp is
    // working even though the scale is below the band; leave it alone.
    if (goal !== "fat_loss" && waistDown && perfUp) {
      return noChange("המשקל מתחת לטווח היעד, אבל המותן יורדת והכוח עולה — רה-קומפוזיציה עובדת, ללא שינוי.", rate)
    }
    const why =
      goal === "lean_gain" ? "העלייה במשקל איטית מהטווח שנקבע לעלייה רזה"
      : goal === "recomp" ? "המשקל יורד במקום להישאר יציב"
      : "הירידה במשקל מהירה מהטווח המומלץ"
    return {
      decision: "increase",
      offsetDelta: CHECKIN_OFFSET_STEP,
      reasoning: `${why}${perfDown ? " והכוח יורד" : ""} — מוסיפים ${CHECKIN_OFFSET_STEP} קק"ל.`,
      rateVsGoal: rate,
    }
  }

  if (rate === "above") {
    const consecutive = input.previousRateVsGoal === "above"
    if (waistUp || consecutive) {
      const why =
        goal === "fat_loss" ? "הירידה במשקל איטית מהטווח שנקבע"
        : "המשקל עולה מהר מהטווח שנקבע"
      return {
        decision: "decrease",
        offsetDelta: -CHECKIN_OFFSET_STEP,
        reasoning: `${why}${waistUp ? " והיקף המותן עולה" : " זה מחזור שני ברציפות"} — מורידים ${CHECKIN_OFFSET_STEP} קק"ל.`,
        rateVsGoal: rate,
      }
    }
    return noChange("קצב השינוי במשקל מעל טווח היעד — עוקבים עוד מחזור אחד לפני שינוי.", rate)
  }

  // In range: only a sustained waist increase changes anything.
  if (waistUp && input.previousWaistTrend === "up" && !perfUp) {
    return {
      decision: "decrease",
      offsetDelta: -CHECKIN_OFFSET_STEP,
      reasoning: `היקף המותן עולה שני מחזורים ברצף בלי שיפור בכוח — מורידים ${CHECKIN_OFFSET_STEP} קק"ל כדי לצמצם עודף שומן.`,
      rateVsGoal: rate,
    }
  }
  return noChange("קצב השינוי במשקל בתוך טווח היעד — ממשיכים ללא שינוי.", rate)
}

/** Is a bi-weekly check-in due? */
export function isCheckInDue(
  lastCheckInDate: Date | null,
  anchorDate: Date,
  now: Date = new Date(),
): boolean {
  const since = lastCheckInDate ?? anchorDate
  const daysSince = (now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24)
  return daysSince >= CHECKIN_MIN_INTERVAL_DAYS
}

// ── Creatine calibration window ─────────────────────────────────────────────

// Intramuscular water from creatine mostly settles within ~4 weeks (faster
// with a 5–7 day loading phase). After that, calibration switches itself off.
export const CREATINE_CALIBRATION_DAYS = 28

export function isCreatineCalibrationEffective(
  active: boolean | null | undefined,
  startedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!active) return false
  if (!startedAt) return true
  return now.getTime() - startedAt.getTime() < CREATINE_CALIBRATION_DAYS * 24 * 60 * 60 * 1000
}
