import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

// Ordered list of muscles to include in the weekly volume response
const MUSCLE_ORDER = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "core",
] as const

type Muscle = (typeof MUSCLE_ORDER)[number]

// Hebrew display names for each muscle group
const MUSCLE_LABELS: Record<Muscle, string> = {
  chest:      "חזה",
  back:       "גב",
  shoulders:  "כתפיים",
  biceps:     "בייספס",
  triceps:    "טרייספס",
  quads:      "קוואדס",
  hamstrings: "ירכיים",
  core:       "בטן",
}

// Minimum / maximum weekly working-set targets per muscle group
const MUSCLE_THRESHOLDS: Record<Muscle, { min: number; max: number }> = {
  chest:      { min: 8, max: 20 },
  back:       { min: 8, max: 20 },
  shoulders:  { min: 6, max: 16 },
  biceps:     { min: 6, max: 12 },
  triceps:    { min: 6, max: 12 },
  quads:      { min: 8, max: 20 },
  hamstrings: { min: 8, max: 20 },
  core:       { min: 6, max: 12 },
}

/** GET /api/recovery
 *
 * Returns the recovery dashboard payload:
 *   - lastSleep / lastFatigue from the most recent completed session
 *   - lastAvgRpe  — average RPE across working sets of that session
 *   - weeklyVolume — set counts + status per muscle group for the last 7 days
 *   - consecutiveWeeks — streak of weeks that contained ≥ 1 completed session
 */
export async function GET() {
  try {
    const now = new Date()

    // ── 1. Last completed session ──────────────────────────────────────────
    const lastSession = await db.workoutSession.findFirst({
      where: {
        userId: DEMO_USER_ID,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      include: {
        sets: { where: { isWarmup: false } },
      },
    })

    // Average RPE from working sets that have an RPE value recorded
    let lastAvgRpe: number | null = null
    if (lastSession) {
      const rpeValues = lastSession.sets
        .map((s) => s.rpe)
        .filter((rpe): rpe is number => rpe !== null)

      if (rpeValues.length > 0) {
        const sum = rpeValues.reduce((acc, v) => acc + v, 0)
        lastAvgRpe = Math.round((sum / rpeValues.length) * 10) / 10
      }
    }

    // ── 2. Weekly volume (last 7 days) ─────────────────────────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const recentSessions = await db.workoutSession.findMany({
      where: {
        userId: DEMO_USER_ID,
        completedAt: { not: null },
        startedAt: { gte: sevenDaysAgo },
      },
      include: {
        sets: {
          where: { isWarmup: false },
          include: {
            exercise: { select: { primaryMuscle: true } },
          },
        },
      },
    })

    // Count working sets per primaryMuscle
    const setsByMuscle: Record<string, number> = {}
    for (const session of recentSessions) {
      for (const set of session.sets) {
        const muscle = set.exercise.primaryMuscle
        setsByMuscle[muscle] = (setsByMuscle[muscle] ?? 0) + 1
      }
    }

    const weeklyVolume = MUSCLE_ORDER.map((muscle) => {
      const sets = setsByMuscle[muscle] ?? 0
      const { min, max } = MUSCLE_THRESHOLDS[muscle]
      const status: "under" | "optimal" | "over" =
        sets < min ? "under" : sets > max ? "over" : "optimal"

      return {
        muscle: MUSCLE_LABELS[muscle],
        sets,
        status,
      }
    })

    // ── 3. Consecutive training weeks ──────────────────────────────────────
    // Week 1 = last 7 days, Week 2 = 8–14 days ago, … up to 12 weeks back.
    // Stop counting the moment a week has zero completed sessions.
    const MAX_WEEKS = 12
    let consecutiveWeeks = 0

    for (let week = 0; week < MAX_WEEKS; week++) {
      const weekEnd   = new Date(now.getTime() - week * 7 * 24 * 60 * 60 * 1000)
      const weekStart = new Date(now.getTime() - (week + 1) * 7 * 24 * 60 * 60 * 1000)

      const count = await db.workoutSession.count({
        where: {
          userId: DEMO_USER_ID,
          completedAt: { not: null },
          startedAt: { gte: weekStart, lt: weekEnd },
        },
      })

      if (count === 0) break
      consecutiveWeeks++
    }

    // ── Response ──────────────────────────────────────────────────────────
    return NextResponse.json({
      lastSleep:        lastSession?.sleepHours   ?? null,
      lastFatigue:      lastSession?.fatigueLevel ?? null,
      lastAvgRpe,
      weeklyVolume,
      consecutiveWeeks,
    })
  } catch (err) {
    console.error("[GET /api/recovery]", err)
    return NextResponse.json({ error: "שגיאה בטעינת נתוני ההתאוששות" }, { status: 500 })
  }
}
