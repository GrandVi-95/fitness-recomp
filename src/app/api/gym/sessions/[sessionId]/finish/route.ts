import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { optInt, optNum, readJsonBody, ValidationError } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

/** POST /api/gym/sessions/[sessionId]/finish
 * Body: { fatigueLevel?: number (1-5), sleepHours?: number }
 *
 * Marks the session as complete, calculates duration and total volume,
 * and returns a summary for the finish screen.
 *
 * Idempotent: finishing an already-completed session never rewrites
 * completedAt/durationMins — it returns the existing values. fatigueLevel is
 * ONLY the user's explicit post-session rating (null when not given); it is
 * never derived from set RPE.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params

    let fatigueLevel: number | undefined
    let sleepHours: number | undefined
    try {
      const body = await readJsonBody<Record<string, unknown>>(request, 2_000)
      fatigueLevel = optInt(body?.fatigueLevel, "fatigueLevel", 1, 5)
      const sleep = optNum(body?.sleepHours, "sleepHours", 0, 24)
      sleepHours = sleep != null && sleep > 0 ? Math.round(sleep * 10) / 10 : undefined
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    const session = await db.workoutSession.findFirst({
      where: { id: sessionId, userId: DEMO_USER_ID },
    })

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    let durationMins = session.durationMins
    let alreadyCompleted = session.completedAt != null

    if (!alreadyCompleted) {
      // Duration in minutes from session start to now
      const computed = Math.round((Date.now() - session.startedAt.getTime()) / 60_000)
      // Conditional update — a concurrent duplicate finish can't overwrite it.
      const { count } = await db.workoutSession.updateMany({
        where: { id: sessionId, userId: DEMO_USER_ID, completedAt: null },
        data: {
          completedAt: new Date(),
          durationMins: computed,
          fatigueLevel: fatigueLevel ?? null,
          ...(sleepHours != null ? { sleepHours } : {}),
        },
      })
      if (count === 1) {
        durationMins = computed
      } else {
        alreadyCompleted = true
        const fresh = await db.workoutSession.findUnique({ where: { id: sessionId } })
        durationMins = fresh?.durationMins ?? null
      }
    } else if (
      (fatigueLevel != null && session.fatigueLevel == null) ||
      (sleepHours != null && session.sleepHours == null)
    ) {
      // Retry of a finish that already landed: only fill in answers that are
      // still missing — never touch completedAt/duration.
      await db.workoutSession.update({
        where: { id: sessionId },
        data: {
          ...(fatigueLevel != null && session.fatigueLevel == null ? { fatigueLevel } : {}),
          ...(sleepHours != null && session.sleepHours == null ? { sleepHours } : {}),
        },
      })
    }

    // Aggregate all logged sets
    const allSets = await db.setLog.findMany({ where: { sessionId } })
    const workingSets = allSets.filter((s) => !s.isWarmup)

    const totalVolume = workingSets.reduce(
      (sum, s) => sum + s.weightKg * s.reps,
      0
    )

    const setsWithRpe = workingSets.filter((s) => s.rpe != null)
    const avgRpe =
      setsWithRpe.length > 0
        ? setsWithRpe.reduce((sum, s) => sum + (s.rpe ?? 0), 0) /
          setsWithRpe.length
        : null

    revalidatePath("/dashboard")
    revalidatePath("/recovery")
    revalidatePath("/workouts")

    return NextResponse.json({
      ok: true,
      alreadyCompleted,
      durationMins,
      totalVolume: Math.round(totalVolume),
      workingSetCount: workingSets.length,
      warmupSetCount: allSets.length - workingSets.length,
      avgRpe: avgRpe != null ? Math.round(avgRpe * 10) / 10 : null,
    })
  } catch (err) {
    console.error("[POST /api/gym/sessions/[id]/finish]", err)
    return NextResponse.json({ error: "Failed to finish session" }, { status: 500 })
  }
}
