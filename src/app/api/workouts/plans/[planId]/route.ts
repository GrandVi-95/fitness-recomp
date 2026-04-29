import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

// ─── Input types ────────────────────────────────────────────────────────────

interface ExerciseInput {
  id?: string       // present → update existing WorkoutExercise row
  exerciseId: string
  order: number
  targetSets?: number
  targetReps?: string
  restSeconds?: number
}

interface WorkoutInput {
  id?: string       // present → update existing Workout row
  name: string
  dayLabel: string
  order: number
  muscleGroups?: string[]
  exercises?: ExerciseInput[]
}

interface PutBody {
  name?: string
  splitType?: string
  isActive?: boolean
  workouts?: WorkoutInput[]
}

// ─── PUT /api/workouts/plans/[planId] ───────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const { planId } = await params

    // 1. Verify the plan belongs to DEMO_USER_ID
    const existingPlan = await db.workoutPlan.findFirst({
      where: { id: planId, userId: DEMO_USER_ID },
    })
    if (!existingPlan) {
      return NextResponse.json(
        { error: "תוכנית אימון לא נמצאה" },
        { status: 404 },
      )
    }

    const body = (await request.json()) as PutBody

    // 2. Update top-level plan fields if provided
    const planUpdateData: {
      name?: string
      splitType?: string
      isActive?: boolean
    } = {}
    if (body.name !== undefined) planUpdateData.name = body.name
    if (body.splitType !== undefined) planUpdateData.splitType = body.splitType
    if (body.isActive !== undefined) planUpdateData.isActive = body.isActive

    if (Object.keys(planUpdateData).length > 0) {
      await db.workoutPlan.update({
        where: { id: planId },
        data: planUpdateData,
      })
    }

    // 3. Sync workouts if provided
    if (body.workouts !== undefined) {
      const incomingWorkouts = body.workouts

      // a. Fetch all existing workouts for this plan (with their exercises)
      const existingWorkouts = await db.workout.findMany({
        where: { planId },
        include: { exercises: { select: { id: true } } },
      })

      // b. Delete workouts whose id is NOT in the incoming array
      const incomingWorkoutIds = new Set(
        incomingWorkouts.filter((w) => w.id).map((w) => w.id as string),
      )
      const workoutsToDelete = existingWorkouts.filter(
        (ew) => !incomingWorkoutIds.has(ew.id),
      )
      if (workoutsToDelete.length > 0) {
        await db.workout.deleteMany({
          where: { id: { in: workoutsToDelete.map((w) => w.id) } },
        })
      }

      // c. Upsert each incoming workout
      for (const workoutInput of incomingWorkouts) {
        const muscleGroupsJson = JSON.stringify(
          workoutInput.muscleGroups ?? [],
        )

        let workoutId: string

        if (workoutInput.id) {
          // Update existing workout
          await db.workout.update({
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
          // Create new workout
          const newWorkout = await db.workout.create({
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

        // d. Sync exercises for this workout
        const incomingExercises = workoutInput.exercises ?? []

        // Fetch existing WorkoutExercises for this workout
        const existingExercises = await db.workoutExercise.findMany({
          where: { workoutId },
          select: { id: true },
        })

        // Delete WorkoutExercises whose id is NOT in the incoming array
        const incomingExerciseIds = new Set(
          incomingExercises
            .filter((e) => e.id)
            .map((e) => e.id as string),
        )
        const exercisesToDelete = existingExercises.filter(
          (ee) => !incomingExerciseIds.has(ee.id),
        )
        if (exercisesToDelete.length > 0) {
          await db.workoutExercise.deleteMany({
            where: { id: { in: exercisesToDelete.map((e) => e.id) } },
          })
        }

        // Upsert each incoming exercise
        for (const exInput of incomingExercises) {
          if (exInput.id) {
            // Update existing WorkoutExercise
            await db.workoutExercise.update({
              where: { id: exInput.id },
              data: {
                exerciseId: exInput.exerciseId,
                order: exInput.order,
                targetSets: exInput.targetSets,
                targetReps: exInput.targetReps,
                restSeconds: exInput.restSeconds,
              },
            })
          } else {
            // Create new WorkoutExercise
            await db.workoutExercise.create({
              data: {
                workoutId,
                exerciseId: exInput.exerciseId,
                order: exInput.order,
                targetSets: exInput.targetSets ?? 3,
                targetReps: exInput.targetReps ?? "8-12",
                restSeconds: exInput.restSeconds ?? 90,
              },
            })
          }
        }
      }
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
      where: { id: planId, userId: DEMO_USER_ID },
    })
    if (!existingPlan) {
      return NextResponse.json(
        { error: "תוכנית אימון לא נמצאה" },
        { status: 404 },
      )
    }

    // The DB handles the full cascade:
    // WorkoutPlan → Workout → WorkoutExercise
    //                       → WorkoutSession → SetLog
    await db.workoutPlan.delete({ where: { id: planId } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/workouts/plans/[planId]]", err)
    return NextResponse.json(
      { error: "שגיאה במחיקת תוכנית אימון" },
      { status: 500 },
    )
  }
}
