import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  calculateBMR,
  calculateTDEE,
  calculateCurrentTarget,
  classifyWeightTrend,
  classifyWaistTrend,
  classifyPerfTrend,
  decideCheckIn,
  isCheckInDue,
  type WeightTrend,
  type WaistTrend,
  type PerfTrend,
} from "@/utils/nutrition-math"

const DEMO_USER_ID = "demo-user"
const DAY_MS = 24 * 60 * 60 * 1000

interface CheckInSignals {
  due: boolean
  weightTrendPct: number
  weightTrendLabel: WeightTrend
  waistCm: number | null
  waistDeltaCm: number | null
  waistTrendLabel: WaistTrend
  perfTrendLabel: PerfTrend
  previousWasWeightUpWaistUp: boolean
}

/** Gathers and noise-filters every signal the decision matrix needs. */
async function computeSignals(): Promise<CheckInSignals> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS)

  const [recentMetrics, priorMetrics, lastCheckIn, firstMetric, recentSessions, priorSessions] =
    await Promise.all([
      db.bodyMetric.findMany({
        where: { userId: DEMO_USER_ID, date: { gte: sevenDaysAgo } },
        orderBy: { date: "desc" },
        select: { weightKg: true, waistCm: true, date: true },
      }),
      db.bodyMetric.findMany({
        where: { userId: DEMO_USER_ID, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
        select: { weightKg: true },
      }),
      db.checkIn.findFirst({ where: { userId: DEMO_USER_ID }, orderBy: { date: "desc" } }),
      db.bodyMetric.findFirst({ where: { userId: DEMO_USER_ID }, orderBy: { date: "asc" }, select: { date: true } }),
      db.workoutSession.findMany({
        where: { userId: DEMO_USER_ID, completedAt: { gte: sevenDaysAgo, not: null } },
        include: { sets: { where: { isWarmup: false }, select: { weightKg: true, reps: true } } },
      }),
      db.workoutSession.findMany({
        where: { userId: DEMO_USER_ID, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo, not: null } },
        include: { sets: { where: { isWarmup: false }, select: { weightKg: true, reps: true } } },
      }),
    ])

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)

  // Weight trend: only a real signal when BOTH 7-day windows have data —
  // otherwise default to "stable" rather than let a missing window read as
  // a huge (and false) swing.
  const weightTrend =
    recentMetrics.length > 0 && priorMetrics.length > 0
      ? classifyWeightTrend(avg(recentMetrics.map((m) => m.weightKg)), avg(priorMetrics.map((m) => m.weightKg)))
      : { pctPerWeek: 0, label: "stable" as WeightTrend }

  const latestWaist = recentMetrics.find((m) => m.waistCm != null)?.waistCm ?? null
  const waistDeltaCm =
    latestWaist != null && lastCheckIn?.waistCm != null
      ? Math.round((latestWaist - lastCheckIn.waistCm) * 100) / 100
      : null
  const waistTrendLabel = classifyWaistTrend(waistDeltaCm)

  const volumeOf = (sessions: typeof recentSessions) =>
    sessions.reduce((sum, s) => sum + s.sets.reduce((a, set) => a + set.weightKg * set.reps, 0), 0)
  const perfTrendLabel = classifyPerfTrend(volumeOf(recentSessions), volumeOf(priorSessions))

  const previousWasWeightUpWaistUp =
    lastCheckIn?.weightTrendLabel === "up" && lastCheckIn?.waistTrendLabel === "up"

  const anchorDate = firstMetric?.date ?? now
  const due = isCheckInDue(lastCheckIn?.date ?? null, anchorDate, now)

  return {
    due,
    weightTrendPct: weightTrend.pctPerWeek,
    weightTrendLabel: weightTrend.label,
    waistCm: latestWaist,
    waistDeltaCm,
    waistTrendLabel,
    perfTrendLabel,
    previousWasWeightUpWaistUp,
  }
}

