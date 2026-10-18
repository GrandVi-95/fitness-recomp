// ─── Pure nutrition utilities ─────────────────────────────────────────────────
// This file contains ONLY pure functions and constants.
// It has NO server-only imports (no `db`, no `fs`, no Node built-ins) so it can
// be safely imported by both Client Components and Server Components / API routes.

import {
  calculateAutoProtein,
  calculateTargetCarbs,
  resolveFatForBudget,
  computeDayTargets,
  totalSugarReferenceG,
  MIN_FAT_PER_KG,
} from "@/utils/nutrition-math"

export { computeDayTargets, totalSugarReferenceG }

// ─── Macro target types ───────────────────────────────────────────────────────

export interface MacroTargets {
  calories: number
  protein:  number
  carbs:    number
  fat:      number
}

// ─── Coffee milk presets (values per 100 ml) ─────────────────────────────────

export interface MilkPreset {
  id:       string
  name:     string
  calories: number
  carbs:    number
  fat:      number
  protein:  number
  sugar:    number
}

export const MILK_PRESETS: Record<string, MilkPreset> = {
  tnuva_oat_barista: {
    id: "tnuva_oat_barista", name: "תנובה שיבולת שועל Barista",
    calories: 61, carbs: 7.5, fat: 3.0, protein: 0.8, sugar: 4.0,
  },
  oatly_barista: {
    id: "oatly_barista", name: "Oatly Barista",
    calories: 59, carbs: 6.5, fat: 3.0, protein: 1.0, sugar: 3.4,
  },
  tnuva_soy_barista: {
    id: "tnuva_soy_barista", name: "תנובה סויה Barista",
    calories: 43, carbs: 2.2, fat: 2.2, protein: 3.3, sugar: 1.5,
  },
}

export const DEFAULT_MILK_PRESET_ID = "tnuva_oat_barista"
export const DEFAULT_MILK_VOLUME_ML = 125

// ─── Protein shake liquid bases (values per fixed 250 ml serving) ────────────
// Distinct from the coffee MILK_PRESETS above (those are per-100ml "barista"
// creamers dosed in small splashes) — a shake liquid is a full glass, so
// these are pre-computed per the standard 250 ml serving used by the Shake
// Builder rather than needing a separate volume input.

export interface LiquidPreset {
  id:       string
  name:     string
  calories: number
  protein:  number
  carbs:    number
  fat:      number
  sugar:    number
}

export const LIQUID_PRESETS: Record<string, LiquidPreset> = {
  water: {
    id: "water", name: "מים",
    calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0,
  },
  oat_milk: {
    id: "oat_milk", name: "חלב שיבולת שועל",
    calories: 120, protein: 2, carbs: 16, fat: 5, sugar: 8,
  },
  soy_milk: {
    id: "soy_milk", name: "חלב סויה",
    calories: 90, protein: 7, carbs: 4, fat: 4, sugar: 3,
  },
  cow_milk: {
    id: "cow_milk", name: "חלב פרה",
    calories: 122, protein: 8, carbs: 12, fat: 4.5, sugar: 12,
  },
}

export const DEFAULT_LIQUID_ID = "water"
export const LIQUID_SERVING_ML = 250

// ─── Macro target calculator — single source of truth ────────────────────────

/**
 * Canonical macro target formula (pure). Server code should normally call
 * resolveTargets() in lib/targets-server.ts, which feeds this with the trend
 * weight and the synced calorie target.
 *  • autoProteinGoal + weightKg → protein = weight × 2.2 g/kg
 *  • weightKg known             → fat = 0.9 g/kg, stepped down toward
 *                                  0.6 g/kg only if carbs would go negative
 *    (else stored targetFats, then 25% of calories)
 *  • carbs = ALWAYS the remainder (calories − protein×4 − fat×9) / 4 — never
 *    a stored value, so a calorie change can't leave carbs stale.
 */
export function computeTargets(params: {
  targetCalories:   number | null | undefined
  targetProtein:    number | null | undefined
  targetFats?:      number | null
  autoProteinGoal?: boolean | null
  weightKg?:        number | null
}): MacroTargets {
  const calories = params.targetCalories ?? 2600
  let protein    = (params.autoProteinGoal && params.weightKg)
    ? calculateAutoProtein(params.weightKg)
    : (params.targetProtein ?? 185)
  // Auto protein (2.2 g/kg of TOTAL weight) can exceed what a low calorie
  // budget allows at higher body weights. Cap it so protein + the fat floor
  // still fit — an impossible target helps nobody.
  if (params.autoProteinGoal && params.weightKg) {
    const fatFloorKcal = Math.round(params.weightKg * MIN_FAT_PER_KG) * 9
    protein = Math.max(0, Math.min(protein, Math.floor((calories - fatFloorKcal) / 4)))
  }
  const fat = params.weightKg
    ? resolveFatForBudget(calories, protein, params.weightKg)
    : (params.targetFats ?? Math.round((calories * 0.25) / 9))
  const carbs = calculateTargetCarbs(calories, protein, fat)
  return { calories, protein, carbs, fat }
}
