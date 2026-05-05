import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getTodayNutrition } from "@/lib/nutrition"

const DEMO_USER_ID = "demo-user"

/** GET /api/nutrition/today
 * Returns today's nutrition logs grouped by meal type,
 * aggregated macros, and daily targets from the user's settings.
 */
export async function GET() {
  try {
    const [{ totals, byMealType }, user, latestMetric] = await Promise.all([
      getTodayNutrition(DEMO_USER_ID),
      db.user.findUnique({
        where: { id: DEMO_USER_ID },
        select: {
          targetCalories: true,
          targetProtein: true,
          userSettings: { select: { autoProteinGoal: true } },
        },
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

    return NextResponse.json({
      totals,
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
