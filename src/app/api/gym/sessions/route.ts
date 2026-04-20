import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** POST /api/gym/sessions
 * Body: { workoutId: string }
 *
 * Creates a WorkoutSession, then fetches all exercises + their previous
 * performance in a single round-trip so the client can start immediately.
 */
export async function POST(request: Request) {
  try {
    const { workoutId } = await request.json()

    if (!workoutId) {
      return NextResponse.json({ error: "workoutId required" }, { status: 400 })
    }

    // Create the session record
    const session = await db.workoutSession.create({
      data: { userId: DEMO_USER_ID, workoutId, startedAt: new Date() },
    })

    // Load exercises for this workout day
    const workoutExercises = await db.workoutExercise.findMany({
      where: { workoutId },
      orderBy: { order: "asc" },
      include: { exercise: true },
    })

    // For each exercise, find the most recent completed session that logged
    // working sets for it, then return those sets as "previous performance".
    const exercisesWithPrev = await Promise.all(
      workoutExercises.map(async (we) => {
        const prevSession = await db.workoutSession.findFirst({
          where: {
            userId: DEMO_USER_ID,
            completedAt: { not: null },
            id: { not: session.id },
            sets: {
              some: { exerciseId: we.exerciseId, isWarmup: false },
            },
          },
          orderBy: { completedAt: "desc" },
          include: {
            sets: {
              where: { exerciseId: we.exerciseId, isWarmup: false },
              orderBy: { setNumber: "asc" },
            },
          },
        })

        const prevSets = prevSession?.sets ?? []
        const topSetWeightKg =
          prevSets.length > 0 ? Math.max(...prevSets.map((s) => s.weightKg)) : 0
        const totalVolume = prevSets.reduce(
          (sum, s) => sum + s.weightKg * s.reps,
          0
        )

        let secondaryMuscles: string[] = []
        try {
          secondaryMuscles = JSON.parse(we.exercise.secondaryMuscles)
        } catch {}

        return {
          workoutExerciseId: we.id,
          exerciseId: we.exerciseId,
          name: we.exercise.name,
          primaryMuscle: we.exercise.primaryMuscle,
          secondaryMuscles,
          equipment: we.exercise.equipment,
          order: we.order,
          targetSets: we.targetSets,
          targetReps: we.targetReps,
          restSeconds: we.restSeconds,
          notes: we.notes ?? undefined,
          previousPerformance:
            prevSession && prevSets.length > 0
              ? {
                  sessionDate: prevSession.completedAt!.toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" }
                  ),
                  sets: prevSets.map((s) => ({
                    reps: s.reps,
                    weightKg: s.weightKg,
                    rpe: s.rpe ?? undefined,
                  })),
                  topSetWeightKg,
                  totalVolume,
                }
              : null,
        }
      })
    )

    return NextResponse.json({
      sessionId: session.id,
      exercises: exercisesWithPrev,
    })
  } catch (err) {
    console.error("[POST /api/gym/sessions]", err)
    return NextResponse.json({ error: "Failed to start session" }, { status: 500 })
  }
}
