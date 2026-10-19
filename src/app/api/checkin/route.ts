import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"
import { addDaysStr, localDateStr, startOfLocalDay } from "@/lib/time"
import { computeCalorieTarget, getTrendWeight, syncStoredTargets } from "@/lib/targets-server"
import {
  assessAdherence,
  classifyPerfTrend,
  classifyWaistTrend,
  classifyWeightTrend,
  dailyAveragedMean,
  decideCheckIn,
  isCheckInDue,
  isCreatineCalibrationEffective,
  normalizeGoal,
  MIN_WEIGH_IN_DAYS_PER_WEEK,
  type Adherence,
  type Goal,
  type PerfTrend,
  type RateVsGoal,
  type WaistTrend,
  type WeightTrend,
} from "@/utils/nutrition-math"

const DEMO_USER_ID = "demo-user"

interface CheckInSignals {
  due: boolean
  goal: Goal
  weightTrendPct: number
  weightTrendLabel: WeightTrend
  waistCm: number | null
  waistDeltaCm: number | null
  waistTrendLabel: WaistTrend
  perfTrendLabel: PerfTrend
  adherence: Adherence
  previousRateVsGoal: RateVsGoal | null
  previousWaistTrend: WaistTrend | null
  creatineActive: boolean
  autoCalorieGoal: boolean
  cycleKey: string
}

