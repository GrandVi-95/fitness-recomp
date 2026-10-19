import { NextResponse } from "next/server"
import { getTodayNutrition } from "@/lib/nutrition-server"
import { resolveTargets } from "@/lib/targets-server"

const DEMO_USER_ID = "demo-user"

/** GET /api/nutrition/today
 * Today's nutrition logs grouped by meal type, aggregated macros, and the
 * targets for TODAY (training/rest-day adjusted, from resolveTargets).
 */
export async function GET() {
  try {
    const [{ totals, byMealType, planned, plannedTotals }, t] = await Promise.all([
      getTodayNutrition(DEMO_USER_ID),
      resolveTargets(DEMO_USER_ID),
    ])

    return NextResponse.json({
      totals,
      byMealType,
      planned,
      plannedTotals,
      targets: t.day,
      baseTargets: t.base,
      isTrainingDay: t.isTrainingDay,
      dayTypeSource: t.dayTypeSource,
      sugarReferenceG: t.sugarReferenceG,
      weightKg: t.weightKg,
    })
  } catch (err) {
    console.error("[GET /api/nutrition/today]", err)
    return NextResponse.json(
      { error: "Failed to load nutrition data" },
      { status: 500 }
    )
  }
}
