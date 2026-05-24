import { db } from "@/lib/db"

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000 // Israel UTC+3

export const SUGAR_LIMIT_G = 50

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyReportDay {
  date: string          // "YYYY-MM-DD" Israel local
  isWorkoutDay: boolean
  workoutName: string | null
  workoutVolume: number | null   // kg × reps, working sets only
  calories: number
  protein: number
  carbs: number
  fat: number
  sugar: number
  saturatedFat: number
  proteinTargetHit: boolean
  sugarOverLimit: boolean
}

export interface WeeklyReportSummary {
  workoutDaysCount: number
  loggedDaysCount: number
  proteinGoalHitOnWorkoutDays: number
  avgSugarOnWorkoutDays: number
  sugarOverLimitDays: number
  sugarLimitG: number
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

export function israelDateStr(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS)
  const y   = shifted.getUTCFullYear()
  const m   = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function getWeekBounds(weeksAgo = 0): {
  start: Date
  end: Date
  startStr: string
  endStr: string
} {
  const now = new Date()
  const shifted = new Date(now.getTime() + TZ_OFFSET_MS)
  const dayOfWeek = shifted.getUTCDay() // Sunday = 0
  const msToSunday = dayOfWeek * 24 * 60 * 60 * 1000
  const shiftedSunday = new Date(
    shifted.getTime() - msToSunday - weeksAgo * 7 * 24 * 60 * 60 * 1000,
  )
  shiftedSunday.setUTCHours(0, 0, 0, 0)
  const shiftedSaturday = new Date(shiftedSunday.getTime() + 6 * 24 * 60 * 60 * 1000)
  shiftedSaturday.setUTCHours(23, 59, 59, 999)

  const start = new Date(shiftedSunday.getTime()   - TZ_OFFSET_MS)
  const end   = new Date(shiftedSaturday.getTime() - TZ_OFFSET_MS)
  return { start, end, startStr: israelDateStr(start), endStr: israelDateStr(end) }
}

// ── Core query ────────────────────────────────────────────────────────────────

export async function getWeeklyReport(
  userId: string,
  weeksAgo = 0,
): Promise<WeeklyReport> {
  const { start, end, startStr, endStr } = getWeekBounds(weeksAgo)

  const [user, sessions, logs] = await Promise.all([
    db.user.findUnique({
      where:  { id: userId },
      select: { targetCalories: true, targetProtein: true },
    }),
    db.workoutSession.findMany({
      where:     { userId, completedAt: { gte: start, lte: end } },
      include:   { workout: { select: { name: true } }, sets: { where: { isWarmup: false } } },
      orderBy:   { completedAt: "asc" },
    }),
    db.nutritionLog.findMany({
      where:   { userId, date: { gte: start, lte: end } },
      include: { foodItems: true },
      orderBy: { date: "asc" },
    }),
  ])

  const targetCalories = user?.targetCalories ?? 2500
  const targetProtein  = user?.targetProtein  ?? 180

  // Per-day nutrition accumulator
  const nutritionByDay = new Map<
    string,
    { calories: number; protein: number; carbs: number; fat: number; sugar: number; saturatedFat: number }
  >()
  for (const log of logs) {
    const key = israelDateStr(log.date)
    const acc = nutritionByDay.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, saturatedFat: 0 }
    for (const item of log.foodItems) {
      acc.calories     += item.calories
      acc.protein      += item.protein
      acc.carbs        += item.carbs
      acc.fat          += item.fat
      acc.sugar        += item.sugar
      acc.saturatedFat += item.saturatedFat
    }
    nutritionByDay.set(key, acc)
  }

  // Per-day workout map (last session per day wins if multiple)
  const workoutByDay = new Map<string, { name: string; volume: number }>()
  for (const session of sessions) {
    if (!session.completedAt) continue
    const key    = israelDateStr(session.completedAt)
    const volume = session.sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
    workoutByDay.set(key, { name: session.workout.name, volume })
  }

  // Assemble the 7-day array
  const days: WeeklyReportDay[] = []
  for (let i = 0; i < 7; i++) {
    const dayDate   = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    const key       = israelDateStr(dayDate)
    const nutrition = nutritionByDay.get(key)
    const workout   = workoutByDay.get(key)

    days.push({
      date:             key,
      isWorkoutDay:     !!workout,
      workoutName:      workout?.name ?? null,
      workoutVolume:    workout ? Math.round(workout.volume) : null,
      calories:         Math.round(nutrition?.calories      ?? 0),
      protein:          Math.round((nutrition?.protein      ?? 0) * 10) / 10,
      carbs:            Math.round(nutrition?.carbs         ?? 0),
      fat:              Math.round((nutrition?.fat          ?? 0) * 10) / 10,
      sugar:            Math.round((nutrition?.sugar        ?? 0) * 10) / 10,
      saturatedFat:     Math.round((nutrition?.saturatedFat ?? 0) * 10) / 10,
      proteinTargetHit: (nutrition?.protein ?? 0) >= targetProtein,
      sugarOverLimit:   (nutrition?.sugar   ?? 0) >  SUGAR_LIMIT_G,
    })
  }

  const workoutDays = days.filter((d) => d.isWorkoutDay)
  const loggedDays  = days.filter((d) => d.calories > 0)

  const proteinGoalHitOnWorkoutDays = workoutDays.filter((d) => d.proteinTargetHit).length
  const sugarOnWorkoutDays = workoutDays.map((d) => d.sugar)
  const avgSugarOnWorkoutDays =
    sugarOnWorkoutDays.length > 0
      ? Math.round(
          (sugarOnWorkoutDays.reduce((a, b) => a + b, 0) / sugarOnWorkoutDays.length) * 10,
        ) / 10
      : 0

  const summary: WeeklyReportSummary = {
    workoutDaysCount:            workoutDays.length,
    loggedDaysCount:             loggedDays.length,
    proteinGoalHitOnWorkoutDays,
    avgSugarOnWorkoutDays,
    sugarOverLimitDays:          days.filter((d) => d.sugarOverLimit).length,
    sugarLimitG:                 SUGAR_LIMIT_G,
    avgCalories:
      loggedDays.length > 0
        ? Math.round(loggedDays.reduce((a, d) => a + d.calories, 0) / loggedDays.length)
        : 0,
    avgProtein:
      loggedDays.length > 0
        ? Math.round(
            (loggedDays.reduce((a, d) => a + d.protein, 0) / loggedDays.length) * 10,
          ) / 10
        : 0,
  }

  return { weekStart: startStr, weekEnd: endStr, days, summary, user: { targetCalories, targetProtein } }
}
