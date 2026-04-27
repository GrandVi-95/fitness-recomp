// לוח בקרה — סיכום ההתקדמות היומית

import {
  Dumbbell,
  Flame,
  Beef,
  TrendingUp,
  Zap,
  AlertTriangle,
  ChevronLeft,
  CalendarDays,
  Trophy,
  BarChart3,
} from "lucide-react"
import Link from "next/link"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** Returns "YYYY-MM-DD" using the local calendar date, never UTC. */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ── Server data helpers ──────────────────────────────────────────────────────

async function getDashboardData() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  // Current week: Sunday → today
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay()) // back to Sunday
  startOfWeek.setHours(0, 0, 0, 0)

  // Last 2 completed days (not today) for smart alert
  const twoDaysAgo = new Date(startOfDay)
  twoDaysAgo.setDate(startOfDay.getDate() - 2)

  const [
    user,
    nutritionLogs,
    latestMetric,
    lastSession,
    activePlan,
    weeklyNutritionLogs,
    weeklyWorkoutsCompleted,
    alertNutritionLogs,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: DEMO_USER_ID },
      include: { userSettings: true },
    }),
    db.nutritionLog.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: startOfDay, lte: endOfDay } },
      include: { foodItems: true },
    }),
    db.bodyMetric.findFirst({
      where: { userId: DEMO_USER_ID },
      orderBy: { date: "desc" },
    }),
    db.workoutSession.findFirst({
      where: { userId: DEMO_USER_ID },
      orderBy: { startedAt: "desc" },
      include: { workout: true },
    }),
    db.workoutPlan.findFirst({
      where: { userId: DEMO_USER_ID, isActive: true },
      include: { workouts: { orderBy: { order: "asc" } } },
    }),
    db.nutritionLog.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: startOfWeek, lte: endOfDay } },
      include: { foodItems: true },
    }),
    db.workoutSession.count({
      where: {
        userId: DEMO_USER_ID,
        startedAt: { gte: startOfWeek },
        completedAt: { not: null },
      },
    }),
    db.nutritionLog.findMany({
      where: { userId: DEMO_USER_ID, date: { gte: twoDaysAgo, lt: startOfDay } },
      include: { foodItems: true },
    }),
  ])

  // Today's nutrition
  const allItems = nutritionLogs.flatMap((l) => l.foodItems)
  const todayNutrition = allItems.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  // Targets
  const settings = user?.userSettings
  const latestWeight = latestMetric?.weightKg ?? null
  const targetCalories = user?.targetCalories ?? 2600
  let targetProtein = user?.targetProtein ?? 185
  if (settings?.autoProteinGoal && latestWeight) {
    targetProtein = Math.round(latestWeight * 2.2)
  }
  const targetFats = user?.targetFats ?? Math.round((targetCalories * 0.25) / 9)
  const targetCarbs = user?.targetCarbs ?? Math.round((targetCalories - targetProtein * 4 - targetFats * 9) / 4)

  // Next workout
  let nextWorkout: { name: string; dayLabel: string } | null = null
  if (activePlan?.workouts?.length) {
    if (!lastSession) {
      nextWorkout = activePlan.workouts[0]
    } else {
      const idx = activePlan.workouts.findIndex((w) => w.id === lastSession.workoutId)
      nextWorkout = activePlan.workouts[(idx + 1) % activePlan.workouts.length]
    }
  }

  // ── Weekly summary ────────────────────────────────────────────────────────
  const showWeeklySummary = settings?.showWeeklySummary ?? true
  let weeklySummary: {
    workoutsCompleted: number
    workoutGoal: number
    avgCalories: number
    avgProtein: number
    summaryText: string
    weekStart: Date
  } | null = null

  if (showWeeklySummary) {
    const weekDayMap = new Map<string, { calories: number; protein: number }>()
    for (const log of weeklyNutritionLogs) {
      const key = localDateStr(log.date)
      const prev = weekDayMap.get(key) ?? { calories: 0, protein: 0 }
      prev.calories += log.foodItems.reduce((s, i) => s + i.calories, 0)
      prev.protein += log.foodItems.reduce((s, i) => s + i.protein, 0)
      weekDayMap.set(key, prev)
    }

    const loggedDays = weekDayMap.size
    const vals = [...weekDayMap.values()]
    const avgCalories =
      loggedDays > 0 ? Math.round(vals.reduce((s, d) => s + d.calories, 0) / loggedDays) : 0
    const avgProtein =
      loggedDays > 0
        ? Math.round((vals.reduce((s, d) => s + d.protein, 0) / loggedDays) * 10) / 10
        : 0

    const workoutGoal = activePlan?.workouts?.length ?? 3
    const proteinPct = targetProtein > 0 ? Math.round((avgProtein / targetProtein) * 100) : 0

    let summaryText = ""
    if (weeklyWorkoutsCompleted === 0 && loggedDays === 0) {
      summaryText = "שבוע חדש — בואו נתחיל חזק!"
    } else if (weeklyWorkoutsCompleted >= workoutGoal && proteinPct >= 90) {
      summaryText = `כל הכבוד! ${weeklyWorkoutsCompleted} אימונים ו-${proteinPct}% מיעד החלבון — שבוע מצוין!`
    } else if (weeklyWorkoutsCompleted >= workoutGoal) {
      summaryText = `יפה! ${weeklyWorkoutsCompleted}/${workoutGoal} אימונים. ממוצע חלבון: ${avgProtein} מתוך ${targetProtein} גר'.`
    } else if (proteinPct >= 90) {
      summaryText = `תזונה מעולה (${proteinPct}% חלבון). הוסף ${workoutGoal - weeklyWorkoutsCompleted} אימונים נוספים!`
    } else {
      summaryText = `${weeklyWorkoutsCompleted}/${workoutGoal} אימונים · ${proteinPct}% מיעד החלבון. בוא נשפר ביחד!`
    }

    weeklySummary = {
      workoutsCompleted: weeklyWorkoutsCompleted,
      workoutGoal,
      avgCalories,
      avgProtein,
      summaryText,
      weekStart: startOfWeek,
    }
  }

  // ── Smart alert (last 2 complete days both below target by >20%) ──────────
  const smartAlertsEnabled = settings?.smartAlertsEnabled ?? true
  let showSmartAlert = false

  if (smartAlertsEnabled) {
    const alertDayMap = new Map<string, { calories: number; protein: number }>()
    for (const log of alertNutritionLogs) {
      const key = localDateStr(log.date)
      const prev = alertDayMap.get(key) ?? { calories: 0, protein: 0 }
      prev.calories += log.foodItems.reduce((s, i) => s + i.calories, 0)
      prev.protein += log.foodItems.reduce((s, i) => s + i.protein, 0)
      alertDayMap.set(key, prev)
    }

    if (alertDayMap.size >= 2) {
      const days = [...alertDayMap.values()]
      const THRESHOLD = 0.8 // below 80% = >20% gap
      const bothBelowCalories = days.every((d) => d.calories < targetCalories * THRESHOLD)
      const bothBelowProtein = days.every((d) => d.protein < targetProtein * THRESHOLD)
      showSmartAlert = bothBelowCalories || bothBelowProtein
    }
  }

  return {
    userName: user?.name ?? "ספורטאי",
    targetCalories,
    targetProtein,
    targetFats,
    targetCarbs,
    todayNutrition: {
      calories: Math.round(todayNutrition.calories),
      protein: Math.round(todayNutrition.protein * 10) / 10,
      carbs: Math.round(todayNutrition.carbs),
      fat: Math.round(todayNutrition.fat * 10) / 10,
    },
    latestWeight,
    nextWorkout,
    weeklySummary,
    showSmartAlert,
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MacroRing({
  label,
  current,
  target,
  unit,
  color,
}: {
  label: string
  current: number
  target: number
  unit: string
  color: string
}) {
  const pct = Math.min((current / target) * 100, 100)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">
          {Math.round(pct)}%
        </span>
      </div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-[11px] font-semibold">
        {current}
        <span className="text-slate-500 font-normal">{unit}</span>
      </p>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor = "text-indigo-400",
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  iconColor?: string
}) {
  return (
    <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-xl bg-slate-800 ${iconColor}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-base font-bold leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
      </div>
    </div>
  )
}

