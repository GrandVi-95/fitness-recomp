import { db } from "@/lib/db"
import { addDaysStr, getLocalWeekBounds, localDateStr } from "@/lib/time"
import { resolveTargets } from "@/lib/targets-server"
import { isProteinOnTarget, totalSugarReferenceG } from "@/utils/nutrition-math"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyReportDay {
  date: string          // "YYYY-MM-DD" Israel local
  isWorkoutDay: boolean
  workoutName: string | null     // joined names when several sessions
  sessionCount: number
  workoutVolume: number | null   // kg × reps, working sets only, all sessions that day
  isLogged: boolean              // any nutrition logged that day
  calories: number
  protein: number
  carbs: number
  fat: number
  sugar: number
  saturatedFat: number
  // Targets that applied THAT day (DayPlan snapshot, else current targets)
  targetCalories: number
  targetProtein: number
  sugarReferenceG: number
  proteinTargetHit: boolean      // same Green-Zone rule as the dashboard
  sugarOverLimit: boolean        // above the TOTAL-sugar reference
}

export interface WeeklyReportSummary {
  workoutDaysCount: number
  sessionCount: number
  loggedDaysCount: number
  proteinGoalHitOnWorkoutDays: number
  loggedWorkoutDaysCount: number
  avgSugarOnWorkoutDays: number
  sugarOverLimitDays: number
  sugarLimitG: number
  /** Average over LOGGED days only — "recorded intake", not true intake. */
  avgCalories: number
  avgProtein: number
}

