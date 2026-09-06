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
  Palmtree,
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

// Shared "bento box" card treatment — pure white, extreme rounding, ultra-soft
// diffused shadow, no visible border. Every card on this page uses this.
const CARD = "bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"

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
    vacationMode: settings?.vacationMode ?? false,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroRing({
  label,
  current,
  target,
  unit,
  ringColorClass,
  strokeHex,
}: {
  label: string
  current: number
  target: number
  unit: string
  ringColorClass: string
  strokeHex: string
}) {
  const pct = Math.min((current / target) * 100, 100)
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="2.5" />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke={strokeHex}
            strokeWidth="2.5"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-xs font-semibold", ringColorClass)}>
          {Math.round(pct)}%
        </span>
      </div>
      <p className="text-[11px] font-medium text-gray-400">{label}</p>
      <p className="text-xs font-semibold text-gray-900">
        {current}
        <span className="font-normal text-gray-400">{unit}</span>
      </p>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tintBgClass,
  tintTextClass,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  tintBgClass: string
  tintTextClass: string
}) {
  return (
    <div className={cn(CARD, "!p-5 flex items-center gap-3.5")}>
      <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", tintBgClass, tintTextClass)}>
        <Icon size={19} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-[15px] font-semibold leading-tight tracking-tight text-gray-900 truncate">{value}</p>
        {sub && <p className="text-[11px] mt-0.5 text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// Day abbreviations for Sunday-first Israel week
const DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]

function WeeklyStreak({ days }: { days: WeekDayData[] }) {
  return (
    <div className={cn(CARD, "space-y-4")}>
      <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 flex items-center gap-2">
        <Calendar size={16} className="text-[#007AFF]" /> מדד התמדה שבועי
      </h2>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => (
          <div
            key={day.dayKey}
            className={cn(
              "flex flex-col items-center gap-2 py-2 rounded-2xl transition-colors",
              day.isToday ? "bg-gray-50" : "",
            )}
          >
            {/* Day label */}
            <span className={cn("text-[10px] font-medium", day.isToday ? "text-[#007AFF]" : "text-gray-400")}>
              {DAY_LABELS[i]}
            </span>

            {/* Workout indicator */}
            {day.isFuture ? (
              <div className="w-5 h-5 rounded-full border border-gray-100" />
            ) : day.hadWorkout ? (
              <div className="w-5 h-5 rounded-full bg-[#007AFF] flex items-center justify-center">
                <Dumbbell size={9} className="text-white" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full border border-gray-100" />
            )}

            {/* Nutrition indicator */}
            {day.isFuture ? (
              <div className="w-5 h-5 rounded-full border border-gray-100" />
            ) : day.nutritionStatus === "hit" ? (
              <div className="w-5 h-5 rounded-full bg-[#34C759] flex items-center justify-center">
                <span className="text-white text-[9px] font-black leading-none">✓</span>
              </div>
            ) : day.nutritionStatus === "partial" ? (
              <div className="w-5 h-5 rounded-full bg-[#FF9F0A]" />
            ) : (
              <div className="w-5 h-5 rounded-full border border-gray-100" />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 pt-0.5">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#007AFF]" />
          אימון
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#34C759]" />
          יעד תזונה ✓
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-[#FF9F0A]" />
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
    vacationMode,
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
  // Vacation Mode: no red warnings, no "needs improvement" flags — ever.
  const isProteinBehind = !vacationMode && proteinStatus?.status === "needs_improvement"

  return (
    <div className="min-h-full bg-[#F9FAFB] px-6 py-9 space-y-6 max-w-lg mx-auto">
      {/* ברכה */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">שלום, {userName} 👋</h1>
        <p className="text-[15px] mt-1.5 text-gray-500">בואו נכה ביעדי הרכב הגוף היום.</p>
      </div>

      {/* צ'ק-אין דו-שבועי — Controlled Lean Gain Engine (מושהה במצב חופשה) */}
      <CheckInCard />

      {/* התראה חכמה */}
      {showSmartAlert && !vacationMode && (
        <div className={cn(CARD, "flex items-start gap-3")}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#FF3B30]" />
          <p className="text-[14px] leading-relaxed text-gray-900">
            שים לב: נראה שלא הגעת ליעדי התזונה ביומיים האחרונים. בוא נחזור למסלול היום!
          </p>
        </div>
      )}

      {/* התראת חלבון */}
      {isProteinBehind && (
        <div className={cn(CARD, "flex items-start gap-3")}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#FF9F0A]" />
          <div>
            <p className="text-[14px] font-semibold tracking-tight text-gray-900">בדיקת חלבון</p>
            <p className="text-[13px] mt-0.5 leading-relaxed text-gray-500">
              נותרו לך {Math.round(proteinLeft)} גר' לעמידה ביעד — הוסף שייק או ארוחה עשירת חלבון.
            </p>
          </div>
        </div>
      )}

      {/* מאקרו של היום — או תצוגת חופשה רגועה */}
      {vacationMode ? (
        <div className="rounded-[2rem] p-8 text-center space-y-3 bg-gradient-to-br from-amber-100 via-orange-50 to-sky-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <Palmtree size={30} className="mx-auto text-amber-500" strokeWidth={1.6} />
          <p className="text-[19px] font-semibold tracking-tight text-gray-900">תיהנו מהזמן שלכם! 🌴</p>
          <p className="text-[13px] leading-relaxed max-w-[26ch] mx-auto text-gray-500">
            מצב חופשה פעיל — המעקב המדויק מושהה. נמשיך לתעד ברוגע, בלי מספרים ובלי לחץ.
          </p>
        </div>
      ) : (
        <div className={cn(CARD, "space-y-6")}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 flex items-center gap-2">
                <Flame size={16} className="text-[#FF9500]" /> תזונת היום
              </h2>
              <p className="text-[11px] mt-0.5 text-gray-400">
                היעד היומי שלך לרה-קומפוזיציה אמיתית
              </p>
            </div>
            <Link
              href="/nutrition"
              className="text-[13px] font-medium flex items-center gap-0.5 text-[#007AFF]"
            >
              רשום מזון <ChevronLeft size={12} />
            </Link>
          </div>

          {/* סרגל קלוריות */}
          <div>
            <div className="flex justify-between text-[13px] mb-2 text-gray-500">
              <span>{todayNutrition.calories} קק&quot;ל נצרכו</span>
              <span className={cn("font-medium", caloriesLeft >= 0 ? "text-[#34C759]" : "text-[#FF3B30]")}>
                {caloriesLeft >= 0 ? `נותרו ${caloriesLeft}` : `ביתר ${Math.abs(caloriesLeft)}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-gray-100">
              <div
                className="h-full rounded-full transition-all bg-[#007AFF]"
                style={{ width: `${Math.min((todayNutrition.calories / targetCalories) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[11px] mt-1.5 text-gray-400">יעד: {targetCalories} קק&quot;ל</p>
          </div>

          {/* טבעות מאקרו — Protein · Carbs · Fat · Sugar */}
          <div className="flex justify-around pt-1">
            <MacroRing
              label="חלבון"
              current={todayNutrition.protein}
              target={targetProtein}
              unit=" גר'"
              ringColorClass="text-gray-900"
              strokeHex="#007AFF"
            />
            <MacroRing
              label="פחמימות"
              current={todayNutrition.carbs}
              target={targetCarbs}
              unit=" גר'"
              ringColorClass="text-gray-900"
              strokeHex="#34C759"
            />
            <MacroRing
              label="שומן"
              current={todayNutrition.fat}
              target={targetFats}
              unit=" גר'"
              ringColorClass="text-gray-900"
              strokeHex="#FF9500"
            />
            <MacroRing
              label="סוכר"
              current={todayNutrition.sugar}
              target={SUGAR_TARGET}
              unit=" גר'"
              ringColorClass="text-gray-900"
              strokeHex="#FF3B30"
            />
          </div>

          {/* אזור חלבון — Green Zone: "good" (1.8–2.19 ג'/ק"ג) הוא הצלחה, לא כישלון */}
          {proteinStatus && proteinStatus.status !== "needs_improvement" ? (
            <p className="text-[13px] text-center font-medium text-[#34C759]">
              🟢{" "}
              {proteinStatus.status === "optimal" ? "אופטימלי" : "אזור ירוק — מצוין"}
              {" · "}
              {proteinStatus.gPerKg} גר&apos;/ק&quot;ג
            </p>
          ) : proteinLeft > 0 && (
            <p className="text-[13px] text-center text-gray-500">
              <span className="font-medium text-[#007AFF]">
                נותרו {Math.round(proteinLeft)} גר' חלבון
              </span>{" "}
              — העדיפו ארוחות עשירות בחלבון.
            </p>
          )}
        </div>
      )}

      {/* רשת סטטיסטיקות */}
      <div className="grid grid-cols-2 gap-3.5">
        <StatCard
          icon={TrendingUp}
          label="משקל גוף"
          value={latestWeight ? `${latestWeight} ק"ג` : "לא נמדד"}
          sub={latestWeight ? `יעד: ${targetProtein} גר' חלבון` : "הוסף מדידה במדדים"}
          tintBgClass="bg-emerald-50"
          tintTextClass="text-emerald-500"
        />
        <StatCard
          icon={Dumbbell}
          label="האימון הבא"
          value={nextWorkout?.name ?? "יום מנוחה"}
          sub={nextWorkout?.dayLabel ?? ""}
          tintBgClass="bg-blue-50"
          tintTextClass="text-[#007AFF]"
        />
      </div>

      {/* כפתור התחלת אימון */}
      {nextWorkout && (
        <Link
          href="/gym"
          className="flex items-center justify-between w-full rounded-full px-7 py-5 bg-[#007AFF] transition active:scale-95"
        >
          <div>
            <p className="text-xs text-white/70">מוכן לאמן?</p>
            <p className="text-[16px] font-semibold text-white">{nextWorkout.name}</p>
          </div>
          <Zap size={22} className="text-white/90" />
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
