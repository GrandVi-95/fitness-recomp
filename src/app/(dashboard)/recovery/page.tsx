export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import RecoveryTabs, { type RecoveryData, type WeeklyData } from "@/components/recovery/RecoveryTabs"
import { APP_TIME_ZONE, addDaysStr, getLocalWeekBounds, localDateStr, startOfLocalDay } from "@/lib/time"
import { isProteinOnTarget } from "@/utils/nutrition-math"
import {
  metricKind,
  setMetric,
  setVolume,
  streakWindowStart,
  trainingWeekStreaks,
  weeklyVolumeByMuscle,
  type MetricKind,
} from "@/lib/training"

const DEMO_USER_ID = "demo-user"

const DAY_LABELS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שב'"]

function weekLabelOf(start: Date): string {
  return start.toLocaleDateString("he-IL", { day: "numeric", month: "short", timeZone: APP_TIME_ZONE })
}

async function getRecoveryData(): Promise<RecoveryData> {
  const now = new Date()
  // Last 7 local calendar days (today + 6 before), Israel time
  const sevenDaysAgo = startOfLocalDay(addDaysStr(localDateStr(now), -6))

  // Sessions of archived workouts are included on purpose — history is history.
  const [lastSession, recentSets, streakSessions, settings] = await Promise.all([
    db.workoutSession.findFirst({
      where: { userId: DEMO_USER_ID, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      include: { sets: { where: { isWarmup: false } } },
    }),
    db.setLog.findMany({
      where: {
        isWarmup: false,
        session: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { gte: sevenDaysAgo } },
      },
      select: { exercise: { select: { name: true, primaryMuscle: true, secondaryMuscles: true } } },
    }),
    // One query over the whole streak window, grouped by local week in memory
    db.workoutSession.findMany({
      where: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { gte: streakWindowStart(now) } },
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

  const rpeValues = lastSession?.sets.map((s) => s.rpe).filter((r): r is number => r != null) ?? []
  const lastAvgRpe = rpeValues.length
    ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
    : null

  const { consecutiveWeeks, stalledWeeks } = trainingWeekStreaks(streakSessions, now)

  return {
    lastSleep:    lastSession?.sleepHours   ?? null,
    lastFatigue:  lastSession?.fatigueLevel ?? null,
    lastAvgRpe,
    weeklyVolume: weeklyVolumeByMuscle(recentSets),
    consecutiveWeeks,
    stalledWeeks,
    deloadThreshold: settings?.deloadThreshold ?? 3,
  }
}

async function getWeeklyData(): Promise<WeeklyData> {
  const now = new Date()
  // Current (partial) week, last COMPLETED week, and the week before it.
  const thisWeek = getLocalWeekBounds(0, now)
  const lastWeek = getLocalWeekBounds(1, now)
  const priorWeek = getLocalWeekBounds(2, now)

  const [
    user,
    activePlan,
    thisWeekSessionCount,
    comparisonSessions,
    thisWeekNutrition,
    bodyMetrics,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: DEMO_USER_ID },
      include: { userSettings: true },
    }),
    db.workoutPlan.findFirst({
      where: { userId: DEMO_USER_ID, isActive: true, archivedAt: null },
      include: { workouts: { where: { archivedAt: null, environment: "gym" }, select: { id: true } } },
    }),
    db.workoutSession.count({
      where: { userId: DEMO_USER_ID, startedAt: { gte: thisWeek.start }, completedAt: { not: null } },
    }),
    // Progression compares the two most recent COMPLETED weeks — never a
    // partial current week against a full one.
    db.workoutSession.findMany({
      where: {
        userId: DEMO_USER_ID,
        startedAt: { gte: priorWeek.start, lt: thisWeek.start },
        completedAt: { not: null },
      },
      select: {
        startedAt: true,
        sets: {
          where: { isWarmup: false },
          select: {
            exerciseId: true,
            weightKg: true,
            reps: true,
            durationSecs: true,
            exercise: { select: { name: true, primaryMuscle: true, trackingType: true } },
          },
        },
      },
    }),
    db.nutritionLog.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: thisWeek.start } },
      include: { foodItems: true },
    }),
    db.bodyMetric.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: lastWeek.start } },
      orderBy: { date: "asc" },
    }),
  ])

  const latestWeight =
    bodyMetrics.filter((m) => new Date(m.date) >= thisWeek.start).at(-1)?.weightKg ??
    bodyMetrics.at(-1)?.weightKg ?? null

  let targetProtein = user?.targetProtein ?? 185
  if (user?.userSettings?.autoProteinGoal && latestWeight) {
    targetProtein = Math.round(latestWeight * 2.2)
  }
  const targetCalories = user?.targetCalories ?? 2600

  // ── Progressive overload: last completed week vs the week before ──────
  interface ExStats {
    name: string
    primaryMuscle: string
    kind: MetricKind
    thisVolume: number
    thisBest: number
    lastVolume: number
    lastBest: number
  }

  const exerciseMap = new Map<string, ExStats>()
  const priorWeekSets: { exerciseId: string; weightKg: number; reps: number; durationSecs: number | null }[] = []

  for (const session of comparisonSessions) {
    const inLastWeek = session.startedAt >= lastWeek.start
    for (const set of session.sets) {
      if (!inLastWeek) {
        priorWeekSets.push(set)
        continue
      }
      const kind = metricKind(set.exercise.trackingType)
      const prev = exerciseMap.get(set.exerciseId) ?? {
        name: set.exercise.name,
        primaryMuscle: set.exercise.primaryMuscle,
        kind,
        thisVolume: 0, thisBest: 0, lastVolume: 0, lastBest: 0,
      }
      prev.thisVolume += setVolume(kind, set)
      prev.thisBest = Math.max(prev.thisBest, setMetric(kind, set))
      exerciseMap.set(set.exerciseId, prev)
    }
  }
  for (const set of priorWeekSets) {
    const ex = exerciseMap.get(set.exerciseId)
    if (!ex) continue
    ex.lastVolume += setVolume(ex.kind, set)
    ex.lastBest = Math.max(ex.lastBest, setMetric(ex.kind, set))
  }

  // Lifetime best BEFORE the compared week — a PR must beat all prior
  // history, and "new" means the exercise was never logged before.
  const lifetimeBest = new Map<string, number>()
  const exerciseIds = [...exerciseMap.keys()]
  if (exerciseIds.length > 0) {
    const history = await db.setLog.findMany({
      where: {
        exerciseId: { in: exerciseIds },
        isWarmup: false,
        session: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { lt: lastWeek.start } },
      },
      select: { exerciseId: true, weightKg: true, reps: true, durationSecs: true },
    })
    for (const set of history) {
      const kind = exerciseMap.get(set.exerciseId)!.kind
      const m = setMetric(kind, set)
      lifetimeBest.set(set.exerciseId, Math.max(lifetimeBest.get(set.exerciseId) ?? 0, m))
    }
  }

  const roundMetric = (kind: MetricKind, n: number) =>
    kind === "e1rm" ? Math.round(n * 2) / 2 : Math.round(n)

  const progressionList = [...exerciseMap.entries()]
    .sort(([, a], [, b]) => b.thisVolume - a.thisVolume)
    .map(([exerciseId, ex]) => {
      const hasHistory = lifetimeBest.has(exerciseId)
      const prevBest = lifetimeBest.get(exerciseId) ?? 0
      return {
        name: ex.name,
        primaryMuscle: ex.primaryMuscle,
        kind: ex.kind,
        thisVolume: Math.round(ex.thisVolume),
        lastVolume: Math.round(ex.lastVolume),
        volumeDelta: Math.round(ex.thisVolume - ex.lastVolume),
        volumeDeltaPct: ex.lastVolume > 0
          ? Math.round(((ex.thisVolume - ex.lastVolume) / ex.lastVolume) * 100)
          : null,
        thisBest: roundMetric(ex.kind, ex.thisBest),
        bestDelta: ex.lastBest > 0 ? roundMetric(ex.kind, ex.thisBest - ex.lastBest) : null,
        isPR: hasHistory && prevBest > 0 && ex.thisBest > prevBest,
        isNew: !hasHistory,
      }
    })

  // ── Nutrition — current (partial) week, grouped by local calendar day ──
  const nutritionByDay = new Map<string, { calories: number; protein: number }>()
  for (const log of thisWeekNutrition) {
    const key = localDateStr(log.date)
    const prev = nutritionByDay.get(key) ?? { calories: 0, protein: 0 }
    prev.calories += log.foodItems.reduce((s, i) => s + i.calories, 0)
    prev.protein  += log.foodItems.reduce((s, i) => s + i.protein, 0)
    nutritionByDay.set(key, prev)
  }

  const todayStr = localDateStr(now)
  const dailyNutrition = Array.from({ length: 7 }, (_, i) => {
    const day = addDaysStr(thisWeek.startStr, i)
    const data = nutritionByDay.get(day)
    return {
      label: DAY_LABELS_HE[i] ?? String(i + 1),
      day,
      calories: Math.round(data?.calories ?? 0),
      protein: Math.round((data?.protein ?? 0) * 10) / 10,
      hasData: !!data,
      isFuture: day > todayStr,
    }
  })

  const loggedDays = dailyNutrition.filter((d) => d.hasData)
  const avgCalories = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
    : 0
  const avgProtein = loggedDays.length > 0
    ? Math.round((loggedDays.reduce((s, d) => s + d.protein, 0) / loggedDays.length) * 10) / 10
    : 0
  // Same Green-Zone rule (>= 1.6 g/kg) as the dashboard and weekly report.
  const proteinDaysHit = dailyNutrition.filter(
    (d) => d.hasData && isProteinOnTarget(d.protein, latestWeight, targetProtein),
  ).length

  // ── Body weight — current week is partial and labelled as such ─────────
  const thisWeekMetrics = bodyMetrics.filter((m) => new Date(m.date) >= thisWeek.start)
  const lastWeekMetrics = bodyMetrics.filter((m) => {
    const d = new Date(m.date)
    return d >= lastWeek.start && d < thisWeek.start
  })

  const thisWeekAvgWeight = thisWeekMetrics.length > 0
    ? Math.round((thisWeekMetrics.reduce((s, m) => s + m.weightKg, 0) / thisWeekMetrics.length) * 100) / 100
    : null
  const lastWeekAvgWeight = lastWeekMetrics.length > 0
    ? Math.round((lastWeekMetrics.reduce((s, m) => s + m.weightKg, 0) / lastWeekMetrics.length) * 100) / 100
    : null
  const weightDelta = thisWeekAvgWeight !== null && lastWeekAvgWeight !== null
    ? Math.round((thisWeekAvgWeight - lastWeekAvgWeight) * 100) / 100
    : null

  // Weekly goal: planned training days; fallback = live gym days in the plan
  // (home workouts are alternatives, not extra days).
  const workoutGoal =
    user?.userSettings?.trainingDaysPerWeek ||
    activePlan?.workouts?.length ||
    3

  return {
    targetCalories,
    targetProtein,
    weekLabel: weekLabelOf(thisWeek.start),
    progressionWeekLabel: weekLabelOf(lastWeek.start),
    progressionList,
    dailyNutrition,
    avgCalories,
    avgProtein,
    proteinDaysHit,
    workoutsCompleted: thisWeekSessionCount,
    workoutGoal,
    thisWeekAvgWeight,
    lastWeekAvgWeight,
    weightDelta,
  }
}

export default async function RecoveryPage() {
  const [recovery, weekly] = await Promise.all([getRecoveryData(), getWeeklyData()])
  return <RecoveryTabs recovery={recovery} weekly={weekly} />
}
