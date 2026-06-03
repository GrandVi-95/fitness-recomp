// ─── Pure nutrition utilities ─────────────────────────────────────────────────
// This file contains ONLY pure functions and constants.
// It has NO server-only imports (no `db`, no `fs`, no Node built-ins) so it can
// be safely imported by both Client Components and Server Components / API routes.

// ─── Shared sugar limit ───────────────────────────────────────────────────────
// Tracks TOTAL daily sugar (including natural sugars from fruit/dairy), not
// just added sugar — 100 g is a reasonable ceiling for a plant-based athlete
// without triggering false-positive red alerts on whole-food days.
export const SUGAR_TARGET = 100 // g/day

// ─── Macro target calculator — single source of truth ────────────────────────

export interface MacroTargets {
  calories: number
  protein:  number
  carbs:    number
  fat:      number
}

/**
 * Canonical macro target formula used by every screen.
 *  • autoProteinGoal + weightKg → protein = weight × 2.2 g/kg
 *  • fat  = targetFats  (DB override) OR 25 % of calories
 *  • carbs = targetCarbs (DB override) OR energy-balance residual
 *    (calories − protein×4 − fat×9) / 4
 */
export function computeTargets(params: {
  targetCalories:   number | null | undefined
  targetProtein:    number | null | undefined
  targetFats?:      number | null
  targetCarbs?:     number | null
  autoProteinGoal?: boolean | null
  weightKg?:        number | null
}): MacroTargets {
  const calories = params.targetCalories ?? 2600
  const protein  = (params.autoProteinGoal && params.weightKg)
    ? Math.round(params.weightKg * 2.2)
    : (params.targetProtein ?? 185)
  const fat   = params.targetFats  != null
    ? params.targetFats
    : Math.round((calories * 0.25) / 9)
  const carbs = params.targetCarbs != null
    ? params.targetCarbs
    : Math.round((calories - protein * 4 - fat * 9) / 4)
  return { calories, protein, carbs, fat }
}
