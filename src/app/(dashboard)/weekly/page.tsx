// דו"ח שבועי — ניתוח ביצועים מקיף

import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Minus,
  Dumbbell,
  Target,
  Scale,
  Flame,
  Trophy,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { db } from "@/lib/db"
import WeeklyCharts from "./WeeklyCharts"

const DEMO_USER_ID = "demo-user"

const DAY_LABELS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שב'"]

/** Returns "YYYY-MM-DD" using the **local** calendar date, never UTC. */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const MUSCLE_HE: Record<string, string> = {
  chest: "חזה",
  back: "גב",
  shoulders: "כתפיים",
  biceps: "בייספס",
  triceps: "טרייספס",
  legs: "רגליים",
  quads: "קוואדס",
  hamstrings: "ירכיים",
  glutes: "ישבן",
  calves: "שוקיים",
  core: "בטן",
  other: "אחר",
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getWeeklyData() {
  const now = new Date()

  // This week: Sunday 00:00 → now
  const thisWeekStart = new Date(now)
  thisWeekStart.setDate(now.getDate() - now.getDay())
  thisWeekStart.setHours(0, 0, 0, 0)

  // Shift back 3 h (UTC+3 Israel Summer upper bound) so sessions started just
  // after local midnight Sunday aren't missed when the server runs in UTC.
  // Shift back 3 h (UTC+3 Israel Summer upper bound) so sessions started just
  // after local midnight Sunday aren't missed when the server runs in UTC.
  const TZ_OFFSET_MS = 3 * 60 * 60 * 1000
  const thisWeekStartQ = new Date(thisWeekStart.getTime() - TZ_OFFSET_MS)
  const lastWeekStartQ = new Date(thisWeekStartQ.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Last week: previous Sunday — used for body metrics filter
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(thisWeekStart.getDate() - 7)

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
      where: {
        userId: DEMO_USER_ID,
        startedAt: { gte: thisWeekStartQ },
        completedAt: { not: null },
      },
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
      where: { userId: DEMO_USER_ID, date: { gte: thisWeekStart } },
      include: { foodItems: true },
    }),
    db.bodyMetric.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: lastWeekStart } },
      orderBy: { date: "asc" },
    }),
  ])

  // ── Targets ────────────────────────────────────────────────────────────────
  const latestWeight =
    bodyMetrics.filter((m) => new Date(m.date) >= thisWeekStart).at(-1)?.weightKg ??
    bodyMetrics.at(-1)?.weightKg ??
    null

  let targetProtein = user?.targetProtein ?? 185
  if (user?.userSettings?.autoProteinGoal && latestWeight) {
    targetProtein = Math.round(latestWeight * 2.2)
  }
  const targetCalories = user?.targetCalories ?? 2600

  // ── Progressive overload ───────────────────────────────────────────────────
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
        thisVolume: 0,
        thisMaxWeight: 0,
        lastVolume: 0,
        lastMaxWeight: 0,
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
      volumeDeltaPct:
        ex.lastVolume > 0
          ? Math.round(((ex.thisVolume - ex.lastVolume) / ex.lastVolume) * 100)
          : null,
      weightDelta: Math.round((ex.thisMaxWeight - ex.lastMaxWeight) * 10) / 10,
      isPR: ex.lastMaxWeight > 0 && ex.thisMaxWeight > ex.lastMaxWeight,
      isNew: ex.lastMaxWeight === 0,
    }))

  // ── Daily nutrition ────────────────────────────────────────────────────────
  const nutritionByDay = new Map<string, { calories: number; protein: number }>()
  for (const log of thisWeekNutrition) {
    const key = localDateStr(log.date)
    const prev = nutritionByDay.get(key) ?? { calories: 0, protein: 0 }
    prev.calories += log.foodItems.reduce((s, i) => s + i.calories, 0)
    prev.protein += log.foodItems.reduce((s, i) => s + i.protein, 0)
    nutritionByDay.set(key, prev)
  }

  const todayStr = localDateStr(now)
  const dailyNutrition = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(thisWeekStart)
    d.setDate(d.getDate() + i)
    const day = localDateStr(d)
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
  const avgCalories =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
      : 0
  const avgProtein =
    loggedDays.length > 0
      ? Math.round((loggedDays.reduce((s, d) => s + d.protein, 0) / loggedDays.length) * 10) / 10
      : 0
  const proteinDaysHit = dailyNutrition.filter(
    (d) => d.hasData && d.protein >= targetProtein,
  ).length

  // ── Body weight trend ──────────────────────────────────────────────────────
  const thisWeekMetrics = bodyMetrics.filter((m) => new Date(m.date) >= thisWeekStart)
  const lastWeekMetrics = bodyMetrics.filter((m) => {
    const d = new Date(m.date)
    return d >= lastWeekStart && d < thisWeekStart
  })

  const thisWeekAvgWeight =
    thisWeekMetrics.length > 0
      ? Math.round(
          (thisWeekMetrics.reduce((s, m) => s + m.weightKg, 0) / thisWeekMetrics.length) * 100,
        ) / 100
      : null
  const lastWeekAvgWeight =
    lastWeekMetrics.length > 0
      ? Math.round(
          (lastWeekMetrics.reduce((s, m) => s + m.weightKg, 0) / lastWeekMetrics.length) * 100,
        ) / 100
      : null

  const weightDelta =
    thisWeekAvgWeight !== null && lastWeekAvgWeight !== null
      ? Math.round((thisWeekAvgWeight - lastWeekAvgWeight) * 100) / 100
      : null

  // ── Workout adherence ──────────────────────────────────────────────────────
  const workoutsCompleted = thisWeekSessions.length
  const workoutGoal = activePlan?.workouts?.length ?? 3

  const weekLabel = thisWeekStart.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
  })

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

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  iconColor = "text-indigo-400",
}: {
  icon: React.ElementType
  title: string
  iconColor?: string
}) {
  return (
    <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
      <Icon size={16} className={iconColor} />
      {title}
    </h2>
  )
}

