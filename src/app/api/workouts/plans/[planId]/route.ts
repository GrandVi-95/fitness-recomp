import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  int,
  optBool,
  optInt,
  optStr,
  readJsonBody,
  str,
  ValidationError,
} from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

// ─── Input types ────────────────────────────────────────────────────────────

interface ExerciseInput {
  id?: string       // present → update existing WorkoutExercise row
  exerciseId: string
  order: number
  targetSets?: number
  targetReps?: string
  restSeconds?: number
  superSetId: string | null
}

interface WorkoutInput {
  id?: string       // present → update existing Workout row
  name: string
  dayLabel: string
  order: number
  muscleGroups: string[]
  exercises: ExerciseInput[]
}

interface PutBody {
  name?: string
  splitType?: string
  isActive?: boolean
  workouts?: WorkoutInput[]
}

// ─── Validation (whole body, before any write) ──────────────────────────────

const MAX_WORKOUTS = 30
const MAX_EXERCISES_PER_WORKOUT = 50

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function parseExercise(raw: unknown, f: string): ExerciseInput {
  if (!isObj(raw)) throw new ValidationError(`${f}: expected an object`)
  const superSetId = raw.superSetId
  if (superSetId !== undefined && superSetId !== null && typeof superSetId !== "string") {
    throw new ValidationError(`${f}.superSetId: expected a string or null`)
  }
  return {
    id: optStr(raw.id, `${f}.id`, 64) || undefined,
    exerciseId: str(raw.exerciseId, `${f}.exerciseId`, 64, 1),
    order: int(raw.order, `${f}.order`, 0, 1000),
    targetSets: optInt(raw.targetSets, `${f}.targetSets`, 1, 20),
    targetReps: optStr(raw.targetReps, `${f}.targetReps`, 20)?.trim() || undefined,
    restSeconds: optInt(raw.restSeconds, `${f}.restSeconds`, 0, 900),
    superSetId: superSetId ? str(superSetId, `${f}.superSetId`, 64) : null,
  }
}

function parseWorkout(raw: unknown, f: string): WorkoutInput {
  if (!isObj(raw)) throw new ValidationError(`${f}: expected an object`)
  const muscleGroups = raw.muscleGroups ?? []
  if (!Array.isArray(muscleGroups) || muscleGroups.length > 20) {
    throw new ValidationError(`${f}.muscleGroups: expected an array (max 20)`)
  }
  const exercises = raw.exercises ?? []
  if (!Array.isArray(exercises) || exercises.length > MAX_EXERCISES_PER_WORKOUT) {
    throw new ValidationError(`${f}.exercises: expected an array (max ${MAX_EXERCISES_PER_WORKOUT})`)
  }
  return {
    id: optStr(raw.id, `${f}.id`, 64) || undefined,
    name: str(raw.name, `${f}.name`, 100, 1),
    dayLabel: str(raw.dayLabel, `${f}.dayLabel`, 100, 1),
    order: int(raw.order, `${f}.order`, 0, 1000),
    muscleGroups: muscleGroups.map((m, i) => str(m, `${f}.muscleGroups[${i}]`, 30)),
    exercises: exercises.map((e, i) => parseExercise(e, `${f}.exercises[${i}]`)),
  }
}

function parsePutBody(raw: unknown): PutBody {
  if (!isObj(raw)) throw new ValidationError("body: expected an object")
  const body: PutBody = {}
  if (raw.name !== undefined) {
    body.name = str(raw.name, "name", 100).trim()
    if (!body.name) throw new ValidationError("name: required")
  }
  if (raw.splitType !== undefined) body.splitType = str(raw.splitType, "splitType", 30, 1)
  body.isActive = optBool(raw.isActive, "isActive")
  if (raw.workouts !== undefined) {
    if (!Array.isArray(raw.workouts) || raw.workouts.length > MAX_WORKOUTS) {
      throw new ValidationError(`workouts: expected an array (max ${MAX_WORKOUTS})`)
    }
    body.workouts = raw.workouts.map((w, i) => parseWorkout(w, `workouts[${i}]`))

    // The same row id can't appear twice in one payload.
    const wIds = body.workouts.flatMap((w) => (w.id ? [w.id] : []))
    const eIds = body.workouts.flatMap((w) => w.exercises.flatMap((e) => (e.id ? [e.id] : [])))
    if (new Set(wIds).size !== wIds.length || new Set(eIds).size !== eIds.length) {
      throw new ValidationError("workouts: duplicate ids")
    }
  }
  return body
}

