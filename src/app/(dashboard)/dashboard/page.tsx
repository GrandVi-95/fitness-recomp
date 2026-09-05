// לוח בקרה — סיכום ההתקדמות היומית
// force-dynamic: this page reads live DB data on every request — never serve from cache.
export const dynamic = "force-dynamic"

import {
  Dumbbell,
  Flame,
  TrendingUp,
  Zap,
  AlertTriangle,
  ChevronLeft,
  Calendar,
} from "lucide-react"
import Link from "next/link"
import { db } from "@/lib/db"
import { computeTargets, SUGAR_TARGET } from "@/lib/nutrition"
import { getTodayNutrition, getTodayBounds } from "@/lib/nutrition-server"
import { cn } from "@/lib/utils"
import { classifyProteinStatus } from "@/utils/nutrition-math"
import VersionBadge from "@/components/dashboard/ChangelogModal"
import CheckInCard from "@/components/dashboard/CheckInCard"

const DEMO_USER_ID  = "demo-user"
const TZ_OFFSET_MS  = 3 * 60 * 60 * 1000 // Israel UTC+3

// ── Date helpers ─────────────────────────────────────────────────────────────

function israelDayKey(d: Date): string {
  const s = new Date(d.getTime() + TZ_OFFSET_MS)
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-${String(s.getUTCDate()).padStart(2, "0")}`
}

function utcDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeekDayData {
  dayKey:           string
  isToday:          boolean
  isFuture:         boolean
  hadWorkout:       boolean
  nutritionStatus:  "hit" | "partial" | "none"
}

// ── Server data helpers ───────────────────────────────────────────────────────

async function getDashboardData() {
  const { startOfDay } = getTodayBounds()
  const twoDaysAgo = new Date(startOfDay.getTime() - 2 * 24 * 60 * 60 * 1000)

  // Current week bounds (Israel Sunday → Saturday) for the streak widget
  const nowShifted    = new Date(Date.now() + TZ_OFFSET_MS)
  const sundayShifted = new Date(nowShifted)
  sundayShifted.setUTCDate(nowShifted.getUTCDate() - nowShifted.getUTCDay())
  sundayShifted.setUTCHours(0, 0, 0, 0)
  const weekStartUTC = new Date(sundayShifted.getTime() - TZ_OFFSET_MS)
  const weekEndUTC   = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    user,
    { totals: todayNutrition },
    latestMetric,
    lastSession,
    activePlan,
    alertNutritionLogs,
    weekSessions,
    weekNutritionLogs,
  ] = await Promise.all([
    db.user.findUnique({
      where:   { id: DEMO_USER_ID },
      include: { userSettings: true },
    }),
    getTodayNutrition(DEMO_USER_ID),
    db.bodyMetric.findFirst({
      where:   { userId: DEMO_USER_ID },
      orderBy: { date: "desc" },
    }),
    db.workoutSession.findFirst({
      where:   { userId: DEMO_USER_ID },
      orderBy: { startedAt: "desc" },
      include: { workout: true },
    }),
    db.workoutPlan.findFirst({
      where:   { userId: DEMO_USER_ID, isActive: true },
      include: { workouts: { orderBy: { order: "asc" } } },
    }),
    db.nutritionLog.findMany({
      where:   { userId: DEMO_USER_ID, date: { gte: twoDaysAgo, lt: startOfDay } },
      include: { foodItems: true },
    }),
    // Week streak: completed workout sessions
    db.workoutSession.findMany({
      where:   { userId: DEMO_USER_ID, completedAt: { gte: weekStartUTC, lt: weekEndUTC } },
      select:  { completedAt: true },
    }),
    // Week streak: nutrition logs
    db.nutritionLog.findMany({
      where:   { userId: DEMO_USER_ID, date: { gte: weekStartUTC, lt: weekEndUTC } },
      include: { foodItems: true },
    }),
  ])

  // ── Targets ──────────────────────────────────────────────────────────────────
  const settings     = user?.userSettings
  const latestWeight = latestMetric?.weightKg ?? null
  const { calories: targetCalories, protein: targetProtein, fat: targetFats, carbs: targetCarbs } = computeTargets({
    targetCalories:  user?.targetCalories,
    targetProtein:   user?.targetProtein,
    targetFats:      user?.targetFats,
    targetCarbs:     user?.targetCarbs,
    autoProteinGoal: settings?.autoProteinGoal,
    weightKg:        latestWeight,
  })

  // ── Next workout ──────────────────────────────────────────────────────────────
  let nextWorkout: { name: string; dayLabel: string } | null = null
  if (activePlan?.workouts?.length) {
    if (!lastSession) {
      nextWorkout = activePlan.workouts[0]
    } else {
      const idx = activePlan.workouts.findIndex((w) => w.id === lastSession.workoutId)
      nextWorkout = activePlan.workouts[(idx + 1) % activePlan.workouts.length]
    }
  }

  // ── Smart alert (last 2 complete days both below target by >20%) ─────────────
  const smartAlertsEnabled = settings?.smartAlertsEnabled ?? true
  let   showSmartAlert     = false

  if (smartAlertsEnabled) {
    const alertDayMap = new Map<string, { calories: number; protein: number }>()
    for (const log of alertNutritionLogs) {
      const key  = utcDateStr(log.date)
      const prev = alertDayMap.get(key) ?? { calories: 0, protein: 0 }
      prev.calories += log.foodItems.reduce((s, i) => s + i.calories, 0)
      prev.protein  += log.foodItems.reduce((s, i) => s + i.protein, 0)
      alertDayMap.set(key, prev)
    }
    if (alertDayMap.size >= 2) {
      const days      = [...alertDayMap.values()]
      const THRESHOLD = 0.8
      showSmartAlert  =
        days.every((d) => d.calories < targetCalories * THRESHOLD) ||
        days.every((d) => d.protein  < targetProtein  * THRESHOLD)
    }
  }

  // ── Weekly streak computation ─────────────────────────────────────────────────
  // Workout days set
  const workoutDayKeys = new Set(
    weekSessions
      .filter((s) => s.completedAt)
      .map((s) => israelDayKey(s.completedAt!)),
  )

  // Nutrition per-day accumulator
  const nutritionByDay = new Map<string, { calories: number; protein: number }>()
  for (const log of weekNutritionLogs) {
    const key  = israelDayKey(log.date)
    const prev = nutritionByDay.get(key) ?? { calories: 0, protein: 0 }
    prev.calories += log.foodItems.reduce((s, i) => s + i.calories, 0)
    prev.protein  += log.foodItems.reduce((s, i) => s + i.protein, 0)
    nutritionByDay.set(key, prev)
  }

  const todayKey = israelDayKey(new Date())

  const weekDays: WeekDayData[] = Array.from({ length: 7 }, (_, i) => {
    const dayUTC = new Date(weekStartUTC.getTime() + i * 24 * 60 * 60 * 1000)
    const key    = israelDayKey(dayUTC)
    const nutr   = nutritionByDay.get(key)
    const isFuture = key > todayKey

    let nutritionStatus: WeekDayData["nutritionStatus"] = "none"
    if (!isFuture && nutr) {
      const calOk  = nutr.calories >= targetCalories * 0.8
      const protOk = nutr.protein  >= targetProtein  * 0.8
      nutritionStatus = calOk && protOk ? "hit" : "partial"
    }

    return {
      dayKey: key,
      isToday:   key === todayKey,
      isFuture,
      hadWorkout: workoutDayKeys.has(key),
      nutritionStatus,
    }
  })

  return {
    userName: user?.name ?? "ספורטאי",
    targetCalories,
    targetProtein,
    targetFats,
    targetCarbs,
    todayNutrition,
    latestWeight,
    nextWorkout,
    showSmartAlert,
    weekDays,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

// Day abbreviations for Sunday-first Israel week
const DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]

function WeeklyStreak({ days }: { days: WeekDayData[] }) {
  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
        <Calendar size={15} className="text-violet-400" /> מדד התמדה שבועי
      </h2>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => (
          <div
            key={day.dayKey}
            className={cn(
              "flex flex-col items-center gap-1.5 py-2 rounded-xl transition-colors",
              day.isToday ? "bg-slate-800 ring-1 ring-violet-500/40" : "",
            )}
          >
            {/* Day label */}
            <span
              className={cn(
                "text-[10px] font-medium",
                day.isToday ? "text-violet-300" : "text-slate-500",
              )}
            >
              {DAY_LABELS[i]}
            </span>

            {/* Workout indicator */}
            {day.isFuture ? (
              <div className="w-5 h-5 rounded-full border border-slate-700/40 bg-slate-800/40" />
            ) : day.hadWorkout ? (
              <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                <Dumbbell size={9} className="text-white" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full border border-slate-700 bg-slate-800/60" />
            )}

            {/* Nutrition indicator */}
            {day.isFuture ? (
              <div className="w-5 h-5 rounded-full border border-slate-700/40 bg-slate-800/40" />
            ) : day.nutritionStatus === "hit" ? (
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                <span className="text-white text-[9px] font-black leading-none">✓</span>
              </div>
            ) : day.nutritionStatus === "partial" ? (
              <div className="w-5 h-5 rounded-full bg-amber-400/80" />
            ) : (
              <div className="w-5 h-5 rounded-full border border-slate-700 bg-slate-800/60" />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 pt-0.5">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
          אימון
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          יעד תזונה ✓
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" />
          חלקי
        </span>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
    showSmartAlert,
    weekDays,
  } = await getDashboardData()

  const caloriesLeft   = targetCalories - todayNutrition.calories
  const proteinLeft    = targetProtein  - todayNutrition.protein
  // Protein "Green Zone" — evaluated in g/kg bodyweight, not % of a fixed
  // gram target, so 1.8–2.19 g/kg ("good") is a genuine success and is
  // NEVER flagged as a miss, even if it happens to sit under the 2.2 g/kg
  // "optimal" target in raw grams.
  const proteinStatus = latestWeight
    ? classifyProteinStatus(todayNutrition.protein, latestWeight)
    : null
  const isProteinBehind = proteinStatus?.status === "needs_improvement"

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* ברכה */}
      <div>
        <h1 className="text-2xl font-bold">שלום, {userName} 👋</h1>
        <p className="text-sm text-slate-400 mt-0.5">בואו נכה ביעדי הרכב הגוף היום.</p>
      </div>

      {/* צ'ק-אין דו-שבועי — Controlled Lean Gain Engine */}
      <CheckInCard />

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

        {/* טבעות מאקרו — Protein · Carbs · Fat · Sugar */}
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
          <MacroRing
            label="סוכר"
            current={todayNutrition.sugar}
            target={SUGAR_TARGET}
            unit=" גר'"
            color="#f43f5e"
          />
        </div>

        {/* אזור חלבון — Green Zone: "good" (1.8–2.19 ג'/ק"ג) הוא הצלחה, לא כישלון */}
        {proteinStatus && proteinStatus.status !== "needs_improvement" ? (
          <p
            className={cn(
              "text-xs text-center font-medium",
              proteinStatus.status === "optimal" ? "text-emerald-400" : "text-green-400",
            )}
          >
            🟢{" "}
            {proteinStatus.status === "optimal" ? "אופטימלי" : "אזור ירוק — מצוין"}
            {" · "}
            {proteinStatus.gPerKg} גר&apos;/ק&quot;ג
          </p>
        ) : proteinLeft > 0 && (
          <p className="text-xs text-slate-400 text-center">
            <span className="text-indigo-300 font-semibold">
              נותרו {Math.round(proteinLeft)} גר' חלבון
            </span>{" "}
            — העדיפו ארוחות עשירות בחלבון.
          </p>
        )}
      </div>

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

      {/* מדד התמדה שבועי */}
      <WeeklyStreak days={weekDays} />

      {/* גרסה */}
      <div className="flex justify-center pb-2">
        <VersionBadge />
      </div>
    </div>
  )
}