function ProgressBar({
  value,
  max,
  color = "bg-indigo-400",
}: {
  value: number
  max: number
  color?: string
}) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WeeklyPage() {
  const data = await getWeeklyData()
  const {
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
  } = data

  const workoutPct = Math.min((workoutsCompleted / workoutGoal) * 100, 100)
  const proteinPct = Math.min((avgProtein / targetProtein) * 100, 100)
  const caloriePct = Math.min((avgCalories / targetCalories) * 100, 100)

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">דו&quot;ח שבועי</h1>
          <p className="text-sm text-slate-400">מ-{weekLabel} עד היום</p>
        </div>
        <CalendarDays size={28} className="text-violet-400" />
      </div>

      {/* ── KPI Grid — Workouts + Protein Days ─────────────── */}
      <div className="grid grid-cols-2 gap-3">

        {/* Workouts */}
        <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Dumbbell size={15} className="text-indigo-400" />
            <p className="text-xs text-slate-400">אימונים</p>
          </div>
          <p className="text-3xl font-bold leading-none">
            {workoutsCompleted}
            <span className="text-slate-500 text-lg font-normal">/{workoutGoal}</span>
          </p>
          <ProgressBar
            value={workoutsCompleted}
            max={workoutGoal}
            color={workoutsCompleted >= workoutGoal ? "bg-green-400" : "bg-indigo-400"}
          />
          <p className="text-[11px] text-slate-500">
            {workoutsCompleted >= workoutGoal ? "יעד הושג! 🎉" : `נותרו ${workoutGoal - workoutsCompleted}`}
          </p>
        </div>

        {/* Protein days */}
        <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-violet-400" />
            <p className="text-xs text-slate-400">ימי חלבון</p>
          </div>
          <p className="text-3xl font-bold leading-none">
            {proteinDaysHit}
            <span className="text-slate-500 text-lg font-normal">/7</span>
          </p>
          <ProgressBar
            value={proteinDaysHit}
            max={7}
            color={
              proteinDaysHit >= 6
                ? "bg-green-400"
                : proteinDaysHit >= 4
                ? "bg-yellow-400"
                : "bg-red-400"
            }
          />
          <p className="text-[11px] text-slate-500">
            {proteinDaysHit >= 6 ? "עמידה מצוינת!" : `יעד: ${targetProtein} גר'`}
          </p>
        </div>
      </div>

      {/* ── Nutrition adherence ─────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <SectionHeader icon={Flame} title="תזונה שבועית" iconColor="text-orange-400" />

        {/* Avg Calories */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">ממוצע קלוריות</span>
            <span
              className={cn(
                "font-semibold",
                avgCalories >= targetCalories * 0.9 && avgCalories <= targetCalories * 1.1
                  ? "text-green-400"
                  : "",
              )}
            >
              {avgCalories}
              <span className="text-slate-500 font-normal"> / {targetCalories} קק&quot;ל</span>
            </span>
          </div>
          <ProgressBar value={caloriePct} max={100} color="bg-orange-400" />
        </div>

        {/* Avg Protein */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">ממוצע חלבון</span>
            <span className={cn("font-semibold", avgProtein >= targetProtein ? "text-green-400" : "")}>
              {avgProtein}
              <span className="text-slate-500 font-normal"> / {targetProtein} גר&apos;</span>
            </span>
          </div>
          <ProgressBar
            value={proteinPct}
            max={100}
            color={avgProtein >= targetProtein ? "bg-green-400" : "bg-violet-400"}
          />
        </div>

        {/* Protein day dots */}
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2.5">
          <p className="text-[11px] text-slate-400 mb-2">עמידה ביעד חלבון — יום לפי יום</p>
          <div className="flex gap-1.5 justify-between">
            {dailyNutrition.map((day, i) => {
              const hit = day.hasData && day.protein >= targetProtein
              const missed = day.hasData && !hit
              const future = day.isFuture
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1",
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold",
                      hit
                        ? "bg-green-500 text-white"
                        : missed
                        ? "bg-red-500/30 text-red-300 border border-red-500/30"
                        : future
                        ? "bg-slate-800/50 text-slate-700"
                        : "bg-slate-800 text-slate-600",
                    )}
                  >
                    {day.label}
                  </div>
                  {day.hasData && (
                    <p className="text-[9px] text-slate-600 text-center leading-none">
                      {day.protein}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Body weight trend ───────────────────────────────── */}
      {(thisWeekAvgWeight !== null || lastWeekAvgWeight !== null) && (
        <div className="bg-slate-900 rounded-2xl p-4">
          <SectionHeader icon={Scale} title="מגמת משקל גוף" iconColor="text-teal-400" />

          <div className="mt-4 grid grid-cols-3 gap-2 items-center">
            {/* Last week avg */}
            <div className="text-center">
              <p className="text-[11px] text-slate-500 mb-1">שבוע קודם</p>
              <p className="text-xl font-bold">
                {lastWeekAvgWeight ?? "—"}
                <span className="text-xs text-slate-500 font-normal"> ק&quot;ג</span>
              </p>
              {lastWeekAvgWeight && (
                <p className="text-[10px] text-slate-600">ממוצע 7י'</p>
              )}
            </div>

            {/* Delta */}
            <div className="flex flex-col items-center gap-1">
              {weightDelta !== null ? (
                <>
                  <div
                    className={cn(
                      "flex items-center gap-1 text-base font-bold",
                      weightDelta > 0
                        ? "text-amber-400"
                        : weightDelta < 0
                        ? "text-teal-400"
                        : "text-slate-400",
                    )}
                  >
                    {weightDelta > 0 ? (
                      <TrendingUp size={16} />
                    ) : weightDelta < 0 ? (
                      <TrendingDown size={16} />
                    ) : (
                      <Minus size={16} />
                    )}
                    {weightDelta > 0 ? "+" : ""}
                    {weightDelta} ק&quot;ג
                  </div>
                  <p className="text-[10px] text-slate-500">שינוי</p>
                </>
              ) : (
                <p className="text-xs text-slate-600 text-center">אין נתוני השוואה</p>
              )}
            </div>

            {/* This week avg */}
            <div className="text-center">
              <p className="text-[11px] text-slate-500 mb-1">השבוע</p>
              <p className="text-xl font-bold">
                {thisWeekAvgWeight ?? "—"}
                <span className="text-xs text-slate-500 font-normal"> ק&quot;ג</span>
              </p>
              {thisWeekAvgWeight && (
                <p className="text-[10px] text-slate-600">ממוצע {thisWeekAvgWeight && lastWeekAvgWeight ? "7י'" : "חלקי"}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 7-day nutrition charts ──────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl p-4">
        <SectionHeader icon={Flame} title="תזונה — 7 ימים" iconColor="text-orange-400" />
        <div className="mt-4">
          <WeeklyCharts
            dailyNutrition={dailyNutrition}
            targetCalories={targetCalories}
            targetProtein={targetProtein}
          />
        </div>
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          קו מקווקו = יעד · ירוק = בטווח היעד
        </p>
      </div>

      {/* ── Progressive overload ────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl p-4">
        <SectionHeader icon={TrendingUp} title="עומס פרוגרסיבי" iconColor="text-green-400" />

        {progressionList.length === 0 ? (
          <div className="mt-4 text-center py-4">
            <TrendingUp size={32} className="text-slate-800 mx-auto mb-2" />
            <p className="text-sm text-slate-500">אין נתוני אימון השבוע עדיין</p>
            <p className="text-xs text-slate-600 mt-1">לאחר האימון הראשון, תראה כאן ניתוח עומס</p>
          </div>
        ) : (
          <div className="mt-3 space-y-0">
            {/* Header row */}
            <div className="flex items-center justify-between text-[10px] text-slate-600 uppercase tracking-wide pb-1 border-b border-slate-800">
              <span>תרגיל</span>
              <div className="flex gap-4 text-end">
                <span className="w-16">נפח</span>
                <span className="w-16">מקסימום</span>
              </div>
            </div>

            {progressionList.map((ex, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0"
              >
                {/* Exercise name */}
                <div className="flex-1 min-w-0 me-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold leading-tight">{ex.name}</p>
                    {ex.isPR && (
                      <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shrink-0">
                        <Trophy size={9} /> שיא!
                      </span>
                    )}
                    {ex.isNew && (
                      <span className="text-[10px] font-bold text-indigo-400 bg-indigo-400/10 border border-indigo-400/20 rounded-full px-1.5 py-0.5 shrink-0">
                        חדש
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {MUSCLE_HE[ex.primaryMuscle] ?? ex.primaryMuscle}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex gap-4 shrink-0">
                  {/* Volume delta */}
                  <div className="w-16 text-end">
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        ex.volumeDelta > 0
                          ? "text-green-400"
                          : ex.volumeDelta < 0
                          ? "text-red-400"
                          : "text-slate-400",
                      )}
                    >
                      {ex.volumeDelta > 0 ? "+" : ""}
                      {ex.volumeDelta} ק&quot;ג
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {ex.volumeDeltaPct !== null
                        ? `${ex.volumeDeltaPct > 0 ? "+" : ""}${ex.volumeDeltaPct}%`
                        : "—"}
                    </p>
                  </div>

                  {/* Max weight delta */}
                  <div className="w-16 text-end">
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        ex.weightDelta > 0
                          ? "text-green-400"
                          : ex.weightDelta < 0
                          ? "text-red-400"
                          : "text-slate-400",
                      )}
                    >
                      {ex.weightDelta > 0 ? "+" : ""}
                      {ex.weightDelta} ק&quot;ג
                    </p>
                    <p className="text-[10px] text-slate-600">{ex.thisMaxWeight} מקס&apos;</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
