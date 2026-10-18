// ─── Server-side target resolution — ONE function every screen uses ─────────
// Dashboard, nutrition page, /api/nutrition/today, settings, check-ins and the
// weekly report all resolve targets here, so they can never disagree.
// Imports `db` — never import from Client Components.

import { db } from "@/lib/db"
import { addDaysStr, localDateStr, startOfLocalDay } from "@/lib/time"
import {
  calculateBMR,
  calculateTDEE,
  calculateCurrentTarget,
  computeDayTargets,
  dailyAveragedMean,
  normalizeGoal,
  totalSugarReferenceG,
  type Goal,
  type MacroTargets,
} from "@/utils/nutrition-math"
import { computeTargets } from "@/lib/nutrition"

export interface ResolvedTargets {
  dateStr: string
  goal: Goal
  isTrainingDay: boolean
  /** Where isTrainingDay came from: the user's toggle, or nothing (unset →
   *  the day gets the AVERAGE targets, never the training bonus). */
  dayTypeSource: "explicit" | "unset"
  trainingDaysPerWeek: number
  /** Trend weight (mean of daily means over the last 7 local days), else latest. */
  weightKg: number | null
  /** Average-day targets (weekly budget ÷ 7). */
  base: MacroTargets
  /** Targets for this specific day (training/rest adjusted). */
  day: MacroTargets
  sugarReferenceG: number
}

/** Trend weight: mean of per-day means over the 7 local days ending `dateStr`. */
export async function getTrendWeight(userId: string, dateStr: string = localDateStr()): Promise<number | null> {
  const since = startOfLocalDay(addDaysStr(dateStr, -6))
  const until = startOfLocalDay(addDaysStr(dateStr, 1))
  const rows = await db.bodyMetric.findMany({
    where: { userId, date: { gte: since, lt: until } },
    select: { weightKg: true, date: true },
  })
  if (rows.length > 0) {
    const { mean } = dailyAveragedMean(rows.map((r) => ({ day: localDateStr(r.date), value: r.weightKg })))
    return Math.round(mean * 10) / 10
  }
  const latest = await db.bodyMetric.findFirst({
    where: { userId, date: { lt: until } },
    orderBy: { date: "desc" },
    select: { weightKg: true },
  })
  return latest?.weightKg ?? null
}

/**
 * Computes the average-day calorie target from the profile (auto mode) or the
 * stored manual value. Exposed so writers (settings/metrics/check-in) and
 * readers share one formula.
 */
export function computeCalorieTarget(params: {
  autoCalorieGoal: boolean
  storedCalories: number | null | undefined
  weightKg: number | null
  heightCm: number
  age: number
  gender: string
  activityMultiplier: number
  offset: number
  goal: Goal
}): number {
  if (params.autoCalorieGoal && params.weightKg) {
    const bmr = calculateBMR(params.weightKg, params.heightCm, params.age, params.gender)
    const tdee = calculateTDEE(bmr, params.activityMultiplier)
    return calculateCurrentTarget(tdee, params.offset, params.goal, bmr)
  }
  return params.storedCalories ?? 2600
}

export async function resolveTargets(userId: string, dateStr: string = localDateStr()): Promise<ResolvedTargets> {
  const [user, settings, dayPlan, weightKg] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { targetCalories: true, targetProtein: true, targetFats: true },
    }),
    db.userSettings.findUnique({ where: { userId } }),
    db.dayPlan.findUnique({ where: { userId_date: { userId, date: dateStr } } }),
    getTrendWeight(userId, dateStr),
  ])

  const goal = normalizeGoal(settings?.goal)
  const trainingDaysPerWeek = settings?.trainingDaysPerWeek ?? 4
  const calories = computeCalorieTarget({
    autoCalorieGoal: settings?.autoCalorieGoal ?? true,
    storedCalories: user?.targetCalories,
    weightKg,
    heightCm: settings?.height ?? 183,
    age: settings?.age ?? 31,
    gender: settings?.gender ?? "male",
    activityMultiplier: settings?.activityMultiplier ?? 1.45,
    offset: settings?.calorieAdjustmentOffset ?? 0,
    goal,
  })
  const base = computeTargets({
    targetCalories: calories,
    targetProtein: user?.targetProtein,
    targetFats: user?.targetFats,
    autoProteinGoal: settings?.autoProteinGoal ?? true,
    weightKg,
  })
  // Only the user's explicit toggle makes a day a training or rest day. An
  // unmarked day gets the average-day targets: the training bonus is funded
  // by rest-day cuts, so granting it without the matching rest days (e.g.
  // inferred from a workout) would push the week over budget. Marking every
  // day per the plan reproduces the weekly total exactly.
  const dayTypeSource: ResolvedTargets["dayTypeSource"] = dayPlan?.explicitDayType ? "explicit" : "unset"
  const isTrainingDay = dayTypeSource === "explicit" ? dayPlan!.isTrainingDay : true
  const day = dayTypeSource === "unset" ? base : computeDayTargets(base, isTrainingDay, trainingDaysPerWeek)

  return {
    dateStr,
    goal,
    isTrainingDay,
    dayTypeSource,
    trainingDaysPerWeek,
    weightKg,
    base,
    day,
    sugarReferenceG: totalSugarReferenceG(day.calories),
  }
}

/**
 * Persists today's (or `dateStr`'s) day type + target snapshot, so history is
 * judged against the target that applied THAT day. Idempotent upsert.
 */
export async function snapshotDayPlan(
  userId: string,
  dateStr: string = localDateStr(),
  isTrainingDay?: boolean,
): Promise<ResolvedTargets> {
  if (isTrainingDay !== undefined) {
    // Write the day type first so the resolved targets reflect it.
    await db.dayPlan.upsert({
      where: { userId_date: { userId, date: dateStr } },
      update: { isTrainingDay, explicitDayType: true },
      create: {
        userId, date: dateStr, isTrainingDay, explicitDayType: true,
        targetCalories: 0, targetProtein: 0, targetCarbs: 0, targetFats: 0,
      },
    })
  }
  const t = await resolveTargets(userId, dateStr)
  const snapshot = {
    targetCalories: t.day.calories,
    targetProtein: t.day.protein,
    targetCarbs: t.day.carbs,
    targetFats: t.day.fat,
  }
  await db.dayPlan.upsert({
    where: { userId_date: { userId, date: dateStr } },
    update: snapshot,
    create: { userId, date: dateStr, isTrainingDay: t.isTrainingDay, ...snapshot },
  })
  return t
}

/**
 * Re-derives and stores the user's average-day targets (User.target*). Call
 * after anything that changes an input: weight, profile, goal, offset.
 */
export async function syncStoredTargets(userId: string): Promise<ResolvedTargets | null> {
  try {
    return await syncStoredTargetsInner(userId)
  } catch (err) {
    // Stored targets are a cache of resolveTargets() (which every screen
    // reads live), so a failed sync must not turn an already-committed
    // write into a 500 that invites a duplicate retry.
    console.error("[syncStoredTargets]", err instanceof Error ? err.message : err)
    return null
  }
}

async function syncStoredTargetsInner(userId: string): Promise<ResolvedTargets> {
  const t = await resolveTargets(userId)
  await db.user.update({
    where: { id: userId },
    data: {
      targetCalories: t.base.calories,
      targetProtein: t.base.protein,
      targetFats: t.base.fat,
      targetCarbs: t.base.carbs,
    },
  })
  // Keep today's snapshot in step with the new targets.
  await snapshotDayPlan(userId, t.dateStr)
  return t
}
