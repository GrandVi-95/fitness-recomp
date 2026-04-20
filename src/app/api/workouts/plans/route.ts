import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/workouts/plans
 * Returns all WorkoutPlans for the demo user, including every workout day
 * and its exercises (with exercise metadata resolved from the Exercise table).
 */
export async function GET() {
  try {
    const rawPlans = await db.workoutPlan.findMany({
      where: { userId: DEMO_USER_ID },
      include: {
        workouts: {
          orderBy: { order: "asc" },
          include: {
            exercises: {
              orderBy: { order: "asc" },
              include: {
                exercise: {
                  select: {
                    name: true,
                    primaryMuscle: true,
                    equipment: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const plans = rawPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      splitType: plan.splitType,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      workouts: plan.workouts.map((workout) => {
        let muscleGroups: string[] = []
        try {
          muscleGroups = JSON.parse(workout.muscleGroups) as string[]
        } catch {}

        return {
          id: workout.id,
          name: workout.name,
          dayLabel: workout.dayLabel,
          order: workout.order,
          muscleGroups,
          exercises: workout.exercises.map((we) => ({
            id: we.id,
            exerciseId: we.exerciseId,
            name: we.exercise.name,
            primaryMuscle: we.exercise.primaryMuscle,
            equipment: we.exercise.equipment,
            order: we.order,
            targetSets: we.targetSets,
            targetReps: we.targetReps,
            restSeconds: we.restSeconds,
            notes: we.notes,
          })),
        }
      }),
    }))

    return NextResponse.json({ plans })
  } catch (err) {
    console.error("[GET /api/workouts/plans]", err)
    return NextResponse.json(
      { error: "שגיאה בטעינת תוכניות אימון" },
      { status: 500 },
    )
  }
}

/** POST /api/workouts/plans
 * Body: { name: string, splitType?: string }
 * Creates a new WorkoutPlan for the demo user.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string
      splitType?: string
    }

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "שם התוכנית הוא שדה חובה" },
        { status: 400 },
      )
    }

    const plan = await db.workoutPlan.create({
      data: {
        userId: DEMO_USER_ID,
        name: body.name.trim(),
        splitType: body.splitType ?? "CUSTOM",
        isActive: true,
      },
    })

    return NextResponse.json({ planId: plan.id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/workouts/plans]", err)
    return NextResponse.json(
      { error: "שגיאה ביצירת תוכנית אימון" },
      { status: 500 },
    )
  }
}
