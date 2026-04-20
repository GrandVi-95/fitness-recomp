import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// TODO: replace with real auth session user ID
const DEMO_USER_ID = "demo-user"

/** GET /api/gym/workouts
 * Returns the user's active workout plan with each day + last session info.
 */
export async function GET() {
  try {
    const plan = await db.workoutPlan.findFirst({
      where: { userId: DEMO_USER_ID, isActive: true },
      include: {
        workouts: {
          orderBy: { order: "asc" },
          include: {
            exercises: { select: { id: true } },
            sessions: {
              where: {
                userId: DEMO_USER_ID,
                completedAt: { not: null },
              },
              orderBy: { completedAt: "desc" },
              take: 1,
              select: { completedAt: true, durationMins: true },
            },
          },
        },
      },
    })

    if (!plan) {
      return NextResponse.json({ workouts: [], planName: null })
    }

    const workouts = plan.workouts.map((w) => {
      let muscleGroups: string[] = []
      try {
        muscleGroups = JSON.parse(w.muscleGroups)
      } catch {}

      const lastSession = w.sessions[0] ?? null

      return {
        id: w.id,
        name: w.name,
        dayLabel: w.dayLabel,
        muscleGroups,
        exerciseCount: w.exercises.length,
        lastSession: lastSession
          ? {
              date: lastSession.completedAt!.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }),
              durationMins: lastSession.durationMins,
            }
          : null,
      }
    })

    return NextResponse.json({ workouts, planName: plan.name })
  } catch (err) {
    console.error("[GET /api/gym/workouts]", err)
    return NextResponse.json({ error: "Failed to load workouts" }, { status: 500 })
  }
}
