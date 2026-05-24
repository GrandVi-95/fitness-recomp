import { db } from "@/lib/db"

// Israel is UTC+3 (summer) / UTC+2 (winter). We use the upper bound (UTC+3) as a
// safe constant — this is the same convention used for workout session queries.
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000

/**
 * Returns the UTC-equivalent start and end of "today" in the local Israel
 * timezone (UTC+3).  Using raw setHours(0,0,0,0) on a UTC server gives UTC
 * midnight, which is 03:00 AM Israel time — this function corrects that by
 * shifting the boundary back by the TZ offset before and after.
 *
 * Example (server = UTC, user in Israel):
 *   Server now  = 2024-05-04T21:30Z  (= May 5 00:30 Israel)
 *   startOfDay  = 2024-05-04T21:00Z  (= May 5 00:00 Israel) ✓
 *   endOfDay    = 2024-05-05T20:59Z  (= May 5 23:59 Israel) ✓
 */
export function getTodayBounds(): { startOfDay: Date; endOfDay: Date } {
  const now = new Date()
  // Temporarily shift the clock forward to "Israel time" so setHours gives us
  // the right calendar-day boundaries, then shift back to real UTC.
  const localNow = new Date(now.getTime() + TZ_OFFSET_MS)
  const localStart = new Date(localNow)
  localStart.setHours(0, 0, 0, 0)
  const localEnd = new Date(localNow)
  localEnd.setHours(23, 59, 59, 999)
  return {
    startOfDay: new Date(localStart.getTime() - TZ_OFFSET_MS),
    endOfDay:   new Date(localEnd.getTime()   - TZ_OFFSET_MS),
  }
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TodayNutritionEntry {
  id: string
  logId: string
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  saturatedFat: number
}

export interface TodayNutritionResult {
  totals: {
    calories: number
    protein: number
    carbs: number
    fat: number
    sugar: number
    saturatedFat: number
  }
  byMealType: Record<string, TodayNutritionEntry[]>
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
  const { startOfDay, endOfDay } = getTodayBounds()

  const logs = await db.nutritionLog.findMany({
    where: { userId, date: { gte: startOfDay, lte: endOfDay } },
    include: { foodItems: true },
    orderBy: { date: "asc" },
  })

  const allItems = logs.flatMap((l) =>
    l.foodItems.map((item) => ({ ...item, mealType: l.mealType, logId: l.id })),
  )

  const raw = allItems.reduce(
    (acc, item) => ({
      calories:     acc.calories     + item.calories,
      protein:      acc.protein      + item.protein,
      carbs:        acc.carbs        + item.carbs,
      fat:          acc.fat          + item.fat,
      sugar:        acc.sugar        + item.sugar,
      saturatedFat: acc.saturatedFat + item.saturatedFat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, saturatedFat: 0 },
  )

  const byMealType: Record<string, TodayNutritionEntry[]> = {}
  for (const item of allItems) {
    if (!byMealType[item.mealType]) byMealType[item.mealType] = []
    byMealType[item.mealType].push({
      id:          item.id,
      logId:       item.logId,
      name:        item.name,
      quantity:    item.quantity,
      unit:        item.unit,
      calories:    item.calories,
      protein:     item.protein,
      carbs:       item.carbs,
      fat:         item.fat,
      fiber:       item.fiber,
      sugar:       item.sugar,
      saturatedFat: item.saturatedFat,
    })
  }

  return {
    totals: {
      calories:     Math.round(raw.calories),
      protein:      Math.round(raw.protein * 10) / 10,
      carbs:        Math.round(raw.carbs),
      fat:          Math.round(raw.fat * 10) / 10,
      sugar:        Math.round(raw.sugar * 10) / 10,
      saturatedFat: Math.round(raw.saturatedFat * 10) / 10,
    },
    byMealType,
  }
}
