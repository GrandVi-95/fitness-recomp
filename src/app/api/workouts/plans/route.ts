import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { optStr, readJsonBody, str, ValidationError } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

/** GET /api/workouts/plans
 * Returns all live WorkoutPlans for the demo user, including every workout day
 * and its exercises (with exercise metadata resolved from the Exercise table).
 * Archived plans/workouts (kept only for their session history) are excluded.
 */
export async function GET() {
  try {
    const rawPlans = await db.workoutPlan.findMany({
      where: { userId: DEMO_USER_ID, archivedAt: null },
      include: {
        workouts: {
          where: { archivedAt: null },
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
            superSetId: we.superSetId,
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
    let name: string
    let splitType: string
    try {
      const body = await readJsonBody<Record<string, unknown>>(request, 2_000)
      name = str(body?.name, "name", 100).trim()
      splitType = optStr(body?.splitType, "splitType", 30)?.trim() || "CUSTOM"
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    if (!name) {
      return NextResponse.json(
        { error: "שם התוכנית הוא שדה חובה" },
        { status: 400 },
      )
    }

    const plan = await db.workoutPlan.create({
      data: {
        userId: DEMO_USER_ID,
        name,
        splitType,
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