function WeeklySummaryCard({
  data,
  targetCalories,
  targetProtein,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getDashboardData>>["weeklySummary"]>
  targetCalories: number
  targetProtein: number
}) {
  const workoutPct = Math.min((data.workoutsCompleted / data.workoutGoal) * 100, 100)
  const proteinPct = Math.min((data.avgProtein / targetProtein) * 100, 100)
  const caloriePct = Math.min((data.avgCalories / targetCalories) * 100, 100)

  const weekLabel = data.weekStart.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
  })

  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <CalendarDays size={16} className="text-violet-400" /> סיכום שבועי
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">מ-{weekLabel}</span>
          <Link
            href="/weekly"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition-colors"
          >
            <BarChart3 size={11} /> דו&quot;ח מלא
          </Link>
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-3">
        {/* Workouts */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">אימונים</span>
            <span className="font-semibold">
              {data.workoutsCompleted}
              <span className="text-slate-500 font-normal">/{data.workoutGoal}</span>
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all"
              style={{ width: `${workoutPct}%` }}
            />
          </div>
        </div>

        {/* Protein */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">ממוצע חלבון</span>
            <span className="font-semibold">
              {data.avgProtein}
              <span className="text-slate-500 font-normal"> גר'</span>
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-400 transition-all"
              style={{ width: `${proteinPct}%` }}
            />
          </div>
        </div>

        {/* Calories */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">ממוצע קלוריות</span>
            <span className="font-semibold">
              {data.avgCalories}
              <span className="text-slate-500 font-normal"> קק"ל</span>
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-400 transition-all"
              style={{ width: `${caloriePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Summary text */}
      <div className="flex items-start gap-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2.5">
        <Trophy size={14} className="text-violet-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-300 leading-relaxed">{data.summaryText}</p>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const {
    userName,
    targetCalories,
    targetProtein,
    targetFats,
    targetCarbs,
    todayNutrition,
    latestWeight,
    nextWorkout,
    weeklySummary,
    showSmartAlert,
  } = await getDashboardData()

  const caloriesLeft = targetCalories - todayNutrition.calories
  const proteinLeft = targetProtein - todayNutrition.protein
  const isProteinBehind = proteinLeft > targetProtein * 0.3

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* ברכה */}
      <div>
        <h1 className="text-2xl font-bold">שלום, {userName} 👋</h1>
        <p className="text-sm text-slate-400 mt-0.5">בואו נכה ביעדי הרכב הגוף היום.</p>
      </div>

      {/* התראה חכמה */}
      {showSmartAlert && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-200 leading-relaxed">
            ⚠️ שים לב: נראה שלא הגעת ליעדי התזונה ביומיים האחרונים. בוא נחזור למסלול היום!
          </p>
        </div>
      )}

      {/* התראת חלבון */}
      {isProteinBehind && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-400">בדיקת חלבון</p>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              נותרו לך {Math.round(proteinLeft)} גר' לעמידה ביעד — הוסף שייק או ארוחה עשירת חלבון.
            </p>
          </div>
        </div>
      )}

      {/* מאקרו של היום */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Flame size={16} className="text-orange-400" /> תזונת היום
          </h2>
          <Link
            href="/nutrition"
            className="text-xs text-indigo-400 flex items-center gap-0.5 hover:text-indigo-300"
          >
            רשום מזון <ChevronLeft size={12} />
          </Link>
        </div>

        {/* סרגל קלוריות */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>{todayNutrition.calories} קק"ל נצרכו</span>
            <span className={caloriesLeft >= 0 ? "text-green-400" : "text-red-400"}>
              {caloriesLeft >= 0 ? `נותרו ${caloriesLeft}` : `ביתר ${Math.abs(caloriesLeft)}`}
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-400 transition-all"
              style={{
                width: `${Math.min((todayNutrition.calories / targetCalories) * 100, 100)}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-600 mt-1">יעד: {targetCalories} קק"ל</p>
        </div>

        {/* טבעות מאקרו */}
        <div className="flex justify-around pt-1">
          <MacroRing
            label="חלבון"
            current={todayNutrition.protein}
            target={targetProtein}
            unit=" גר'"
            color="#6366f1"
          />
          <MacroRing
            label="פחמימות"
            current={todayNutrition.carbs}
            target={targetCarbs}
            unit=" גר'"
            color="#22c55e"
          />
          <MacroRing
            label="שומן"
            current={todayNutrition.fat}
            target={targetFats}
            unit=" גר'"
            color="#f59e0b"
          />
        </div>

        {proteinLeft > 0 && (
          <p className="text-xs text-slate-400 text-center">
            <span className="text-indigo-300 font-semibold">
              נותרו {Math.round(proteinLeft)} גר' חלבון
            </span>{" "}
            — העדיפו ארוחות עשירות בחלבון.
          </p>
        )}
      </div>

      {/* סיכום שבועי */}
      {weeklySummary && (
        <WeeklySummaryCard
          data={weeklySummary}
          targetCalories={targetCalories}
          targetProtein={targetProtein}
        />
      )}

      {/* רשת סטטיסטיקות */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={TrendingUp}
          label="משקל גוף"
          value={latestWeight ? `${latestWeight} ק"ג` : "לא נמדד"}
          sub={latestWeight ? `יעד: ${targetProtein} גר' חלבון` : "הוסף מדידה במדדים"}
          iconColor="text-green-400"
        />
        <StatCard
          icon={Dumbbell}
          label="האימון הבא"
          value={nextWorkout?.name ?? "יום מנוחה"}
          sub={nextWorkout?.dayLabel ?? ""}
          iconColor="text-indigo-400"
        />
      </div>

      {/* כפתור התחלת אימון */}
      {nextWorkout && (
        <Link
          href="/gym"
          className="flex items-center justify-between w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-2xl px-5 py-4 transition-colors"
        >
          <div>
            <p className="text-xs text-indigo-200">מוכן לאמן?</p>
            <p className="text-base font-bold">{nextWorkout.name}</p>
          </div>
          <Zap size={24} className="text-indigo-200" />
        </Link>
      )}

      {/* מקורות חלבון מובילים */}
      <div className="bg-slate-900 rounded-2xl p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Beef size={15} className="text-emerald-400" /> מקורות חלבון צמחיים מובילים
        </h2>
        <ul className="space-y-2">
          {[
            { name: "סייטן (100 גר')", protein: 75, kcal: 370 },
            { name: "חלבון מי גבינה (30 גר')", protein: 24, kcal: 114 },
            { name: "טמפה (100 גר')", protein: 20, kcal: 193 },
            { name: "יוגורט יווני (200 גר')", protein: 20, kcal: 118 },
            { name: "אדממה (150 גר')", protein: 18, kcal: 182 },
          ].map((food) => (
            <li key={food.name} className="flex items-center justify-between text-xs">
              <span className="text-slate-300">{food.name}</span>
              <span className="text-indigo-300 font-semibold">{food.protein} גר' חלבון</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
