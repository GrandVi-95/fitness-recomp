// ─── Training analytics helpers ──────────────────────────────────────────────
// Pure (no DB access) — shared by the session-start route (double progression),
// the recovery route/page (weekly volume taxonomy, PRs, deload streaks).

import { estimateOneRepMax } from "@/utils/nutrition-math"
import { getLocalWeekBounds } from "@/lib/time"

// ─────────────────────────────────────────────────────────────
// Weekly volume taxonomy
// ─────────────────────────────────────────────────────────────

export const VOLUME_MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
] as const

export type VolumeMuscle = (typeof VOLUME_MUSCLES)[number]

export const VOLUME_MUSCLE_LABELS: Record<VolumeMuscle, string> = {
  chest:      "חזה",
  back:       "גב",
  shoulders:  "כתפיים",
  biceps:     "בייספס",
  triceps:    "טרייספס",
  quads:      "קוואדס",
  hamstrings: "ירכיים",
  glutes:     "ישבן",
  calves:     "שוקיים",
  core:       "בטן",
}

// Weekly PLANNING ranges in "effective sets" (direct set = 1, indirect = 0.5).
// These are programming guide-rails, not physiological cut-offs — being above
// a range is not "too much", it just means more than was planned.
export const PLANNING_RANGES: Record<VolumeMuscle, { min: number; max: number }> = {
  chest:      { min: 8, max: 20 },
  back:       { min: 8, max: 20 },
  shoulders:  { min: 6, max: 16 },
  biceps:     { min: 6, max: 14 },
  triceps:    { min: 6, max: 14 },
  quads:      { min: 8, max: 20 },
  hamstrings: { min: 6, max: 16 },
  glutes:     { min: 4, max: 16 },
  calves:     { min: 6, max: 16 },
  core:       { min: 4, max: 12 },
}

export type PlanningStatus = "below" | "in_range" | "above"

// Split-squat / lunge patterns load the glutes as heavily as the quads.
const LUNGE_PATTERN = /split\s*squat|lunge|bulgarian|step[\s-]?up|בולגרי|לאנג|מכרע|ספליט/i

const MUSCLE_ALIASES: Record<string, VolumeMuscle> = {
  legs:  "quads", // generic "legs" (legacy rows) → quads
  quad:  "quads",
  glute: "glutes",
  calf:  "calves",
  abs:   "core",
  lats:  "back",
}

function normalizeMuscle(raw: string): VolumeMuscle | null {
  const m = raw.trim().toLowerCase()
  if ((VOLUME_MUSCLES as readonly string[]).includes(m)) return m as VolumeMuscle
  return MUSCLE_ALIASES[m] ?? null
}