// ─── PUT /api/workouts/plans/[planId] ───────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const { planId } = await params

    // 1. Validate the whole body first
    let body: PutBody
    try {
      body = parsePutBody(await readJsonBody(request, 200_000))
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    // 2. Verify the plan belongs to DEMO_USER_ID (and isn't archived)
    const existingPlan = await db.workoutPlan.findFirst({
      where: { id: planId, userId: DEMO_USER_ID, archivedAt: null },
    })
    if (!existingPlan) {
      return NextResponse.json(
        { error: "תוכנית אימון לא נמצאה" },
        { status: 404 },
      )
    }

    // Every referenced Exercise must exist (otherwise the FK write would 500).
    if (body.workouts) {
      const exIds = [...new Set(body.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))]
      if (exIds.length > 0) {
        const found = await db.exercise.count({ where: { id: { in: exIds } } })
        if (found !== exIds.length) {
          return NextResponse.json({ error: "אחד התרגילים לא נמצא" }, { status: 400 })
        }
      }
    }

    // 3. Apply everything atomically — any failure rolls the whole sync back.
    try {
      await db.$transaction(
        async (tx) => {
          const planUpdateData: { name?: string; splitType?: string; isActive?: boolean } = {}
          if (body.name !== undefined) planUpdateData.name = body.name
          if (body.splitType !== undefined) planUpdateData.splitType = body.splitType
          if (body.isActive !== undefined) planUpdateData.isActive = body.isActive
          if (Object.keys(planUpdateData).length > 0) {
            await tx.workoutPlan.update({ where: { id: planId }, data: planUpdateData })
          }

          if (body.workouts === undefined) return
          const incomingWorkouts = body.workouts

          // a. Live workouts of THIS plan, with their exercise row ids and
          //    whether they have any logged history.
          const existingWorkouts = await tx.workout.findMany({
            where: { planId, archivedAt: null },
            include: {
              exercises: { select: { id: true } },
              _count: { select: { sessions: true } },
            },
          })
          const existingById = new Map(existingWorkouts.map((w) => [w.id, w]))

          // b. Ownership: only ids that actually belong to this plan/workout.
          for (const w of incomingWorkouts) {
            if (w.id && !existingById.has(w.id)) {
              throw new ValidationError(`workout ${w.id} does not belong to this plan`)
            }
            const ownExIds = new Set(w.id ? existingById.get(w.id)!.exercises.map((e) => e.id) : [])
            for (const e of w.exercises) {
              if (e.id && !ownExIds.has(e.id)) {
                throw new ValidationError(`exercise row ${e.id} does not belong to its workout`)
              }
            }
          }

          // c. Workouts omitted from the payload: archive if they have
          //    history (sessions are never lost), hard-delete otherwise.
          const incomingWorkoutIds = new Set(incomingWorkouts.flatMap((w) => (w.id ? [w.id] : [])))
          const removed = existingWorkouts.filter((ew) => !incomingWorkoutIds.has(ew.id))
          const toArchive = removed.filter((w) => w._count.sessions > 0).map((w) => w.id)
          const toDelete = removed.filter((w) => w._count.sessions === 0).map((w) => w.id)
          if (toArchive.length > 0) {
            await tx.workout.updateMany({
              where: { id: { in: toArchive } },
              data: { archivedAt: new Date() },
            })
          }
          if (toDelete.length > 0) {
            await tx.workout.deleteMany({ where: { id: { in: toDelete } } })
          }

          // d. Upsert each incoming workout + sync its exercises
          for (const workoutInput of incomingWorkouts) {
            const muscleGroupsJson = JSON.stringify(workoutInput.muscleGroups)
            let workoutId: string

            if (workoutInput.id) {
              await tx.workout.update({
                where: { id: workoutInput.id },
                data: {
                  name: workoutInput.name,
                  dayLabel: workoutInput.dayLabel,
                  order: workoutInput.order,
                  muscleGroups: muscleGroupsJson,
                },
              })
              workoutId = workoutInput.id
            } else {
              const newWorkout = await tx.workout.create({
                data: {
                  planId,
                  name: workoutInput.name,
                  dayLabel: workoutInput.dayLabel,
                  order: workoutInput.order,
                  muscleGroups: muscleGroupsJson,
                },
              })
              workoutId = newWorkout.id
            }

            const incomingExercises = workoutInput.exercises
            const existingExIds = workoutInput.id
              ? existingById.get(workoutInput.id)!.exercises.map((e) => e.id)
              : []

            // Delete WorkoutExercises whose id is NOT in the incoming array
            // (templates only — logged SetLogs are keyed by exerciseId and stay).
            const keepIds = new Set(incomingExercises.flatMap((e) => (e.id ? [e.id] : [])))
            const exercisesToDelete = existingExIds.filter((id) => !keepIds.has(id))
            if (exercisesToDelete.length > 0) {
              await tx.workoutExercise.deleteMany({
                where: { id: { in: exercisesToDelete }, workoutId },
              })
            }

            for (const exInput of incomingExercises) {
              if (exInput.id) {
                await tx.workoutExercise.update({
                  where: { id: exInput.id },
                  data: {
                    exerciseId: exInput.exerciseId,
                    order: exInput.order,
                    targetSets: exInput.targetSets,
                    targetReps: exInput.targetReps,
                    restSeconds: exInput.restSeconds,
                    superSetId: exInput.superSetId,
                  },
                })
              } else {
                await tx.workoutExercise.create({
                  data: {
                    workoutId,
                    exerciseId: exInput.exerciseId,
                    order: exInput.order,
                    targetSets: exInput.targetSets ?? 3,
                    targetReps: exInput.targetReps ?? "8-12",
                    restSeconds: exInput.restSeconds ?? 90,
                    superSetId: exInput.superSetId,
                  },
                })
              }
            }
          }
        },
        { timeout: 20_000, maxWait: 10_000 },
      )
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PUT /api/workouts/plans/[planId]]", err)
    return NextResponse.json(
      { error: "שגיאה בעדכון תוכנית אימון" },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/workouts/plans/[planId] ────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const { planId } = await params

    // Verify plan belongs to DEMO_USER_ID before deleting
    const existingPlan = await db.workoutPlan.findFirst({
      where: { id: planId, userId: DEMO_USER_ID, archivedAt: null },
    })
    if (!existingPlan) {
      return NextResponse.json(
        { error: "תוכנית אימון לא נמצאה" },
        { status: 404 },
      )
    }

    // Plans with logged history are ARCHIVED (plan + its workouts), never
    // deleted — completed sessions and their sets must survive. Plans with
    // no history are hard-deleted (Workout → WorkoutExercise cascade).
    const archived = await db.$transaction(async (tx) => {
      const sessionCount = await tx.workoutSession.count({
        where: { workout: { planId } },
      })
      if (sessionCount > 0) {
        const now = new Date()
        await tx.workoutPlan.update({
          where: { id: planId },
          data: { archivedAt: now, isActive: false },
        })
        await tx.workout.updateMany({
          where: { planId, archivedAt: null },
          data: { archivedAt: now },
        })
        return true
      }
      await tx.workoutPlan.delete({ where: { id: planId } })
      return false
    })

    return NextResponse.json({ ok: true, archived })
  } catch (err) {
    console.error("[DELETE /api/workouts/plans/[planId]]", err)
    return NextResponse.json(
      { error: "שגיאה במחיקת תוכנית אימון" },
      { status: 500 },
    )
  }
}
