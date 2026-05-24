import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000 // Israel UTC+3

// Sugar limit used for coaching analysis: 50g/day is a common sports nutrition guideline.
const SUGAR_LIMIT_G = 50

function israelDateStr(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function getWeekBounds(weeksAgo = 0): { start: Date; end: Date; startStr: string; endStr: string } {
  const now = new Date()
  const shifted = new Date(now.getTime() + TZ_OFFSET_MS)
  // Sunday = 0 in Israel calendar (JS getUTCDay after shift)
  const dayOfWeek = shifted.getUTCDay()
  const msToSunday = dayOfWeek * 24 * 60 * 60 * 1000
  const shiftedSunday = new Date(shifted.getTime() - msToSunday - weeksAgo * 7 * 24 * 60 * 60 * 1000)
  shiftedSunday.setUTCHours(0, 0, 0, 0)
  const shiftedSaturday = new Date(shiftedSunday.getTime() + 6 * 24 * 60 * 60 * 1000)
  shiftedSaturday.setUTCHours(23, 59, 59, 999)

  const start = new Date(shiftedSunday.getTime() - TZ_OFFSET_MS)
  const end   = new Date(shiftedSaturday.getTime() - TZ_OFFSET_MS)

  return {
    start,
    end,
    startStr: israelDateStr(start),
    endStr:   israelDateStr(end),
  }
}

export interface WeeklyReportDay {
  date: string         // "YYYY-MM-DD" Israel local
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

/** GET /api/reports/weekly?weeksAgo=0
 *
 * Returns a structured weekly report cross-referencing workout sessions with
 * daily nutrition (sugar, protein, calories). Used by the cron mailer and
 * optionally surfaced in the dashboard.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const weeksAgo = Math.max(0, parseInt(searchParams.get("weeksAgo") ?? "0", 10) || 0)

    const { start, end, startStr, endStr } = getWeekBounds(weeksAgo)

    const [user, sessions, logs] = await Promise.all([
      db.user.findUnique({
        where: { id: DEMO_USER_ID },
        select: { targetCalories: true, targetProtein: true },
      }),
      db.workoutSession.findMany({
        where: { userId: DEMO_USER_ID, completedAt: { gte: start, lte: end } },
        include: {
          workout: { select: { name: true } },
          sets:    { where: { isWarmup: false } },
        },
        orderBy: { completedAt: "asc" },
      }),
      db.nutritionLog.findMany({
        where: { userId: DEMO_USER_ID, date: { gte: start, lte: end } },
        include: { foodItems: true },
        orderBy: { date: "asc" },
      }),
    ])

    const targetCalories = user?.targetCalories ?? 2500
    const targetProtein  = user?.targetProtein  ?? 180

    // Build per-day nutrition map
    const nutritionByDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number; sugar: number; saturatedFat: number }>()

    for (const log of logs) {
      const dateStr = israelDateStr(log.date)
      const existing = nutritionByDay.get(dateStr) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, saturatedFat: 0 }
      for (const item of log.foodItems) {
        existing.calories     += item.calories
        existing.protein      += item.protein
        existing.carbs        += item.carbs
        existing.fat          += item.fat
        existing.sugar        += item.sugar
        existing.saturatedFat += item.saturatedFat
      }
      nutritionByDay.set(dateStr, existing)
    }

    // Build per-day workout map (most recent session per day wins)
    const workoutByDay = new Map<string, { name: string; volume: number }>()
    for (const session of sessions) {
      if (!session.completedAt) continue
      const dateStr = israelDateStr(session.completedAt)
      const volume  = session.sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
      workoutByDay.set(dateStr, { name: session.workout.name, volume })
    }

    // Assemble 7-day report
    const days: WeeklyReportDay[] = []
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      const dateStr  = israelDateStr(dayStart)
      const nutrition = nutritionByDay.get(dateStr)
      const workout   = workoutByDay.get(dateStr)

      days.push({
        date:            dateStr,
        isWorkoutDay:    !!workout,
        workoutName:     workout?.name ?? null,
        workoutVolume:   workout ? Math.round(workout.volume) : null,
        calories:        Math.round(nutrition?.calories     ?? 0),
        protein:         Math.round((nutrition?.protein     ?? 0) * 10) / 10,
        carbs:           Math.round(nutrition?.carbs        ?? 0),
        fat:             Math.round((nutrition?.fat         ?? 0) * 10) / 10,
        sugar:           Math.round((nutrition?.sugar       ?? 0) * 10) / 10,
        saturatedFat:    Math.round((nutrition?.saturatedFat ?? 0) * 10) / 10,
        proteinTargetHit: (nutrition?.protein ?? 0) >= targetProtein,
        sugarOverLimit:   (nutrition?.sugar   ?? 0) >  SUGAR_LIMIT_G,
      })
    }

    const workoutDays  = days.filter((d) => d.isWorkoutDay)
    const loggedDays   = days.filter((d) => d.calories > 0)

    const proteinGoalHitOnWorkoutDays = workoutDays.filter((d) => d.proteinTargetHit).length
    const sugarOnWorkoutDays = workoutDays.map((d) => d.sugar)
    const avgSugarOnWorkoutDays =
      sugarOnWorkoutDays.length > 0
        ? Math.round((sugarOnWorkoutDays.reduce((a, b) => a + b, 0) / sugarOnWorkoutDays.length) * 10) / 10
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
          ? Math.round((loggedDays.reduce((a, d) => a + d.protein, 0) / loggedDays.length) * 10) / 10
          : 0,
    }

    const report: WeeklyReport = {
      weekStart: startStr,
      weekEnd:   endStr,
      days,
      summary,
      user: { targetCalories, targetProtein },
    }

    return NextResponse.json(report)
  } catch (err) {
    console.error("[GET /api/reports/weekly]", err)
    return NextResponse.json({ error: "שגיאה בייצור הדוח השבועי" }, { status: 500 })
  }
}