export interface WeeklyReport {
  weekStart: string
  weekEnd: string
  days: WeeklyReportDay[]
  summary: WeeklyReportSummary
  user: { targetCalories: number; targetProtein: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Kept for callers that format dates for display. */
export const israelDateStr = localDateStr

export function getWeekBounds(weeksAgo = 0) {
  const b = getLocalWeekBounds(weeksAgo)
  return { start: b.start, end: b.nextStart, startStr: b.startStr, endStr: b.endStr }
}

// ── Core query ────────────────────────────────────────────────────────────────

export async function getWeeklyReport(
  userId: string,
  weeksAgo = 0,
): Promise<WeeklyReport> {
  const { start, nextStart, startStr, endStr } = getLocalWeekBounds(weeksAgo)

  const [current, sessions, logs, dayPlans, weights] = await Promise.all([
    resolveTargets(userId),
    db.workoutSession.findMany({
      where:     { userId, completedAt: { gte: start, lt: nextStart } },
      include:   { workout: { select: { name: true } }, sets: { where: { isWarmup: false } } },
      orderBy:   { completedAt: "asc" },
    }),
    db.nutritionLog.findMany({
      where:   { userId, date: { gte: start, lt: nextStart } },
      include: { foodItems: true },
      orderBy: { date: "asc" },
    }),
    db.dayPlan.findMany({ where: { userId, date: { gte: startStr, lte: endStr } } }),
    db.bodyMetric.findMany({
      where:   { userId, date: { lt: nextStart } },
      orderBy: { date: "desc" },
      take:    30,
      select:  { date: true, weightKg: true },
    }),
  ])

  // Per-day nutrition accumulator (null sub-nutrients = unknown → count as 0)
  const nutritionByDay = new Map<
    string,
    { calories: number; protein: number; carbs: number; fat: number; sugar: number; saturatedFat: number }
  >()
  for (const log of logs) {
    const key = localDateStr(log.date)
    const acc = nutritionByDay.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, saturatedFat: 0 }
    for (const item of log.foodItems) {
      acc.calories     += item.calories
      acc.protein      += item.protein
      acc.carbs        += item.carbs
      acc.fat          += item.fat
      acc.sugar        += item.sugar ?? 0
      acc.saturatedFat += item.saturatedFat ?? 0
    }
    nutritionByDay.set(key, acc)
  }

  // Per-day workouts — ALL sessions accumulate (two sessions in a day both count)
  const workoutByDay = new Map<string, { names: string[]; volume: number; count: number }>()
  for (const session of sessions) {
    if (!session.completedAt) continue
    const key = localDateStr(session.completedAt)
    const acc = workoutByDay.get(key) ?? { names: [], volume: 0, count: 0 }
    acc.names.push(session.workout.name)
    acc.volume += session.sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
    acc.count += 1
    workoutByDay.set(key, acc)
  }

  const planByDay = new Map(dayPlans.map((d) => [d.date, d]))
  // Bodyweight that applied on a day = latest weigh-in on or before it.
  const weightOn = (day: string) =>
    weights.find((w) => localDateStr(w.date) <= day)?.weightKg ?? current.weightKg

  const days: WeeklyReportDay[] = []
  for (let i = 0; i < 7; i++) {
    const key       = addDaysStr(startStr, i)
    const nutrition = nutritionByDay.get(key)
    const workout   = workoutByDay.get(key)
    const plan      = planByDay.get(key)
    const targetCalories = plan && plan.targetCalories > 0 ? plan.targetCalories : current.base.calories
    const targetProtein  = plan && plan.targetProtein > 0 ? plan.targetProtein : current.base.protein
    const sugarReferenceG = totalSugarReferenceG(targetCalories)
    const protein = nutrition?.protein ?? 0

    days.push({
      date:             key,
      isWorkoutDay:     !!workout,
      workoutName:      workout ? workout.names.join(" + ") : null,
      sessionCount:     workout?.count ?? 0,
      workoutVolume:    workout ? Math.round(workout.volume) : null,
      isLogged:         !!nutrition,
      calories:         Math.round(nutrition?.calories      ?? 0),
      protein:          Math.round(protein * 10) / 10,
      carbs:            Math.round(nutrition?.carbs         ?? 0),
      fat:              Math.round((nutrition?.fat          ?? 0) * 10) / 10,
      sugar:            Math.round((nutrition?.sugar        ?? 0) * 10) / 10,
      saturatedFat:     Math.round((nutrition?.saturatedFat ?? 0) * 10) / 10,
      targetCalories,
      targetProtein,
      sugarReferenceG,
      proteinTargetHit: !!nutrition && isProteinOnTarget(protein, weightOn(key), targetProtein),
      sugarOverLimit:   (nutrition?.sugar ?? 0) > sugarReferenceG,
    })
  }

  const workoutDays = days.filter((d) => d.isWorkoutDay)
  const loggedDays  = days.filter((d) => d.isLogged)
  // Unlogged days are "unknown", not "missed" — only judge logged workout days.
  const loggedWorkoutDays = workoutDays.filter((d) => d.isLogged)

  const sugarOnWorkoutDays = loggedWorkoutDays.map((d) => d.sugar)
  const avgSugarOnWorkoutDays =
    sugarOnWorkoutDays.length > 0
      ? Math.round((sugarOnWorkoutDays.reduce((a, b) => a + b, 0) / sugarOnWorkoutDays.length) * 10) / 10
      : 0

  const summary: WeeklyReportSummary = {
    workoutDaysCount:            workoutDays.length,
    sessionCount:                days.reduce((a, d) => a + d.sessionCount, 0),
    loggedDaysCount:             loggedDays.length,
    proteinGoalHitOnWorkoutDays: loggedWorkoutDays.filter((d) => d.proteinTargetHit).length,
    loggedWorkoutDaysCount:      loggedWorkoutDays.length,
    avgSugarOnWorkoutDays,
    sugarOverLimitDays:          days.filter((d) => d.sugarOverLimit).length,
    sugarLimitG:                 current.sugarReferenceG,
    avgCalories:
      loggedDays.length > 0
        ? Math.round(loggedDays.reduce((a, d) => a + d.calories, 0) / loggedDays.length)
        : 0,
    avgProtein:
      loggedDays.length > 0
        ? Math.round((loggedDays.reduce((a, d) => a + d.protein, 0) / loggedDays.length) * 10) / 10
        : 0,
  }

  return {
    weekStart: startStr,
    weekEnd: endStr,
    days,
    summary,
    user: { targetCalories: current.base.calories, targetProtein: current.base.protein },
  }
}