/** Parses Exercise.secondaryMuscles (JSON array stored as string). */
export function parseMuscleList(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

/**
 * Effective-set weight per muscle for ONE working set of an exercise:
 * primary muscle = 1, each secondary = 0.5 (indirect). A muscle hit both
 * ways keeps the larger weight (never double-counted).
 */
export function muscleContributions(ex: {
  name: string
  primaryMuscle: string
  secondaryMuscles?: string | null
}): Partial<Record<VolumeMuscle, number>> {
  const out: Partial<Record<VolumeMuscle, number>> = {}
  const add = (m: VolumeMuscle | null, w: number) => {
    if (m && w > (out[m] ?? 0)) out[m] = w
  }
  const primary = normalizeMuscle(ex.primaryMuscle)
  add(primary, 1)
  if (primary === "quads" && LUNGE_PATTERN.test(ex.name)) add("glutes", 1)
  for (const s of parseMuscleList(ex.secondaryMuscles)) add(normalizeMuscle(s), 0.5)
  return out
}

export interface VolumeEntry {
  muscle: string // Hebrew label
  sets: number   // effective sets (0.5 steps)
  min: number
  max: number
  status: PlanningStatus
}

/** Weekly effective-set totals per muscle, with planning-range status. */
export function weeklyVolumeByMuscle(
  sets: { exercise: { name: string; primaryMuscle: string; secondaryMuscles?: string | null } }[],
): VolumeEntry[] {
  const totals: Partial<Record<VolumeMuscle, number>> = {}
  for (const s of sets) {
    const contrib = muscleContributions(s.exercise)
    for (const [m, w] of Object.entries(contrib) as [VolumeMuscle, number][]) {
      totals[m] = (totals[m] ?? 0) + w
    }
  }
  return VOLUME_MUSCLES.map((m) => {
    const value = Math.round((totals[m] ?? 0) * 2) / 2
    const { min, max } = PLANNING_RANGES[m]
    const status: PlanningStatus = value < min ? "below" : value > max ? "above" : "in_range"
    return { muscle: VOLUME_MUSCLE_LABELS[m], sets: value, min, max, status }
  })
}

// ─────────────────────────────────────────────────────────────
// Double progression
// ─────────────────────────────────────────────────────────────

export interface PerformedSet {
  reps: number
  weightKg: number
  rpe: number | null
  durationSecs: number | null
}

export interface ProgressionSuggestion {
  ready: boolean
  suggestedWeightKg: number
  suggestedReps: number
  suggestedDurationSecs?: number // duration exercises only
  reason: string
}

/** "8-12" → {8,12} · "5" → {5,5} · "AMRAP"/free text → null (skip). */
export function parseRepRange(targetReps: string): { bottom: number; top: number } | null {
  const s = targetReps.trim()
  const range = s.match(/^(\d+)\s*[-–]\s*(\d+)$/)
  if (range) {
    const a = parseInt(range[1], 10)
    const b = parseInt(range[2], 10)
    return { bottom: Math.min(a, b), top: Math.max(a, b) }
  }
  const single = s.match(/^(\d+)$/)
  if (single) {
    const n = parseInt(single[1], 10)
    return { bottom: n, top: n }
  }
  return null
}

/** Smallest practical load jump: 2.5 kg on a barbell, 1 kg elsewhere. */
export function plateStepKg(equipment: string): number {
  return equipment === "barbell" ? 2.5 : 1
}

/** Heaviest working set; ties → most reps. A real performed (weight, reps) pair. */
export function pickTopSet<T extends PerformedSet>(sets: T[]): T | null {
  let best: T | null = null
  for (const s of sets) {
    if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) {
      best = s
    }
  }
  return best
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Double progression from the latest session's working sets: ready to add
 * load once EVERY working set reached the top of the rep range (and the top
 * set's RPE, when logged, is ≤ 9). Not ready → same load, +1 rep target.
 * Returns null when the target isn't a numeric range (e.g. "AMRAP").
 */
export function computeProgression(opts: {
  targetReps: string
  equipment: string
  trackingType: string
  sets: PerformedSet[]
  /** Prescribed working sets — progressing requires completing all of them. */
  targetSets?: number
}): ProgressionSuggestion | null {
  const { targetReps, equipment, trackingType, sets } = opts
  const allSetsDone = sets.length >= (opts.targetSets ?? 1)
  const range = parseRepRange(targetReps)
  if (!range || sets.length === 0) return null
  const { bottom, top } = range

  // Timed holds — the "rep range" is a seconds range.
  if (trackingType === "duration") {
    const durations = sets.map((s) => s.durationSecs ?? 0)
    const best = Math.max(...durations)
    if (best <= 0) return null
    const ready = allSetsDone && durations.every((d) => d >= top)
    return {
      ready,
      suggestedWeightKg: 0,
      suggestedReps: 0,
      suggestedDurationSecs: ready ? best + 5 : Math.min(top, best + 5),
      reason: ready
        ? `כל ההחזקות הגיעו ל-${top} שנ' — הוסף 5 שניות`
        : `יעד: ${Math.min(top, best + 5)} שנ' בכל ההחזקות`,
    }
  }

  const topSet = pickTopSet(sets)
  if (!topSet) return null
  const allHitTop = allSetsDone && sets.every((s) => s.reps >= top)
  const rpeOk = topSet.rpe == null || topSet.rpe <= 9
  const repTarget = topSet.reps >= top ? top : Math.min(top, topSet.reps + 1)

  // Bodyweight with no added load — progress reps (or the variation).
  if (topSet.weightKg <= 0) {
    if (allHitTop && rpeOk) {
      return {
        ready: true,
        suggestedWeightKg: 0,
        suggestedReps: topSet.reps + 1,
        reason: `הגעת ל-${top} חזרות בכל הסטים — הוסף משקל או ווריאציה קשה יותר`,
      }
    }
    return {
      ready: false,
      suggestedWeightKg: 0,
      suggestedReps: repTarget,
      reason: `יעד: ${repTarget} חזרות`,
    }
  }

  if (allHitTop && rpeOk) {
    const step = plateStepKg(equipment)
    const inc = Math.max(step, Math.round((topSet.weightKg * 0.025) / step) * step)
    const next = round1(topSet.weightKg + inc)
    return {
      ready: true,
      suggestedWeightKg: next,
      suggestedReps: bottom,
      reason: `כל הסטים הגיעו ל-${top} חזרות — עלה ל-${next} ק"ג`,
    }
  }

  return {
    ready: false,
    suggestedWeightKg: topSet.weightKg,
    suggestedReps: repTarget,
    reason: allHitTop
      ? `הגעת לטווח אבל ה-RPE גבוה — אותו משקל, ${top} חזרות`
      : `אותו משקל — יעד ${repTarget} חזרות`,
  }
}

// ─────────────────────────────────────────────────────────────
// Performance metric per tracking type (PRs / weekly comparisons)
// ─────────────────────────────────────────────────────────────

export type MetricKind = "e1rm" | "reps" | "duration"

export function metricKind(trackingType: string | null | undefined): MetricKind {
  if (trackingType === "duration") return "duration"
  if (trackingType === "reps_only") return "reps"
  return "e1rm"
}

/** Best-set metric: e1RM (weighted), reps (bodyweight) or seconds (holds). */
export function setMetric(
  kind: MetricKind,
  s: { weightKg: number; reps: number; durationSecs: number | null },
): number {
  if (kind === "duration") return s.durationSecs ?? 0
  if (kind === "reps") return s.reps
  return estimateOneRepMax(s.weightKg, s.reps)
}

/** Volume per tracking type: tonnage, total reps, or total seconds held. */
export function setVolume(
  kind: MetricKind,
  s: { weightKg: number; reps: number; durationSecs: number | null },
): number {
  if (kind === "duration") return s.durationSecs ?? 0
  if (kind === "reps") return s.reps
  return s.weightKg * s.reps
}

// ─────────────────────────────────────────────────────────────
// Week streaks: consecutive training weeks + stalled weeks (deload)
// ─────────────────────────────────────────────────────────────

export interface StreakSession {
  startedAt: Date
  sets: {
    exerciseId: string
    weightKg: number
    reps: number
    exercise: { isCompound: boolean; trackingType: string }
  }[]
}

/** How many local (Sun–Sat) weeks of history `trainingWeekStreaks` needs. */
export const STREAK_MAX_WEEKS = 12

/** Start of the oldest week the streak computation looks at. */
export function streakWindowStart(now: Date = new Date()): Date {
  return getLocalWeekBounds(STREAK_MAX_WEEKS + 1, now).start
}

/**
 * - consecutiveWeeks: local weeks in a row (counting back) with ≥ 1 completed
 *   session; the current partial week counts only if it already has one.
 * - stalledWeeks: consecutive COMPLETED weeks (most recent first) in which no
 *   main lift (compound, weighted) improved its best e1RM over the previous
 *   week. A week with no comparable main lifts ends the streak.
 */
export function trainingWeekStreaks(
  sessions: StreakSession[],
  now: Date = new Date(),
): { consecutiveWeeks: number; stalledWeeks: number } {
  const weeks = Array.from({ length: STREAK_MAX_WEEKS + 2 }, (_, w) => getLocalWeekBounds(w, now))
  const sessionCount = new Array<number>(weeks.length).fill(0)
  const bestE1rm = weeks.map(() => new Map<string, number>())

  for (const s of sessions) {
    const w = weeks.findIndex((b) => s.startedAt >= b.start && s.startedAt < b.nextStart)
    if (w === -1) continue
    sessionCount[w]++
    for (const set of s.sets) {
      if (!set.exercise.isCompound || set.exercise.trackingType !== "weight_reps" || set.weightKg <= 0) continue
      const e = estimateOneRepMax(set.weightKg, set.reps)
      if (e > (bestE1rm[w].get(set.exerciseId) ?? 0)) bestE1rm[w].set(set.exerciseId, e)
    }
  }

  let consecutiveWeeks = 0
  for (let w = sessionCount[0] > 0 ? 0 : 1; w <= STREAK_MAX_WEEKS; w++) {
    if (sessionCount[w] === 0) break
    consecutiveWeeks++
  }

  let stalledWeeks = 0
  for (let w = 1; w <= STREAK_MAX_WEEKS; w++) {
    const cur = bestE1rm[w]
    const prev = bestE1rm[w + 1]
    const common = [...cur.keys()].filter((id) => prev.has(id))
    if (common.length === 0) break
    // ≥ 0.5% counts as real improvement (filters rounding noise)
    const improved = common.some((id) => cur.get(id)! > prev.get(id)! * 1.005)
    if (improved) break
    stalledWeeks++
  }

  return { consecutiveWeeks, stalledWeeks }
}
