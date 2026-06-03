import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getTodayNutrition, computeTargets } from "@/lib/nutrition"

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
          targetProtein:  true,
          targetFats:     true,
          targetCarbs:    true,
          userSettings: { select: { autoProteinGoal: true } },
        },
      }),
      db.bodyMetric.findFirst({
        where: { userId: DEMO_USER_ID },
        orderBy: { date: "desc" },
        select: { weightKg: true },
      }),
    ])

    const { calories, protein, carbs, fat } = computeTargets({
      targetCalories:  user?.targetCalories,
      targetProtein:   user?.targetProtein,
      targetFats:      user?.targetFats,
      targetCarbs:     user?.targetCarbs,
      autoProteinGoal: user?.userSettings?.autoProteinGoal,
      weightKg:        latestMetric?.weightKg,
    })

    return NextResponse.json({
      totals,
      byMealType,
      targets: { calories, protein, carbs, fat },
    })
  } catch (err) {
    console.error("[GET /api/nutrition/today]", err)
    return NextResponse.json(
      { error: "Failed to load nutrition data" },
      { status: 500 }
    )
  }
}
