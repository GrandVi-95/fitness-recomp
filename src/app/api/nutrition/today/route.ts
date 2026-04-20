import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/nutrition/today
 * Returns today's nutrition logs grouped by meal type,
 * aggregated macros, and daily targets from the user's settings.
 */
export async function GET() {
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const [user, logs, latestMetric] = await Promise.all([
      db.user.findUnique({
        where: { id: DEMO_USER_ID },
        select: {
          targetCalories: true,
          targetProtein: true,
          userSettings: { select: { autoProteinGoal: true } },
        },
      }),
      db.nutritionLog.findMany({
        where: {
          userId: DEMO_USER_ID,
          date: { gte: startOfDay, lte: endOfDay },
        },
        include: { foodItems: true },
        orderBy: { date: "asc" },
      }),
      db.bodyMetric.findFirst({
        where: { userId: DEMO_USER_ID },
        orderBy: { date: "desc" },
        select: { weightKg: true },
      }),
    ])

    // Compute targets — respect autoProteinGoal
    const targetCalories = user?.targetCalories ?? 2600
    let targetProtein    = user?.targetProtein  ?? 185
    if (user?.userSettings?.autoProteinGoal && latestMetric?.weightKg) {
      targetProtein = Math.round(latestMetric.weightKg * 2.1)
    }
    const targetCarbs = Math.round((targetCalories * 0.5) / 4)
    const targetFat   = Math.round((targetCalories * 0.25) / 9)

    // Aggregation
    const allItems = logs.flatMap((log) =>
      log.foodItems.map((item) => ({ ...item, mealType: log.mealType, logId: log.id }))
    )

    const totals = allItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
        carbs: acc.carbs + item.carbs,
        fat: acc.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    // Group by meal type
    const byMealType: Record<
      string,
      Array<{
        id: string
        logId: string
        name: string
        quantity: number
        unit: string
        calories: number
        protein: number
        carbs: number
        fat: number
      }>
    > = {}

    for (const item of allItems) {
      if (!byMealType[item.mealType]) byMealType[item.mealType] = []
      byMealType[item.mealType].push({
        id: item.id,
        logId: item.logId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      })
    }

    return NextResponse.json({
      totals: {
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat * 10) / 10,
      },
      byMealType,
      targets: {
        calories: targetCalories,
        protein: targetProtein,
        carbs: targetCarbs,
        fat: targetFat,
      },
    })
  } catch (err) {
    console.error("[GET /api/nutrition/today]", err)
    return NextResponse.json(
      { error: "Failed to load nutrition data" },
      { status: 500 }
    )
  }
}
