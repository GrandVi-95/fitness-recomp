import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"

/** POST /api/gym/sessions/[sessionId]/finish
 * Body: { fatigueLevel: number (1-5) }
 *
 * Marks the session as complete, calculates duration and total volume,
 * and returns a summary for the finish screen.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const { fatigueLevel, sleepHours } = await request.json()

    const session = await db.workoutSession.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Duration in minutes from session start to now
    const durationMins = session.startedAt
      ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60_000)
      : null

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

    // If user didn't rate fatigue, derive it from avg RPE (RPE 10 → fatigue 5)
    const resolvedFatigue =
      fatigueLevel ??
      (avgRpe != null ? Math.max(1, Math.min(5, Math.round(avgRpe / 2))) : null)

    await db.workoutSession.update({
      where: { id: sessionId },
      data: {
        completedAt: new Date(),
        durationMins,
        fatigueLevel: resolvedFatigue,
        ...(typeof sleepHours === "number" && sleepHours > 0
          ? { sleepHours: Math.round(sleepHours * 10) / 10 }
          : {}),
      },
    })

    revalidatePath("/dashboard")
    revalidatePath("/recovery")
    revalidatePath("/workouts")

    return NextResponse.json({
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
