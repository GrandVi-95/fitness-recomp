// ─── Server-only nutrition utilities ─────────────────────────────────────────
// This file imports `db` (Prisma) and must NEVER be imported by Client Components.
// Server Components, API routes, and server-side libraries import from here.

import { db } from "@/lib/db"

import { getLocalDayBounds } from "@/lib/time"

/**
 * Half-open UTC bounds [startOfDay, nextStartOfDay) of "today" in Israel
 * local time (Asia/Jerusalem, DST-aware, independent of the server's TZ).
 */
export function getTodayBounds(now: Date = new Date()): { startOfDay: Date; nextStartOfDay: Date } {
  const { start, nextStart } = getLocalDayBounds(now)
  return { startOfDay: start, nextStartOfDay: nextStart }
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TodayNutritionEntry {
  id:           string
  logId:        string
  name:         string
  quantity:     number
  unit:         string
  calories:     number
  protein:      number
  carbs:        number
  fat:          number
  // null = unknown (not measured), distinct from 0
  fiber:        number | null
  sugar:        number | null
  saturatedFat: number | null
  // AI nudge for the whole meal (shared across every item in the same log) —
  // undefined when the meal was quick-logged without an AI call.
  insight?:     string
}

export interface PlannedMeal {
  logId:    string
  mealType: string
  name:     string
  items:    TodayNutritionEntry[]
  totals:   { calories: number; protein: number; carbs: number; fat: number }
}

export interface TodayNutritionResult {
  totals: {
    calories:     number
    protein:      number
    carbs:        number
    fat:          number
    fiber:        number
    sugar:        number
    saturatedFat: number
    // false when at least one logged item's sugar is unknown (null) — the
    // sugar total is then a LOWER BOUND, not a measured total.
    sugarComplete: boolean
  }
  byMealType: Record<string, TodayNutritionEntry[]>
  // Today's planned (not yet eaten) meals — a forecast, never in `totals`.
  // Plans from earlier days aren't returned: an unconfirmed plan expires.
  planned:       PlannedMeal[]
  plannedTotals: { calories: number; protein: number; carbs: number; fat: number }
}

/**
 * Single source of truth for "today's nutrition".
 *
 * Queries NutritionLog for the current calendar day (Israel timezone-aware),
 * aggregates macros, and groups items by meal type.  Both the dashboard Server
 * Component and the /api/nutrition/today route must call this function so they
 * always return identical data.
 */
export async function getTodayNutrition(userId: string): Promise<TodayNutritionResult> {
  const { startOfDay, nextStartOfDay } = getTodayBounds()

  const logs = await db.nutritionLog.findMany({
    where:    { userId, date: { gte: startOfDay, lt: nextStartOfDay } },
    include:  { foodItems: true },
    orderBy:  { date: "asc" },
  })

  const eatenLogs = logs.filter((l) => l.status !== "planned")
  const plannedLogs = logs.filter((l) => l.status === "planned")

  const allItems = eatenLogs.flatMap((l) =>
    l.foodItems.map((item) => ({
      ...item,
      mealType: l.mealType,
      logId: l.id,
      logInsight: l.insight ?? undefined,
    })),
  )

  const raw = allItems.reduce(
    (acc, item) => ({
      calories:     acc.calories     + item.calories,
      protein:      acc.protein      + item.protein,
      carbs:        acc.carbs        + item.carbs,
      fat:          acc.fat          + item.fat,
      fiber:        acc.fiber        + (item.fiber ?? 0),
      sugar:        acc.sugar        + (item.sugar ?? 0),
      saturatedFat: acc.saturatedFat + (item.saturatedFat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, saturatedFat: 0 },
  )

  const toEntry = (item: (typeof logs)[number]["foodItems"][number], logId: string, insight?: string): TodayNutritionEntry => ({
    id:           item.id,
    logId,
    name:         item.name,
    quantity:     item.quantity,
    unit:         item.unit,
    calories:     item.calories,
    protein:      item.protein,
    carbs:        item.carbs,
    fat:          item.fat,
    fiber:        item.fiber,
    sugar:        item.sugar,
    saturatedFat: item.saturatedFat,
    insight,
  })

  const byMealType: Record<string, TodayNutritionEntry[]> = {}
  for (const item of allItems) {
    if (!byMealType[item.mealType]) byMealType[item.mealType] = []
    byMealType[item.mealType].push(toEntry(item, item.logId, item.logInsight))
  }

  const round = (t: { calories: number; protein: number; carbs: number; fat: number }) => ({
    calories: Math.round(t.calories),
    protein:  Math.round(t.protein * 10) / 10,
    carbs:    Math.round(t.carbs),
    fat:      Math.round(t.fat * 10) / 10,
  })
  const sum = (items: { calories: number; protein: number; carbs: number; fat: number }[]) =>
    items.reduce(
      (a, i) => ({ calories: a.calories + i.calories, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )
  const planned: PlannedMeal[] = plannedLogs.map((l) => ({
    logId:    l.id,
    mealType: l.mealType,
    name:     l.rawInput ?? l.foodItems.map((i) => i.name).join(", "),
    items:    l.foodItems.map((i) => toEntry(i, l.id)),
    totals:   round(sum(l.foodItems)),
  }))

  return {
    totals: {
      calories:     Math.round(raw.calories),
      protein:      Math.round(raw.protein      * 10) / 10,
      carbs:        Math.round(raw.carbs),
      fat:          Math.round(raw.fat          * 10) / 10,
      fiber:        Math.round(raw.fiber        * 10) / 10,
      sugar:        Math.round(raw.sugar        * 10) / 10,
      saturatedFat: Math.round(raw.saturatedFat * 10) / 10,
      sugarComplete: allItems.every((i) => i.sugar != null),
    },
    byMealType,
    planned,
    plannedTotals: round(sum(plannedLogs.flatMap((l) => l.foodItems))),
  }
}
