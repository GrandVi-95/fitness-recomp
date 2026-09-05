// ─────────────────────────────────────────────────────────────────────────────
// Controlled Lean Gain Engine — core nutrition math (RecompOS v1.14.0 PRD)
// Single source of truth for BMR/TDEE/macro-target calculation, protein
// status zones, and the bi-weekly check-in decision engine.
// Pure functions only — no `db`, no Node built-ins — safe to import from
// Client Components, Server Components, and API routes alike.
// ─────────────────────────────────────────────────────────────────────────────

// ── BMR / TDEE / calorie target ─────────────────────────────────────────────

/**
 * Mifflin-St Jeor BMR.
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
// very active); 1.45 is the PRD's reference default.
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

// Controlled Lean Gain surplus — a deliberate, modest 5% surplus over
// maintenance (not a bulk-style surplus).
export const LEAN_GAIN_SURPLUS = 1.05

/** Base calorie target before any check-in offset: TDEE × 1.05. */
export function calculateBaseTarget(tdee: number): number {
  return Math.round(tdee * LEAN_GAIN_SURPLUS)
}

/**
 * Current calorie target = (TDEE × 1.05) + the persistent, cumulative
 * calorieAdjustmentOffset produced by the bi-weekly check-in engine
 * (UserSettings.calorieAdjustmentOffset).
 */
export function calculateCurrentTarget(tdee: number, calorieAdjustmentOffset: number): number {
  return calculateBaseTarget(tdee) + calorieAdjustmentOffset
}

// ── Dynamic macro targets (based on CURRENT logged weight) ─────────────────

export const PROTEIN_PER_KG = 2.2 // g protein / kg bodyweight — base macro target
export const FAT_PER_KG     = 0.9 // g fat / kg bodyweight

export function calculateAutoProtein(weightKg: number): number {
  return Math.round(weightKg * PROTEIN_PER_KG)
}

export function calculateTargetFats(weightKg: number): number {
  return Math.round(weightKg * FAT_PER_KG)
}

/** Carbs are the absolute remainder of calories after protein and fat. */
export function calculateTargetCarbs(
  targetCalories: number,
  targetProtein: number,
  targetFats: number,
): number {
  const proteinKcal = targetProtein * 4
  const fatKcal = targetFats * 9
  return Math.max(0, Math.round((targetCalories - proteinKcal - fatKcal) / 4))
}

export interface MacroTargets {
  calories: number
  protein: number
  fat: number
  carbs: number
}

/**
 * Full dynamic macro-target chain, recomputed off the athlete's CURRENT
 * logged weight — protein and fat scale with bodyweight, they are never a
 * stale fixed number while auto-calculation is on.
 */
export function calculateDynamicTargets(params: {
  weightKg: number
  heightCm: number
  age: number
  gender: string
  activityMultiplier?: number
  calorieAdjustmentOffset?: number
}): MacroTargets {
  const bmr = calculateBMR(params.weightKg, params.heightCm, params.age, params.gender)
  const tdee = calculateTDEE(bmr, params.activityMultiplier ?? DEFAULT_ACTIVITY_MULTIPLIER)
  const calories = calculateCurrentTarget(tdee, params.calorieAdjustmentOffset ?? 0)
  const protein = calculateAutoProtein(params.weightKg)
  const fat = calculateTargetFats(params.weightKg)
  const carbs = calculateTargetCarbs(calories, protein, fat)
  return { calories, protein, fat, carbs }
}

// ── Protein status ("Green Zone") ───────────────────────────────────────────

export type ProteinStatus = "optimal" | "good" | "needs_improvement"

export interface ProteinStatusResult {
  status: ProteinStatus
  gPerKg: number
}

/**
 * Protein status zones, evaluated in g/kg bodyweight — not as a percentage
 * of a fixed gram target — so a change in bodyweight can't silently make an
 * otherwise-healthy protein intake look like a miss.
 *   >= 2.2 g/kg    → optimal
 *   1.8–2.19 g/kg  → good (Green Zone — a SUCCESS, never flagged as a failure)
 *   < 1.8 g/kg     → needs_improvement
 */
