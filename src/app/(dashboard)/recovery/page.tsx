export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import RecoveryTabs, { type RecoveryData, type WeeklyData } from "@/components/recovery/RecoveryTabs"

const DEMO_USER_ID = "demo-user"
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000 // Israel UTC+3

const MUSCLE_ORDER = ["chest","back","shoulders","biceps","triceps","quads","hamstrings","core"] as const
type Muscle = typeof MUSCLE_ORDER[number]

const MUSCLE_LABELS: Record<Muscle, string> = {
  chest:"חזה", back:"גב", shoulders:"כתפיים", biceps:"בייספס",
  triceps:"טרייספס", quads:"קוואדס", hamstrings:"ירכיים", core:"בטן",
}

const THRESHOLDS: Record<Muscle, { min: number; max: number }> = {
  chest:      { min:8,  max:20 }, back:      { min:8,  max:20 },
  shoulders:  { min:6,  max:16 }, biceps:    { min:6,  max:12 },
  triceps:    { min:6,  max:12 }, quads:     { min:8,  max:20 },
  hamstrings: { min:8,  max:20 }, core:      { min:6,  max:12 },
}

const DAY_LABELS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שב'"]

const MUSCLE_HE_EXTRA: Record<string, string> = {
  legs: "רגליים", glutes: "ישבן", calves: "שוקיים", other: "אחר",
}

