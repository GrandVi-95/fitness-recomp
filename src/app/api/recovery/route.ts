import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { addDaysStr, localDateStr, startOfLocalDay } from "@/lib/time"
import {
  streakWindowStart,
  trainingWeekStreaks,
  weeklyVolumeByMuscle,
} from "@/lib/training"

const DEMO_USER_ID = "demo-user"

/** GET /api/recovery
 *
 * Returns the recovery dashboard payload:
 *   - lastSleep / lastFatigue from the most recent completed session
 *   - lastAvgRpe  — average RPE across working sets of that session
 *   - weeklyVolume — effective sets (direct 1, indirect 0.5) per muscle over
 *     the last 7 days, with status vs the weekly PLANNING range
 *   - consecutiveWeeks — streak of local weeks with ≥ 1 completed session
 *   - stalledWeeks / deloadThreshold — consecutive completed weeks with no
 *     e1RM improvement on the main lifts, vs the user's deload threshold
 *
 * Sessions of archived workouts are included — history is history.
 */
export async function GET() {
  try {
    const now = new Date()
    // Last 7 local calendar days (today + 6 before), Israel time
    const sevenDaysAgo = startOfLocalDay(addDaysStr(localDateStr(now), -6))

    const [lastSession, recentSets, streakSessions, settings] = await Promise.all([
      // ── 1. Last completed session ────────────────────────────────────
      db.workoutSession.findFirst({
        where: { userId: DEMO_USER_ID, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        include: { sets: { where: { isWarmup: false } } },
      }),
      // ── 2. Working sets of the last 7 days ───────────────────────────
      db.setLog.findMany({
        where: {
          isWarmup: false,
          session: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { gte: sevenDaysAgo } },
        },
        select: {
          exercise: { select: { name: true, primaryMuscle: true, secondaryMuscles: true } },
        },
      }),
      // ── 3. One query for the whole streak window (no per-week counts) ─
      db.workoutSession.findMany({
        where: {
          userId: DEMO_USER_ID,
          completedAt: { not: null },
          startedAt: { gte: streakWindowStart(now) },
        },
        select: {
          startedAt: true,
          sets: {
            where: { isWarmup: false },
            select: {
              exerciseId: true,
              weightKg: true,
              reps: true,
              exercise: { select: { isCompound: true, trackingType: true } },
            },
          },
        },
      }),
      db.userSettings.findUnique({
        where: { userId: DEMO_USER_ID },
        select: { deloadThreshold: true },
      }),
    ])

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

    const weeklyVolume = weeklyVolumeByMuscle(recentSets)
    const { consecutiveWeeks, stalledWeeks } = trainingWeekStreaks(streakSessions, now)

    // ── Response ──────────────────────────────────────────────────────────
    return NextResponse.json({
      lastSleep:        lastSession?.sleepHours   ?? null,
      lastFatigue:      lastSession?.fatigueLevel ?? null,
      lastAvgRpe,
      weeklyVolume,
      consecutiveWeeks,
      stalledWeeks,
      deloadThreshold:  settings?.deloadThreshold ?? 3,
    })
  } catch (err) {
    console.error("[GET /api/recovery]", err)
    return NextResponse.json({ error: "שגיאה בטעינת נתוני ההתאוששות" }, { status: 500 })
  }
}
