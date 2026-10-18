import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** POST /api/settings/reset
 *
 * Contract: a FRESH COACHING BASELINE. Deletes all tracking data (sessions,
 * sets, nutrition, body metrics, photos, day plans, check-ins) AND resets
 * the calorie engine's state (offset, creatine calibration, start weight /
 * fat-free mass), so the next check-in starts from a clean slate.
 * Preserves the User record, profile settings, Exercise library, Food
 * dictionary and workout plans. All-or-nothing (one transaction).
 */
export async function POST() {
  try {
    const deleted = await db.$transaction(async (tx) => {
      // SetLog and NutritionFoodItem rows cascade from their parents.
      const { count: sessions } = await tx.workoutSession.deleteMany({ where: { userId: DEMO_USER_ID } })
      const { count: nutritionLogs } = await tx.nutritionLog.deleteMany({ where: { userId: DEMO_USER_ID } })
      const { count: bodyMetrics } = await tx.bodyMetric.deleteMany({ where: { userId: DEMO_USER_ID } })
      await tx.progressPhoto.deleteMany({ where: { userId: DEMO_USER_ID } })
      await tx.dayPlan.deleteMany({ where: { userId: DEMO_USER_ID } })
      const { count: checkIns } = await tx.checkIn.deleteMany({ where: { userId: DEMO_USER_ID } })

      // Workouts that were archived only to protect history have none left.
      await tx.workout.deleteMany({
        where: { archivedAt: { not: null }, plan: { userId: DEMO_USER_ID } },
      })
      await tx.workoutPlan.deleteMany({ where: { userId: DEMO_USER_ID, archivedAt: { not: null } } })

      await tx.userSettings.updateMany({
        where: { userId: DEMO_USER_ID },
        data: {
          calorieAdjustmentOffset: 0,
          creatineCalibrationActive: false,
          creatineStartedAt: null,
          lastReportWeekStart: null,
        },
      })
      await tx.user.update({
        where: { id: DEMO_USER_ID },
        data: { startWeight: null, startFatFreeMass: null },
      })
      return { sessions, nutritionLogs, bodyMetrics, checkIns }
    })

    revalidatePath("/dashboard")
    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error("[POST /api/settings/reset]", err)
    return NextResponse.json({ error: "שגיאה באיפוס הנתונים" }, { status: 500 })
  }
}
