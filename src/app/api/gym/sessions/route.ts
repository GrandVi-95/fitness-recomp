import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/**
 * Returns true when both sessions logged the same (weightKg, reps) for every
 * working set in order. This means the athlete consolidated at this weight and
 * is ready for progressive overload on the next session.
 */
function setsMatch(
  a: { reps: number; weightKg: number; durationSecs: number | null }[],
  b: { reps: number; weightKg: number; durationSecs: number | null }[],
): boolean {
  if (a.length === 0 || a.length !== b.length) return false
  return a.every(
    (s, i) =>
      s.weightKg === b[i].weightKg &&
      s.reps === b[i].reps &&
      (s.durationSecs ?? 0) === (b[i].durationSecs ?? 0),
  )
}

/** POST /api/gym/sessions
 * Body: { workoutId: string }
 *
 * Creates a WorkoutSession, then fetches all exercises + their last 2 sessions
 * of working sets so the client can auto-fill a smart baseline.
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

    // For each exercise, fetch the last 2 completed sessions with working sets.
    // We compare them to determine whether the athlete has consolidated at a
    // weight (isConfirmed = true → suggest same weight, signal "ready to increase")
    // or is still progressing (isConfirmed = false → suggest most-recent weight).
    const exercisesWithPrev = await Promise.all(
      workoutExercises.map(async (we) => {
        const prevSessions = await db.workoutSession.findMany({
          where: {
            userId: DEMO_USER_ID,
            completedAt: { not: null },
            id: { not: session.id },
            sets: {
              some: { exerciseId: we.exerciseId, isWarmup: false },
            },
          },
          orderBy: { completedAt: "desc" },
          take: 2,
          include: {
            sets: {
              where: { exerciseId: we.exerciseId, isWarmup: false },
              orderBy: { setNumber: "asc" },
            },
          },
        })

        const [latest, previous] = prevSessions
        const latestSets  = latest?.sets   ?? []
        const previousSets = previous?.sets ?? []

        const isConfirmed = setsMatch(latestSets, previousSets)

        const topSetWeightKg =
          latestSets.length > 0 ? Math.max(...latestSets.map((s) => s.weightKg)) : 0
        const topDurationSecs =
          latestSets.length > 0
            ? Math.max(...latestSets.map((s) => s.durationSecs ?? 0))
            : 0
        const totalVolume = latestSets.reduce(
          (sum, s) => sum + s.weightKg * s.reps,
          0,
        )

        // suggestedReps: first working set of the most recent session (reliable
        // anchor), or null when no history exists yet.
        const suggestedReps = latestSets[0]?.reps ?? null

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
          trackingType: we.exercise.trackingType,
          order: we.order,
          targetSets: we.targetSets,
          targetReps: we.targetReps,
          restSeconds: we.restSeconds,
          notes: we.notes ?? undefined,
          previousPerformance:
            latest && latestSets.length > 0
              ? {
                  sessionDate: latest.completedAt!.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  }),
                  sets: latestSets.map((s) => ({
                    reps: s.reps,
                    weightKg: s.weightKg,
                    rpe: s.rpe ?? undefined,
                    durationSecs: s.durationSecs ?? undefined,
                  })),
                  topSetWeightKg,
                  topDurationSecs,
                  totalVolume,
                }
              : null,
          // Baseline drives the auto-fill in the gym UI.
          // isConfirmed = true  → athlete did identical performance two sessions in a row
          // isConfirmed = false → most recent session is the best available anchor
          // Bodyweight (weight 0) and duration exercises anchor on reps/seconds,
          // so any prior working set qualifies as a baseline — not just weighted ones.
          baseline:
            latestSets.length > 0
              ? {
                  weightKg: topSetWeightKg,
                  reps: suggestedReps,
                  durationSecs: topDurationSecs > 0 ? topDurationSecs : null,
                  isConfirmed,
                }
              : null,
        }
      }),
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