// Returns "YYYY-MM-DD" in Israel time (UTC+3) for any UTC Date.
function israelDateStr(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`
}

// Returns UTC-equivalent boundaries for the current Israel calendar week (Sun–Sat).
function getIsraelWeekBounds(): { thisWeekStartQ: Date; lastWeekStartQ: Date } {
  const now = new Date()
  // Shift forward to Israel time so UTC date/day methods give Israel calendar values
  const israelNow = new Date(now.getTime() + TZ_OFFSET_MS)

  // Sunday of current Israel week (JS day 0 = Sunday)
  const israelSunday = new Date(israelNow)
  israelSunday.setUTCDate(israelNow.getUTCDate() - israelNow.getUTCDay())
  israelSunday.setUTCHours(0, 0, 0, 0)

  // Shift back to real UTC for DB queries
  const thisWeekStartQ = new Date(israelSunday.getTime() - TZ_OFFSET_MS)
  const lastWeekStartQ = new Date(thisWeekStartQ.getTime() - 7 * 24 * 60 * 60 * 1000)

  return { thisWeekStartQ, lastWeekStartQ }
}

async function getRecoveryData(): Promise<RecoveryData> {
  const now = new Date()

  const lastSession = await db.workoutSession.findFirst({
    where: { userId: DEMO_USER_ID, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    include: { sets: { where: { isWarmup: false } } },
  })

  const rpeValues = lastSession?.sets.map((s) => s.rpe).filter((r): r is number => r != null) ?? []
  const lastAvgRpe = rpeValues.length
    ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
    : null

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const recentSessions = await db.workoutSession.findMany({
    where: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { gte: sevenDaysAgo } },
    include: {
      sets: {
        where: { isWarmup: false },
        include: { exercise: { select: { primaryMuscle: true } } },
      },
    },
  })

  const setsByMuscle: Record<string, number> = {}
  for (const s of recentSessions)
    for (const set of s.sets)
      setsByMuscle[set.exercise.primaryMuscle] = (setsByMuscle[set.exercise.primaryMuscle] ?? 0) + 1

  const weeklyVolume = MUSCLE_ORDER.map((muscle) => {
    const sets = setsByMuscle[muscle] ?? 0
    const { min, max } = THRESHOLDS[muscle]
    const status: "under" | "optimal" | "over" = sets < min ? "under" : sets > max ? "over" : "optimal"
    return { muscle: MUSCLE_LABELS[muscle], sets, status }
  })

  let consecutiveWeeks = 0
  for (let w = 0; w < 12; w++) {
    const end   = new Date(now.getTime() - w * 7 * 86_400_000)
    const start = new Date(now.getTime() - (w + 1) * 7 * 86_400_000)
    const count = await db.workoutSession.count({
      where: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { gte: start, lt: end } },
    })
    if (count === 0) break
    consecutiveWeeks++
  }

  return {
    lastSleep:    lastSession?.sleepHours   ?? null,
    lastFatigue:  lastSession?.fatigueLevel ?? null,
    lastAvgRpe,
    weeklyVolume,
    consecutiveWeeks,
  }
}

async function getWeeklyData(): Promise<WeeklyData> {
  const now = new Date()
  const { thisWeekStartQ, lastWeekStartQ } = getIsraelWeekBounds()

  const [
    user,
    activePlan,
    thisWeekSessions,
    lastWeekSessions,
    thisWeekNutrition,
    bodyMetrics,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: DEMO_USER_ID },
      include: { userSettings: true },
    }),
    db.workoutPlan.findFirst({
      where: { userId: DEMO_USER_ID, isActive: true },
      include: { workouts: true },
    }),
    db.workoutSession.findMany({
      where: { userId: DEMO_USER_ID, startedAt: { gte: thisWeekStartQ }, completedAt: { not: null } },
      include: {
        sets: {
          where: { isWarmup: false },
          include: { exercise: { select: { name: true, primaryMuscle: true } } },
        },
      },
    }),
    db.workoutSession.findMany({
      where: {
        userId: DEMO_USER_ID,
        startedAt: { gte: lastWeekStartQ, lt: thisWeekStartQ },
        completedAt: { not: null },
      },
      include: {
        sets: {
          where: { isWarmup: false },
          include: { exercise: { select: { name: true } } },
        },
      },
    }),
    db.nutritionLog.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: thisWeekStartQ } },
      include: { foodItems: true },
    }),
    db.bodyMetric.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: lastWeekStartQ } },
      orderBy: { date: "asc" },
    }),
  ])

  const latestWeight =
    bodyMetrics.filter((m) => new Date(m.date) >= thisWeekStartQ).at(-1)?.weightKg ??
    bodyMetrics.at(-1)?.weightKg ?? null

  let targetProtein = user?.targetProtein ?? 185
  if (user?.userSettings?.autoProteinGoal && latestWeight) {
    targetProtein = Math.round(latestWeight * 2.2)
  }
  const targetCalories = user?.targetCalories ?? 2600

  interface ExStats {
    name: string
    primaryMuscle: string
    thisVolume: number
    thisMaxWeight: number
    lastVolume: number
    lastMaxWeight: number
  }

  const exerciseMap = new Map<string, ExStats>()

  for (const session of thisWeekSessions) {
    for (const set of session.sets) {
      const prev = exerciseMap.get(set.exerciseId) ?? {
        name: set.exercise.name,
        primaryMuscle: set.exercise.primaryMuscle,
        thisVolume: 0, thisMaxWeight: 0, lastVolume: 0, lastMaxWeight: 0,
      }
      prev.thisVolume += set.weightKg * set.reps
      prev.thisMaxWeight = Math.max(prev.thisMaxWeight, set.weightKg)
      exerciseMap.set(set.exerciseId, prev)
    }
  }

  for (const session of lastWeekSessions) {
    for (const set of session.sets) {
      const ex = exerciseMap.get(set.exerciseId)
      if (!ex) continue
      ex.lastVolume += set.weightKg * set.reps
      ex.lastMaxWeight = Math.max(ex.lastMaxWeight, set.weightKg)
    }
  }

  const progressionList = [...exerciseMap.values()]
    .sort((a, b) => b.thisVolume - a.thisVolume)
    .map((ex) => ({
      name: ex.name,
      primaryMuscle: ex.primaryMuscle,
      thisVolume: Math.round(ex.thisVolume),
      thisMaxWeight: ex.thisMaxWeight,
      lastVolume: Math.round(ex.lastVolume),
      lastMaxWeight: ex.lastMaxWeight,
      volumeDelta: Math.round(ex.thisVolume - ex.lastVolume),
      volumeDeltaPct: ex.lastVolume > 0
        ? Math.round(((ex.thisVolume - ex.lastVolume) / ex.lastVolume) * 100)
        : null,
      weightDelta: Math.round((ex.thisMaxWeight - ex.lastMaxWeight) * 10) / 10,
      isPR: ex.lastMaxWeight > 0 && ex.thisMaxWeight > ex.lastMaxWeight,
      isNew: ex.lastMaxWeight === 0,
    }))

  // Group nutrition by Israel calendar day
  const nutritionByDay = new Map<string, { calories: number; protein: number }>()
  for (const log of thisWeekNutrition) {
    const key = israelDateStr(log.date)
    const prev = nutritionByDay.get(key) ?? { calories: 0, protein: 0 }
    prev.calories += log.foodItems.reduce((s, i) => s + i.calories, 0)
    prev.protein  += log.foodItems.reduce((s, i) => s + i.protein, 0)
    nutritionByDay.set(key, prev)
  }

  const todayStr = israelDateStr(now)
  const dailyNutrition = Array.from({ length: 7 }, (_, i) => {
    // Each day starts at thisWeekStartQ + i full days
    const dayUTC = new Date(thisWeekStartQ.getTime() + i * 24 * 60 * 60 * 1000)
    const day = israelDateStr(dayUTC)
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
  const proteinDaysHit = dailyNutrition.filter((d) => d.hasData && d.protein >= targetProtein).length

  const thisWeekMetrics = bodyMetrics.filter((m) => new Date(m.date) >= thisWeekStartQ)
  const lastWeekMetrics = bodyMetrics.filter((m) => {
    const d = new Date(m.date)
    return d >= lastWeekStartQ && d < thisWeekStartQ
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

  const workoutsCompleted = thisWeekSessions.length
  const workoutGoal = activePlan?.workouts?.length ?? 3

  const weekLabel = thisWeekStartQ.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jerusalem",
  })

  void MUSCLE_HE_EXTRA

  return {
    targetCalories,
    targetProtein,
    weekLabel,
    progressionList,
    dailyNutrition,
    avgCalories,
    avgProtein,
    proteinDaysHit,
    workoutsCompleted,
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