export function classifyProteinStatus(proteinG: number, weightKg: number): ProteinStatusResult {
  if (!weightKg || weightKg <= 0) return { status: "needs_improvement", gPerKg: 0 }
  const gPerKg = proteinG / weightKg
  const status: ProteinStatus =
    gPerKg >= 2.2 ? "optimal" : gPerKg >= 1.8 ? "good" : "needs_improvement"
  return { status, gPerKg: Math.round(gPerKg * 100) / 100 }
}

// ── Bi-weekly Check-In Engine ────────────────────────────────────────────────

export type WeightTrend = "fast_loss" | "down" | "stable" | "up"
export type WaistTrend = "down" | "stable" | "up"
export type PerfTrend = "down" | "stable" | "up"
export type CheckInDecision = "no_change" | "increase" | "decrease"

export const CHECKIN_MIN_INTERVAL_DAYS = 14
export const CHECKIN_MAX_INTERVAL_DAYS = 21
export const CHECKIN_OFFSET_STEP = 150 // kcal — max adjustment per cycle

// Noise-filter bounds (strict, per PRD)
const WEIGHT_STABLE_PCT = 0.1     // within ~0.1% change/week = "stable"
const WEIGHT_FAST_LOSS_PCT = 0.25 // >0.25% drop/week = "fast loss"
const WAIST_SHIFT_CM = 0.5        // >= 0.5cm shift = "up"/"down"
// The PRD doesn't specify a Perf threshold — ±5% training-volume change is a
// reasonable, explicitly-documented judgment call for what counts as a trend
// rather than noise.
const PERF_TREND_PCT = 5

/** Weekly % change (signed) between two 7-day rolling averages of morning weight. */
export function classifyWeightTrend(
  recentAvgKg: number,
  priorAvgKg: number,
): { pctPerWeek: number; label: WeightTrend } {
  if (!priorAvgKg) return { pctPerWeek: 0, label: "stable" }
  const pctPerWeek = ((recentAvgKg - priorAvgKg) / priorAvgKg) * 100
  const label: WeightTrend =
    pctPerWeek <= -WEIGHT_FAST_LOSS_PCT ? "fast_loss"
    : Math.abs(pctPerWeek) <= WEIGHT_STABLE_PCT ? "stable"
    : pctPerWeek < 0 ? "down"
    : "up"
  return { pctPerWeek: Math.round(pctPerWeek * 1000) / 1000, label }
}

/** Waist trend from the signed cm change vs. the previous check-in's reading.
 *  No waist data at all → "stable" (neutral — never invent a false signal). */
export function classifyWaistTrend(deltaCm: number | null): WaistTrend {
  if (deltaCm == null) return "stable"
  if (deltaCm >= WAIST_SHIFT_CM) return "up"
  if (deltaCm <= -WAIST_SHIFT_CM) return "down"
  return "stable"
}

/**
 * Training-performance trend: total non-warmup volume (kg × reps) this week
 * vs. the prior week. No completed sessions in either window → "stable"
 * (no signal — avoid a false decision off missing training data).
 */
export function classifyPerfTrend(recentVolume: number, priorVolume: number): PerfTrend {
  if (recentVolume <= 0 && priorVolume <= 0) return "stable"
  if (priorVolume <= 0) return recentVolume > 0 ? "up" : "stable"
  const pctChange = ((recentVolume - priorVolume) / priorVolume) * 100
  if (pctChange >= PERF_TREND_PCT) return "up"
  if (pctChange <= -PERF_TREND_PCT) return "down"
  return "stable"
}

export interface CheckInDecisionInput {
  weightTrend: WeightTrend
  waistTrend: WaistTrend
  perfTrend: PerfTrend
  // Was the IMMEDIATELY PRECEDING check-in also weight-up + waist-up? Needed
  // for the "2 consecutive check-ins" rule — a single occurrence never
  // triggers the cut on its own.
  previousWasWeightUpWaistUp: boolean
}

export interface CheckInDecisionResult {
  decision: CheckInDecision
  offsetDelta: number
  reasoning: string
}