/** Gathers and noise-filters every signal the decision engine needs. */
async function computeSignals(settings: Awaited<ReturnType<typeof loadSettings>>): Promise<CheckInSignals> {
  const now = new Date()
  const today = localDateStr(now)
  // Windows by LOCAL calendar day: recent = last 7 days incl. today, prior = the 7 before.
  const recentStart = startOfLocalDay(addDaysStr(today, -6))
  const priorStart = startOfLocalDay(addDaysStr(today, -13))
  const tomorrowStart = startOfLocalDay(addDaysStr(today, 1))
  const adherenceStart = startOfLocalDay(addDaysStr(today, -14))

  const [metrics, lastCheckIn, firstMetric, sessions, logs, dayPlans] = await Promise.all([
    db.bodyMetric.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: priorStart, lt: tomorrowStart } },
      orderBy: { date: "desc" },
      select: { weightKg: true, waistCm: true, date: true },
    }),
    db.checkIn.findFirst({ where: { userId: DEMO_USER_ID }, orderBy: { date: "desc" } }),
    db.bodyMetric.findFirst({ where: { userId: DEMO_USER_ID }, orderBy: { date: "asc" }, select: { date: true } }),
    db.workoutSession.findMany({
      where: { userId: DEMO_USER_ID, completedAt: { gte: priorStart, lt: tomorrowStart } },
      select: {
        completedAt: true,
        sets: { where: { isWarmup: false }, select: { exerciseId: true, weightKg: true, reps: true } },
      },
    }),
    db.nutritionLog.findMany({
      where: { userId: DEMO_USER_ID, status: "eaten", date: { gte: adherenceStart, lt: tomorrowStart } },
      select: { date: true, foodItems: { select: { calories: true } } },
    }),
    db.dayPlan.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: addDaysStr(today, -14), lte: addDaysStr(today, -1) } },
      select: { date: true, targetCalories: true },
    }),
  ])

  // ── Weight: mean of daily means, with a minimum number of weigh-in days ──
  const recentW = metrics.filter((m) => m.date >= recentStart)
  const priorW = metrics.filter((m) => m.date < recentStart)
  const toDaily = (rows: typeof metrics) =>
    dailyAveragedMean(rows.map((m) => ({ day: localDateStr(m.date), value: m.weightKg })))
  const r = toDaily(recentW)
  const p = toDaily(priorW)
  const weightTrend =
    r.days >= MIN_WEIGH_IN_DAYS_PER_WEEK && p.days >= MIN_WEIGH_IN_DAYS_PER_WEEK
      ? classifyWeightTrend(r.mean, p.mean)
      : { pctPerWeek: 0, label: "unknown" as WeightTrend }

  // ── Waist: latest reading this week vs the previous check-in's reading ──
  const latestWaist = recentW.find((m) => m.waistCm != null)?.waistCm ?? null
  const waistDeltaCm =
    latestWaist != null && lastCheckIn?.waistCm != null
      ? Math.round((latestWaist - lastCheckIn.waistCm) * 100) / 100
      : null

  // ── Strength: matched-exercise e1RM, recent vs prior week ──
  const toPerfSets = (from: Date, to: Date) =>
    sessions
      .filter((s) => s.completedAt && s.completedAt >= from && s.completedAt < to)
      .flatMap((s) => s.sets)
  const perfTrendLabel = classifyPerfTrend(
    toPerfSets(recentStart, tomorrowStart),
    toPerfSets(priorStart, recentStart),
  )

  // ── Adherence: logged kcal vs that day's target (snapshot, else current),
  //    over the 14 COMPLETED days (today is still being logged) ──
  const loggedByDay = new Map<string, number>()
  for (const log of logs) {
    const key = localDateStr(log.date)
    loggedByDay.set(key, (loggedByDay.get(key) ?? 0) + log.foodItems.reduce((a, i) => a + i.calories, 0))
  }
  const targetByDay = new Map(dayPlans.filter((d) => d.targetCalories > 0).map((d) => [d.date, d.targetCalories]))
  const fallbackTarget = computeCalorieTarget({
    autoCalorieGoal: settings.autoCalorieGoal,
    storedCalories: settings.storedCalories,
    weightKg: await getTrendWeight(DEMO_USER_ID, today),
    heightCm: settings.height,
    age: settings.age,
    gender: settings.gender,
    activityMultiplier: settings.activityMultiplier,
    offset: settings.offset,
    goal: settings.goal,
  })
  const adherence = assessAdherence(
    Array.from({ length: 14 }, (_, i) => {
      const day = addDaysStr(today, -(i + 1))
      return { loggedKcal: loggedByDay.get(day) ?? 0, targetKcal: targetByDay.get(day) ?? fallbackTarget }
    }),
  )

  // A check-in recorded during Creatine Calibration BREAKS the consecutive
  // chain rather than being skipped over — otherwise an older pre-creatine
  // signal could pair with the next one and trigger an immediate cut.
  const prevCounts = lastCheckIn && !lastCheckIn.creatineCalibrationActive
  const previousRateVsGoal = prevCounts ? (lastCheckIn.rateVsGoal as RateVsGoal | null) : null
  const previousWaistTrend = prevCounts ? (lastCheckIn.waistTrendLabel as WaistTrend) : null

  const anchorDate = firstMetric?.date ?? now
  return {
    due: isCheckInDue(lastCheckIn?.date ?? null, anchorDate, now),
    goal: settings.goal,
    weightTrendPct: weightTrend.pctPerWeek,
    weightTrendLabel: weightTrend.label,
    waistCm: latestWaist,
    waistDeltaCm,
    waistTrendLabel: classifyWaistTrend(waistDeltaCm),
    perfTrendLabel,
    adherence,
    previousRateVsGoal,
    previousWaistTrend,
    creatineActive: isCreatineCalibrationEffective(settings.creatineActive, settings.creatineStartedAt, now),
    autoCalorieGoal: settings.autoCalorieGoal,
    cycleKey: lastCheckIn?.id ?? "first",
  }
}

async function loadSettings() {
  const [s, user] = await Promise.all([
    db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } }),
    db.user.findUnique({ where: { id: DEMO_USER_ID }, select: { targetCalories: true } }),
  ])
  return {
    vacationMode: s?.vacationMode ?? false,
    goal: normalizeGoal(s?.goal),
    offset: s?.calorieAdjustmentOffset ?? 0,
    autoCalorieGoal: s?.autoCalorieGoal ?? true,
    storedCalories: user?.targetCalories ?? null,
    height: s?.height ?? 183,
    age: s?.age ?? 31,
    gender: s?.gender ?? "male",
    activityMultiplier: s?.activityMultiplier ?? 1.45,
    creatineActive: s?.creatineCalibrationActive ?? false,
    creatineStartedAt: s?.creatineStartedAt ?? null,
  }
}

function decide(signals: CheckInSignals, currentOffset: number) {
  return decideCheckIn({
    goal: signals.goal,
    weightPctPerWeek: signals.weightTrendPct,
    weightTrend: signals.weightTrendLabel,
    waistTrend: signals.waistTrendLabel,
    perfTrend: signals.perfTrendLabel,
    adherence: signals.adherence,
    previousRateVsGoal: signals.previousRateVsGoal,
    previousWaistTrend: signals.previousWaistTrend,
    currentOffset,
    creatineCalibrationActive: signals.creatineActive,
    manualCalories: !signals.autoCalorieGoal,
  })
}

