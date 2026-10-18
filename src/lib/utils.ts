import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { MacroTotals, WeeklyWeightAverage, BodyMetric } from "./types"
import { addDaysStr, dayOfWeekStr, localDateStr } from "./time"
import { estimateOneRepMax as e1rm } from "@/utils/nutrition-math"

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
 * Weekly (Sunday-start, Israel local) averages of body weight. Several
 * weigh-ins on one day count once (per-day mean first).
 */
export function computeWeeklyAverages(
  metrics: BodyMetric[]
): WeeklyWeightAverage[] {
  const byDay = new Map<string, number[]>()
  for (const m of metrics) {
    const day = localDateStr(new Date(m.date))
    byDay.set(day, [...(byDay.get(day) ?? []), m.weightKg])
  }
  const byWeek = new Map<string, number[]>()
  for (const [day, weights] of byDay) {
    const weekStart = addDaysStr(day, -dayOfWeekStr(day))
    const dayMean = weights.reduce((a, b) => a + b, 0) / weights.length
    byWeek.set(weekStart, [...(byWeek.get(weekStart) ?? []), dayMean])
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, dayMeans]) => ({
      weekStart,
      averageWeight: Math.round((dayMeans.reduce((a, b) => a + b, 0) / dayMeans.length) * 10) / 10,
      minWeight: Math.min(...dayMeans),
      maxWeight: Math.max(...dayMeans),
      dataPointCount: dayMeans.length,
    }))
}

// ── Date helpers (Israel local time) ──────────────────────────

export function toDateString(date: Date): string {
  return localDateStr(date)
}

export function todayString(): string {
  return localDateStr()
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

/** One-rep max estimate (Epley, capped at 12 reps), rounded to 1 kg. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  return Math.round(e1rm(weightKg, reps))
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
