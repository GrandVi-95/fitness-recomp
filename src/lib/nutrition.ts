// ─── Pure nutrition utilities ─────────────────────────────────────────────────
// This file contains ONLY pure functions and constants.
// It has NO server-only imports (no `db`, no `fs`, no Node built-ins) so it can
// be safely imported by both Client Components and Server Components / API routes.

import { calculateAutoProtein, calculateTargetFats, calculateTargetCarbs } from "@/utils/nutrition-math"

// ─── Shared sugar limit ───────────────────────────────────────────────────────
// Tracks TOTAL daily sugar (including natural sugars from fruit/dairy), not
// just added sugar — 100 g is a reasonable ceiling for a plant-based athlete
// without triggering false-positive red alerts on whole-food days.
export const SUGAR_TARGET = 100 // g/day

// On rest days total carbs drop, so a fixed 100 g ceiling would silently become
// a much larger share of the carb budget — scale it down instead.
export const REST_DAY_SUGAR_TARGET = 75 // g/day

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
}

export const LIQUID_PRESETS: Record<string, LiquidPreset> = {
  water: {
    id: "water", name: "מים",
    calories: 0, protein: 0, carbs: 0, fat: 0,
  },
  oat_milk: {
    id: "oat_milk", name: "חלב שיבולת שועל",
    calories: 120, protein: 2, carbs: 16, fat: 5,
  },
  soy_milk: {
    id: "soy_milk", name: "חלב סויה",
    calories: 90, protein: 7, carbs: 4, fat: 4,
  },
  cow_milk: {
    id: "cow_milk", name: "חלב פרה",
    calories: 122, protein: 8, carbs: 12, fat: 4.5,
  },
}

export const DEFAULT_LIQUID_ID = "water"
export const LIQUID_SERVING_ML = 250

// ─── Macro target calculator — single source of truth ────────────────────────

/**
 * Canonical macro target formula used by every screen — Controlled Lean Gain
 * Engine (v1.14.0): protein and fat are DYNAMIC, always recomputed off the
 * athlete's current logged weight rather than trusting a possibly-stale
 * stored gram value.
 *  • autoProteinGoal + weightKg → protein = weight × 2.2 g/kg
 *  • weightKg known             → fat = weight × 0.9 g/kg
 *    (else falls back to stored targetFats, then 25% of calories)
 *  • carbs = targetCarbs (DB override) OR the absolute remainder of calories
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
    ? calculateAutoProtein(params.weightKg)
    : (params.targetProtein ?? 185)
  const fat = params.weightKg
    ? calculateTargetFats(params.weightKg)
    : (params.targetFats ?? Math.round((calories * 0.25) / 9))
  const carbs = params.targetCarbs != null
    ? params.targetCarbs
    : calculateTargetCarbs(calories, protein, fat)
  return { calories, protein, carbs, fat }
}

// ─── Rest-day macro cycling ───────────────────────────────────────────────────

/**
 * Rest-day targets for a hypertrophy focus: 15 % calorie deficit, protein
 * untouched. The deficit is split between fat (35 %) and carbs (65 %) rather
 * than letting carbs absorb it all — glycogen resynthesis peaks in the
 * 24–48 h post-exercise window, so rest days still need meaningful carbohydrate
 * (Helms/Aragon/Fitschen 2014; ISSN position stand).
 */
export function computeRestDayTargets(base: MacroTargets): MacroTargets {
  const deficit = Math.round(base.calories * 0.15)
  const fatCut  = Math.round((deficit * 0.35) / 9) // kcal → g fat
  const carbCut = Math.round((deficit * 0.65) / 4) // kcal → g carbs
  return {
    calories: base.calories - deficit,
    protein:  base.protein,
    carbs:    Math.max(0, base.carbs - carbCut),
    fat:      Math.max(0, base.fat - fatCut),
  }
}