/**
 * Decision matrix — max ±150 kcal per cycle, applied as a CUMULATIVE
 * adjustment to calorieAdjustmentOffset (never a reset to a fixed value).
 * Only the 5 states the PRD defines are special-cased; anything else
 * defaults to "no_change" — a deliberately conservative default that never
 * oscillates on a combination of signals the PRD didn't anticipate.
 */
export function decideCheckIn(input: CheckInDecisionInput): CheckInDecisionResult {
  const { weightTrend, waistTrend, perfTrend, previousWasWeightUpWaistUp } = input

  const waistNotUp = waistTrend === "down" || waistTrend === "stable"
  const perfNotDown = perfTrend === "up" || perfTrend === "stable"

  // Weight ↓ + Waist ↓ + Perf ↑ → no change
  if (weightTrend === "down" && waistTrend === "down" && perfTrend === "up") {
    return {
      decision: "no_change",
      offsetDelta: 0,
      reasoning: "ירידה במשקל, ירידה בהיקף המותן ושיפור בביצועים — הכל על המסלול הנכון, ללא שינוי.",
    }
  }
  // Weight stable + Waist ↓ + Perf ↑ → no change
  if (weightTrend === "stable" && waistTrend === "down" && perfTrend === "up") {
    return {
      decision: "no_change",
      offsetDelta: 0,
      reasoning: "משקל יציב, היקף מותן יורד וביצועים משתפרים — רה-קומפוזיציה עובדת מצוין, ללא שינוי.",
    }
  }
  // Weight ↑ (trend) + Waist stable/↓ + Perf stable/↑ → no change (successful lean gain)
  if (weightTrend === "up" && waistNotUp && perfNotDown) {
    return {
      decision: "no_change",
      offsetDelta: 0,
      reasoning: "עלייה מבוקרת במשקל ללא עלייה בהיקף המותן, וביצועים יציבים או משתפרים — עלייה רזה מוצלחת, ללא שינוי.",
    }
  }
  // Weight ↓ (fast) + Perf ↓ → offset += 150
  if (weightTrend === "fast_loss" && perfTrend === "down") {
    return {
      decision: "increase",
      offsetDelta: CHECKIN_OFFSET_STEP,
      reasoning: `ירידה מהירה מדי במשקל יחד עם ירידה בביצועים — מוסיפים ${CHECKIN_OFFSET_STEP} קק"ל כדי לעצור את האובדן המהיר.`,
    }
  }
  // Weight ↑ (trend) + Waist ↑ (>= 0.5cm) for 2 CONSECUTIVE check-ins → offset -= 150
  if (weightTrend === "up" && waistTrend === "up") {
    if (previousWasWeightUpWaistUp) {
      return {
        decision: "decrease",
        offsetDelta: -CHECKIN_OFFSET_STEP,
        reasoning: `עלייה במשקל יחד עם עלייה בהיקף המותן — פעם שנייה ברציפות. מורידים ${CHECKIN_OFFSET_STEP} קק"ל כדי לצמצם עודף שומן.`,
      }
    }
    return {
      decision: "no_change",
      offsetDelta: 0,
      reasoning: "עלייה במשקל יחד עם עלייה בהיקף המותן — עוקבים עוד מחזור אחד לפני שינוי (נדרשות 2 בדיקות רצופות).",
    }
  }

  return {
    decision: "no_change",
    offsetDelta: 0,
    reasoning: "אין דפוס חד-משמעי במחזור הזה — ממשיכים ללא שינוי ונבדוק שוב במחזור הבא.",
  }
}

/**
 * Is a bi-weekly check-in due? `lastCheckInDate` null → due once enough
 * history exists (CHECKIN_MIN_INTERVAL_DAYS from `anchorDate`, e.g. account
 * creation or first body-metric log).
 */
export function isCheckInDue(
  lastCheckInDate: Date | null,
  anchorDate: Date,
  now: Date = new Date(),
): boolean {
  const since = lastCheckInDate ?? anchorDate
  const daysSince = (now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24)
  return daysSince >= CHECKIN_MIN_INTERVAL_DAYS
}
