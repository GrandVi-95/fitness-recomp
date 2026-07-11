import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { HOME_WORKOUTS } from "@/lib/homeWorkouts"

// TODO: replace with real auth session user ID
const DEMO_USER_ID = "demo-user"

/**
 * Idempotent lazy seed: if the active plan has no home workouts yet, create the
 * three home alternatives (A/B/C) with their own dedicated Exercise rows.
 * Exercises upsert by unique name, workouts are checked by dayLabel — calling
 * this twice adds nothing.
 */
async function ensureHomeWorkouts(planId: string, existingDayLabels: Set<string>) {
  const missing = HOME_WORKOUTS.filter((t) => !existingDayLabels.has(t.dayLabel))
  if (missing.length === 0) return false

  // Base new home workouts' order after the current maximum
  const maxOrder = await db.workout.aggregate({
    where: { planId },
    _max: { order: true },
  })
  let order = (maxOrder._max.order ?? 0) + 1

  for (const template of missing) {
    const exerciseIds: string[] = []
    for (const ex of template.exercises) {
      const row = await db.exercise.upsert({
        where:  { name: ex.name },
        create: {
          name:          ex.name,
          primaryMuscle: ex.primaryMuscle,
          equipment:     ex.equipment,
          trackingType:  ex.trackingType,
          isCompound:    ex.isCompound,
        },
        // Keep tracking metadata in sync if the template evolves
        update: { trackingType: ex.trackingType, equipment: ex.equipment },
      })
      exerciseIds.push(row.id)
    }

    await db.workout.create({
      data: {
        planId,
        name:         template.name,
        dayLabel:     template.dayLabel,
        order:        order++,
        environment:  "home",
        muscleGroups: JSON.stringify(template.muscleGroups),
        exercises: {
          create: template.exercises.map((ex, i) => ({
            exerciseId:  exerciseIds[i],
            order:       i + 1,
            targetSets:  ex.targetSets,
            targetReps:  ex.targetReps,
            restSeconds: ex.restSeconds,
          })),
        },
      },
    })
  }
  return true
}

/** GET /api/gym/workouts
 * Returns the user's active workout plan with each day + last session info.
 * Each workout carries its `environment` ("gym" | "home") so the client
 * toggle can filter without a second request.
 */
export async function GET() {
  try {
    let plan = await db.workoutPlan.findFirst({
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

    // Lazy-seed home alternatives once, then re-fetch to include them
    const seeded = await ensureHomeWorkouts(
      plan.id,
      new Set(plan.workouts.map((w) => w.dayLabel)),
    )
    if (seeded) {
      plan = await db.workoutPlan.findFirst({
        where: { id: plan.id },
        include: {
          workouts: {
            orderBy: { order: "asc" },
            include: {
              exercises: { select: { id: true } },
              sessions: {
                where: { userId: DEMO_USER_ID, completedAt: { not: null } },
                orderBy: { completedAt: "desc" },
                take: 1,
                select: { completedAt: true, durationMins: true },
              },
            },
          },
        },
      })
      if (!plan) return NextResponse.json({ workouts: [], planName: null })
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
        environment: w.environment,
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