/** GET /api/checkin — is a bi-weekly check-in due, and what would it decide? */
export async function GET() {
  try {
    const settings = await loadSettings()

    // Vacation Mode: the check-in timer is completely paused.
    if (settings.vacationMode) {
      return NextResponse.json({ due: false, vacationMode: true })
    }

    const signals = await computeSignals(settings)
    if (!signals.due) {
      return NextResponse.json({ due: false })
    }

    const decision = decide(signals, settings.offset)
    return NextResponse.json({
      due: true,
      goal: signals.goal,
      weightTrendPct: signals.weightTrendPct,
      weightTrendLabel: signals.weightTrendLabel,
      waistDeltaCm: signals.waistDeltaCm,
      waistTrendLabel: signals.waistTrendLabel,
      perfTrendLabel: signals.perfTrendLabel,
      adherence: signals.adherence,
      decision: decision.decision,
      offsetDelta: decision.offsetDelta,
      reasoning: decision.reasoning,
      currentOffset: settings.offset,
      offsetAfter: settings.offset + decision.offsetDelta,
    })
  } catch (err) {
    console.error("[GET /api/checkin]", err)
    return NextResponse.json({ error: "שגיאה בבדיקת מצב הצ'ק-אין" }, { status: 500 })
  }
}

/** POST /api/checkin — apply the due check-in's decision and persist it. */
export async function POST() {
  try {
    const settings = await loadSettings()

    if (settings.vacationMode) {
      return NextResponse.json({ error: "מצב חופשה פעיל — הצ'ק-אין מושהה" }, { status: 400 })
    }

    const signals = await computeSignals(settings)
    if (!signals.due) {
      return NextResponse.json({ error: "אין בדיקה ממתינה כרגע" }, { status: 400 })
    }

    let result
    try {
      // One transaction: history row + offset change. The offset is re-read
      // inside the transaction and incremented atomically; the unique
      // (userId, cycleKey) makes a concurrent duplicate POST fail instead of
      // applying the adjustment twice.
      result = await db.$transaction(async (tx) => {
        const current = await tx.userSettings.upsert({
          where: { userId: DEMO_USER_ID },
          update: {},
          create: { userId: DEMO_USER_ID },
          select: { calorieAdjustmentOffset: true },
        })
        const decision = decide(signals, current.calorieAdjustmentOffset)
        const offsetAfter = current.calorieAdjustmentOffset + decision.offsetDelta

        await tx.checkIn.create({
          data: {
            userId: DEMO_USER_ID,
            cycleKey: signals.cycleKey,
            weightTrendPct: signals.weightTrendPct,
            weightTrendLabel: signals.weightTrendLabel,
            rateVsGoal: decision.rateVsGoal,
            waistCm: signals.waistCm,
            waistDeltaCm: signals.waistDeltaCm,
            waistTrendLabel: signals.waistTrendLabel,
            perfTrendLabel: signals.perfTrendLabel,
            adherencePct: signals.adherence.ratio != null ? Math.round(signals.adherence.ratio * 1000) / 10 : null,
            decision: decision.decision,
            offsetDelta: decision.offsetDelta,
            offsetAfter,
            reasoning: decision.reasoning,
            creatineCalibrationActive: signals.creatineActive,
          },
        })
        if (decision.offsetDelta !== 0) {
          await tx.userSettings.update({
            where: { userId: DEMO_USER_ID },
            data: { calorieAdjustmentOffset: { increment: decision.offsetDelta } },
          })
        }
        return { decision, offsetAfter }
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ error: "הצ'ק-אין הזה כבר נשמר" }, { status: 409 })
      }
      throw err
    }

    // Re-derive the full target set (calories AND carbs/fat) off the new offset.
    await syncStoredTargets(DEMO_USER_ID)
    revalidatePath("/dashboard")

    return NextResponse.json({
      ok: true,
      decision: result.decision.decision,
      offsetDelta: result.decision.offsetDelta,
      offsetAfter: result.offsetAfter,
      reasoning: result.decision.reasoning,
    })
  } catch (err) {
    console.error("[POST /api/checkin]", err)
    return NextResponse.json({ error: "שגיאה בשמירת הצ'ק-אין" }, { status: 500 })
  }
}
