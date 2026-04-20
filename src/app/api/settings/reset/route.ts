import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** POST /api/settings/reset
 *
 * Deletes all user-generated tracking data for the demo user while
 * preserving the User record, UserSettings, Exercise library, Food
 * dictionary, WorkoutPlan, Workout, and WorkoutExercise rows.
 *
 * Deletion order respects foreign-key constraints:
 *   SetLog → WorkoutSession → NutritionFoodItem → NutritionLog →
 *   BodyMetric → ProgressPhoto → User field reset
 */
export async function POST() {
  try {
    // ── 1. Delete SetLog rows belonging to this user's sessions ───────────
    const sessionRows = await db.workoutSession.findMany({
      where: { userId: DEMO_USER_ID },
      select: { id: true },
    })
    const sessionIds = sessionRows.map((s) => s.id)

    if (sessionIds.length > 0) {
      await db.setLog.deleteMany({
        where: { sessionId: { in: sessionIds } },
      })
    }

    // ── 2. Delete WorkoutSession rows ──────────────────────────────────────
    const { count: sessions } = await db.workoutSession.deleteMany({
      where: { userId: DEMO_USER_ID },
    })

    // ── 3. Delete NutritionFoodItem rows belonging to this user's logs ─────
    const logRows = await db.nutritionLog.findMany({
      where: { userId: DEMO_USER_ID },
      select: { id: true },
    })
    const logIds = logRows.map((l) => l.id)

    if (logIds.length > 0) {
      await db.nutritionFoodItem.deleteMany({
        where: { logId: { in: logIds } },
      })
    }

    // ── 4. Delete NutritionLog rows ────────────────────────────────────────
    const { count: nutritionLogs } = await db.nutritionLog.deleteMany({
      where: { userId: DEMO_USER_ID },
    })

    // ── 5. Delete BodyMetric rows ──────────────────────────────────────────
    const { count: bodyMetrics } = await db.bodyMetric.deleteMany({
      where: { userId: DEMO_USER_ID },
    })

    // ── 6. Delete ProgressPhoto rows ──────────────────────────────────────
    await db.progressPhoto.deleteMany({
      where: { userId: DEMO_USER_ID },
    })

    return NextResponse.json({
      ok: true,
      deleted: { sessions, nutritionLogs, bodyMetrics },
    })
  } catch (err) {
    console.error("[POST /api/settings/reset]", err)
    return NextResponse.json({ error: "שגיאה באיפוס הנתונים" }, { status: 500 })
  }
}
