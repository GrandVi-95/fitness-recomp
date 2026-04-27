import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { MacroTotals, WeeklyWeightAverage, BodyMetric } from "./types"

// ── Tailwind class merging ────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Macro calculations ────────────────────────────────────────

/**
 * Scales macros from a per-100g food entry to a given quantity.
 */
export function scaleMacros(
  per100: MacroTotals,
  quantityGrams: number
): MacroTotals {
  const factor = quantityGrams / 100
  return {
    calories: Math.round(per100.calories * factor),
    protein: Math.round(per100.protein * factor * 10) / 10,
    carbs: Math.round(per100.carbs * factor * 10) / 10,
    fat: Math.round(per100.fat * factor * 10) / 10,
    fiber: Math.round((per100.fiber ?? 0) * factor * 10) / 10,
  }
}

export function sumMacros(items: MacroTotals[]): MacroTotals {
  return items.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      fiber: acc.fiber + m.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  )
}

/** Protein pacing: returns true if current intake is behind schedule */
export function isProteinBehindPace(
  currentProtein: number,
  targetProtein: number,
  currentHour: number // 0–23
): boolean {
  if (currentHour < 8) return false
  const expectedFraction = Math.min((currentHour - 8) / 14, 1) // 8am–10pm window
  const expectedProtein = targetProtein * expectedFraction
  return currentProtein < expectedProtein * 0.75 // behind by >25%
}

// ── Body weight analysis ──────────────────────────────────────

/**
 * Computes 7-day rolling averages from a sorted list of body metrics.
 */
export function computeWeeklyAverages(
  metrics: BodyMetric[]
): WeeklyWeightAverage[] {
  if (metrics.length === 0) return []

  const sorted = [...metrics].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const weeks: WeeklyWeightAverage[] = []

  for (let i = 0; i < sorted.length; i += 7) {
    const slice = sorted.slice(i, i + 7)
    const weights = slice.map((m) => m.weightKg)
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length

    weeks.push({
      weekStart: toDateString(new Date(slice[0].date)),
      averageWeight: Math.round(avg * 10) / 10,
      minWeight: Math.min(...weights),
      maxWeight: Math.max(...weights),
      dataPointCount: slice.length,
    })
  }

  return weeks
}

// ── Date helpers ──────────────────────────────────────────────

export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0]
}

export function todayString(): string {
  return toDateString(new Date())
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round(Math.abs(b.getTime() - a.getTime()) / msPerDay)
}

// ── Volume helpers ────────────────────────────────────────────

/** One-rep max estimate (Epley formula) */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg
  return Math.round(weightKg * (1 + reps / 30))
}

/** Total volume for a set of logs */
export function totalVolume(
  sets: Array<{ weightKg: number; reps: number; isWarmup: boolean }>
): number {
  return sets
    .filter((s) => !s.isWarmup)
    .reduce((acc, s) => acc + s.weightKg * s.reps, 0)
}

// ── Rest timer ────────────────────────────────────────────────

export function formatRestTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ── TDEE / calorie targets ────────────────────────────────

export const PROTEIN_MULTIPLIER = 2.2 // g protein per kg bodyweight

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

/** TDEE = BMR × activity multiplier, rounded to nearest 50 kcal */
export function calculateTDEE(bmr: number, activityMultiplier: number): number {
  return Math.round((bmr * activityMultiplier) / 50) * 50
}

export function calculateAutoProtein(weightKg: number): number {
  return Math.round(weightKg * PROTEIN_MULTIPLIER)
}

/** Fat target: 25% of total calories, at 9 kcal/g */
export function calculateTargetFats(targetCalories: number): number {
  return Math.round((targetCalories * 0.25) / 9)
}

/** Carb target: remaining calories after protein and fat, at 4 kcal/g */
export function calculateTargetCarbs(
  targetCalories: number,
  targetProtein: number,
  targetFats: number,
): number {
  const proteinKcal = targetProtein * 4
  const fatKcal = targetFats * 9
  return Math.round((targetCalories - proteinKcal - fatKcal) / 4)
}

// ── Progress helpers ──────────────────────────────────────────

export function progressPercent(current: number, target: number): number {
  if (target === 0) return 0
  return Math.min(Math.round((current / target) * 100), 100)
}

export function calorieBalance(
  consumed: number,
  target: number
): { remaining: number; isOver: boolean } {
  const remaining = target - consumed
  return { remaining: Math.abs(remaining), isOver: remaining < 0 }
}
