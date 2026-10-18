import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { APP_TIME_ZONE } from "@/lib/time"
import { readJsonBody, str, ValidationError } from "@/lib/validate"
import { computeProgression, parseMuscleList, pickTopSet } from "@/lib/training"

const DEMO_USER_ID = "demo-user"

// How many recent completed sessions to scan in one batched history query.
// Exercises of one workout day usually appear together, so their latest
// session is almost always inside this window; misses fall back per exercise.
const HISTORY_SESSION_WINDOW = 30

type HistorySet = {
  exerciseId: string
  setNumber: number
  reps: number
  weightKg: number
  rpe: number | null
  durationSecs: number | null
}
type HistorySession = { id: string; completedAt: Date | null; sets: HistorySet[] }

/** POST /api/gym/sessions
 * Body: { workoutId: string }
 *
 * Creates a WorkoutSession for a (non-archived) workout in the user's plan,
 * then returns each exercise with its most recent working sets, a baseline
 * (top set actually performed) and a double-progression suggestion.
 */
export async function POST(request: Request) {
  try {
    let workoutId: string
    try {
      const body = await readJsonBody<{ workoutId?: unknown }>(request, 2_000)
      workoutId = str(body?.workoutId, "workoutId", 64, 1)
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    // Ownership: the workout must be live and belong to one of the user's plans.
    const workout = await db.workout.findFirst({
      where: {
        id: workoutId,
        archivedAt: null,
        plan: { userId: DEMO_USER_ID, archivedAt: null },
      },
      select: { id: true },
    })
    if (!workout) {
      return NextResponse.json({ error: "Workout not found" }, { status: 404 })
    }

    const session = await db.workoutSession.create({
      data: { userId: DEMO_USER_ID, workoutId, startedAt: new Date() },
    })

    // Load exercises for this workout day
    const workoutExercises = await db.workoutExercise.findMany({
      where: { workoutId },
      orderBy: { order: "asc" },
      include: { exercise: true },
    })
    const exerciseIds = [...new Set(workoutExercises.map((we) => we.exerciseId))]

    // ── History: ONE batched query for every exercise, grouped in memory ──
    // Sessions of archived workouts are included on purpose (history is kept).
    const historySelect = {
      id: true,
      completedAt: true,
      sets: {
        where: { exerciseId: { in: exerciseIds }, isWarmup: false },
        orderBy: { setNumber: "asc" as const },
        select: {
          exerciseId: true,
          setNumber: true,
          reps: true,
          weightKg: true,
          rpe: true,
          durationSecs: true,
        },
      },
    }
    const recent: HistorySession[] =
      exerciseIds.length === 0
        ? []
        : await db.workoutSession.findMany({
            where: {
              userId: DEMO_USER_ID,
              completedAt: { not: null },
              id: { not: session.id },
              sets: { some: { exerciseId: { in: exerciseIds }, isWarmup: false } },
            },
            orderBy: { completedAt: "desc" },
            take: HISTORY_SESSION_WINDOW,
            select: historySelect,
          })

    // exerciseId → its sets in the most recent session that logged it
    const latestByExercise = new Map<string, { session: HistorySession; sets: HistorySet[] }>()
    for (const s of recent) {
      const byEx = new Map<string, HistorySet[]>()
      for (const set of s.sets) {
        const list = byEx.get(set.exerciseId) ?? []
        list.push(set)
        byEx.set(set.exerciseId, list)
      }
      for (const [exId, sets] of byEx) {
        if (!latestByExercise.has(exId)) latestByExercise.set(exId, { session: s, sets })
      }
    }

    // Rare fallback: an exercise whose last appearance is older than the window.
    const missing = exerciseIds.filter((id) => !latestByExercise.has(id))
    if (missing.length > 0 && recent.length === HISTORY_SESSION_WINDOW) {
      const older = await Promise.all(
        missing.map((exerciseId) =>
          db.workoutSession.findFirst({
            where: {
              userId: DEMO_USER_ID,
              completedAt: { not: null },
              id: { not: session.id },
              sets: { some: { exerciseId, isWarmup: false } },
            },
            orderBy: { completedAt: "desc" },
            select: {
              ...historySelect,
              sets: { ...historySelect.sets, where: { exerciseId, isWarmup: false } },
            },
          }),
        ),
      )
      older.forEach((s, i) => {
        if (s && s.sets.length > 0) latestByExercise.set(missing[i], { session: s, sets: s.sets })
      })
    }

    const exercisesWithPrev = workoutExercises.map((we) => {
      const latest = latestByExercise.get(we.exerciseId)
      const latestSets = latest?.sets ?? []

      // Baseline = the top set actually performed (heaviest; ties → most
      // reps) with ITS OWN reps — never a weight/reps combo from two sets.
      const topSet = pickTopSet(latestSets)
      const topDurationSecs =
        latestSets.length > 0 ? Math.max(...latestSets.map((s) => s.durationSecs ?? 0)) : 0
      const totalVolume = latestSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)

      const progression = computeProgression({
        targetReps: we.targetReps,
        equipment: we.exercise.equipment,
        trackingType: we.exercise.trackingType,
        sets: latestSets,
        targetSets: we.targetSets,
      })

      return {
        workoutExerciseId: we.id,
        exerciseId: we.exerciseId,
        name: we.exercise.name,
        primaryMuscle: we.exercise.primaryMuscle,
        secondaryMuscles: parseMuscleList(we.exercise.secondaryMuscles),
        equipment: we.exercise.equipment,
        trackingType: we.exercise.trackingType,
        order: we.order,
        targetSets: we.targetSets,
        targetReps: we.targetReps,
        restSeconds: we.restSeconds,
        notes: we.notes ?? undefined,
        superSetId: we.superSetId ?? undefined,
        previousPerformance:
          latest && latestSets.length > 0 && topSet
            ? {
                sessionDate: latest.session.completedAt!.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: APP_TIME_ZONE,
                }),
                sets: latestSets.map((s) => ({
                  reps: s.reps,
                  weightKg: s.weightKg,
                  rpe: s.rpe ?? undefined,
                  durationSecs: s.durationSecs ?? undefined,
                })),
                topSetWeightKg: topSet.weightKg,
                topSetReps: topSet.reps,
                topDurationSecs,
                totalVolume,
              }
            : null,
        // Baseline: last real top set. Bodyweight (weight 0) and duration
        // exercises anchor on reps/seconds, so any prior working set qualifies.
        baseline: topSet
          ? {
              weightKg: topSet.weightKg,
              reps: topSet.reps,
              durationSecs: topDurationSecs > 0 ? topDurationSecs : null,
            }
          : null,
        // Double progression: { ready, suggestedWeightKg, suggestedReps, reason }
        // — null for AMRAP / free-text targets or when there is no history.
        progression,
      }
    })

    return NextResponse.json({
      sessionId: session.id,
      exercises: exercisesWithPrev,
    })
  } catch (err) {
    console.error("[POST /api/gym/sessions]", err)
    return NextResponse.json({ error: "Failed to start session" }, { status: 500 })
  }
}