/** GET /api/checkin — is a bi-weekly check-in due, and what would it decide? */
export async function GET() {
  try {
    const settings = await db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } })
    const signals = await computeSignals()

    if (!signals.due) {
      return NextResponse.json({ due: false })
    }

    const decision = decideCheckIn({
      weightTrend: signals.weightTrendLabel,
      waistTrend: signals.waistTrendLabel,
      perfTrend: signals.perfTrendLabel,
      previousWasWeightUpWaistUp: signals.previousWasWeightUpWaistUp,
    })
    const currentOffset = settings?.calorieAdjustmentOffset ?? 0

    return NextResponse.json({
      due: true,
      weightTrendPct: signals.weightTrendPct,
      weightTrendLabel: signals.weightTrendLabel,
      waistDeltaCm: signals.waistDeltaCm,
      waistTrendLabel: signals.waistTrendLabel,
      perfTrendLabel: signals.perfTrendLabel,
      decision: decision.decision,
      offsetDelta: decision.offsetDelta,
      reasoning: decision.reasoning,
      currentOffset,
      offsetAfter: currentOffset + decision.offsetDelta,
    })
  } catch (err) {
    console.error("[GET /api/checkin]", err)
    return NextResponse.json({ error: "שגיאה בבדיקת מצב הצ'ק-אין" }, { status: 500 })
  }
}

/** POST /api/checkin — apply the due check-in's decision and persist it. */
export async function POST() {
  try {
    const settings = await db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } })
    const signals = await computeSignals()

    if (!signals.due) {
      return NextResponse.json({ error: "אין בדיקה ממתינה כרגע" }, { status: 400 })
    }

    const decision = decideCheckIn({
      weightTrend: signals.weightTrendLabel,
      waistTrend: signals.waistTrendLabel,
      perfTrend: signals.perfTrendLabel,
      previousWasWeightUpWaistUp: signals.previousWasWeightUpWaistUp,
    })
    const currentOffset = settings?.calorieAdjustmentOffset ?? 0
    const offsetAfter = currentOffset + decision.offsetDelta

    await db.checkIn.create({
      data: {
        userId: DEMO_USER_ID,
        weightTrendPct: signals.weightTrendPct,
        weightTrendLabel: signals.weightTrendLabel,
        waistCm: signals.waistCm,
        waistDeltaCm: signals.waistDeltaCm,
        waistTrendLabel: signals.waistTrendLabel,
        perfTrendLabel: signals.perfTrendLabel,
        decision: decision.decision,
        offsetDelta: decision.offsetDelta,
        offsetAfter,
        reasoning: decision.reasoning,
      },
    })
    await db.userSettings.upsert({
      where: { userId: DEMO_USER_ID },
      update: { calorieAdjustmentOffset: offsetAfter },
      create: { userId: DEMO_USER_ID, calorieAdjustmentOffset: offsetAfter },
    })

    // Recompute targetCalories immediately off the new offset, so the
    // dashboard/settings reflect it right away rather than waiting for the
    // next weight log or settings save to pick it up.
    if (settings?.autoCalorieGoal !== false) {
      const latestMetric = await db.bodyMetric.findFirst({
        where: { userId: DEMO_USER_ID },
        orderBy: { date: "desc" },
        select: { weightKg: true },
      })
      if (latestMetric) {
        const bmr = calculateBMR(
          latestMetric.weightKg,
          settings?.height ?? 183,
          settings?.age ?? 31,
          settings?.gender ?? "male",
        )
        const tdee = calculateTDEE(bmr, settings?.activityMultiplier ?? 1.45)
        await db.user.update({
          where: { id: DEMO_USER_ID },
          data: { targetCalories: calculateCurrentTarget(tdee, offsetAfter) },
        })
      }
    }

    return NextResponse.json({
      ok: true,
      decision: decision.decision,
      offsetDelta: decision.offsetDelta,
      offsetAfter,
      reasoning: decision.reasoning,
    })
  } catch (err) {
    console.error("[POST /api/checkin]", err)
    return NextResponse.json({ error: "שגיאה בשמירת הצ'ק-אין" }, { status: 500 })
  }
}
