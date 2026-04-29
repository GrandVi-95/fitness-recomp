"use client"

import { useState } from "react"
import Link from "next/link"
import {
  HeartPulse,
  BedDouble,
  Zap,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
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
import WeeklyCharts from "@/app/(dashboard)/weekly/WeeklyCharts"

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface VolumeEntry {
  muscle: string
  sets: number
  status: "under" | "optimal" | "over"
}

export interface RecoveryData {
  lastSleep: number | null
  lastFatigue: number | null
  lastAvgRpe: number | null
  weeklyVolume: VolumeEntry[]
  consecutiveWeeks: number
}

interface DayNutrition {
  label: string
  day: string
  calories: number
  protein: number
  hasData: boolean
  isFuture: boolean
}

interface ProgressionEntry {
  name: string
  primaryMuscle: string
  thisVolume: number
  thisMaxWeight: number
  lastVolume: number
  lastMaxWeight: number
  volumeDelta: number
  volumeDeltaPct: number | null
  weightDelta: number
  isPR: boolean
  isNew: boolean
}

export interface WeeklyData {
  targetCalories: number
  targetProtein: number
  weekLabel: string
  progressionList: ProgressionEntry[]
  dailyNutrition: DayNutrition[]
  avgCalories: number
  avgProtein: number
  proteinDaysHit: number
  workoutsCompleted: number
  workoutGoal: number
  thisWeekAvgWeight: number | null
  lastWeekAvgWeight: number | null
  weightDelta: number | null
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const DELOAD_THRESHOLD = 6

const STATUS_STYLES = {
  optimal: { bar: "bg-green-500", label: "bg-green-500/10 text-green-400", text: "אופטימלי" },
  under:   { bar: "bg-amber-500", label: "bg-amber-500/10 text-amber-400", text: "חסר"      },
  over:    { bar: "bg-red-500",   label: "bg-red-500/10 text-red-400",     text: "ביתר"     },
}

const MUSCLE_HE: Record<string, string> = {
  chest: "חזה", back: "גב", shoulders: "כתפיים", biceps: "בייספס",
  triceps: "טרייספס", legs: "רגליים", quads: "קוואדס",
  hamstrings: "ירכיים", glutes: "ישבן", calves: "שוקיים", core: "בטן", other: "אחר",
}

// ─────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Recovery tab content
// ─────────────────────────────────────────────────────────

function RecoveryContent({ data }: { data: RecoveryData }) {
  const { lastSleep, lastFatigue, lastAvgRpe, weeklyVolume, consecutiveWeeks } = data
  const hasData = lastSleep != null || lastFatigue != null || lastAvgRpe != null
  const underTrained = weeklyVolume.filter((m) => m.status === "under")

  const scores = [
    { label: "שינה",      value: lastSleep   ?? "—", unit: lastSleep   != null ? "שע'"  : "", icon: BedDouble,  color: "text-blue-400"  },
    { label: "עייפות",    value: lastFatigue  ?? "—", unit: lastFatigue  != null ? "/5"   : "", icon: Zap,        color: "text-amber-400" },
    { label: "RPE אימון", value: lastAvgRpe   ?? "—", unit: lastAvgRpe   != null ? "/10"  : "", icon: HeartPulse, color: "text-red-400"   },
  ]

  return (
    <div className="space-y-5">
      {/* ציוני התאוששות */}
      <div className="grid grid-cols-3 gap-3">
        {scores.map(({ label, value, unit, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 rounded-2xl p-3 flex flex-col items-center gap-1.5">
            <Icon size={18} className={color} />
            <p className="text-lg font-bold leading-none">
              {value}{unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
            </p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {!hasData && (
        <div className="bg-slate-900 rounded-2xl p-4 text-center text-slate-500 text-sm">
          <p className="font-medium text-slate-400 mb-1">אין נתוני התאוששות עדיין</p>
          <p className="text-xs">לאחר סיום אימון עם דיווח שינה ועייפות, הנתונים יופיעו כאן.</p>
          <Link href="/gym" className="text-indigo-400 text-xs font-semibold mt-2 inline-block">
            התחל אימון ←
          </Link>
        </div>
      )}

      {/* התראה */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-400" /> התראות
        </h2>
        <div className="border rounded-2xl p-4 space-y-2 bg-indigo-500/10 border-indigo-500/30">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-400">עקוב אחר רישום תזונה</p>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                רשום ארוחות במהלך היום כדי לוודא עמידה ביעד החלבון היומי.
              </p>
            </div>
          </div>
          <Link href="/nutrition" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">
            עבור לתזונה ←
          </Link>
        </div>
      </div>

      {/* נפח שבועי */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 size={15} className="text-indigo-400" /> נפח שבועי
          </h2>
          <span className="text-xs text-slate-500">7 ימים אחרונים</span>
        </div>

        {weeklyVolume.every((m) => m.sets === 0) ? (
          <p className="text-xs text-slate-600 text-center py-2">אין אימונים מ-7 הימים האחרונים.</p>
        ) : (
          weeklyVolume.map(({ muscle, sets, status }) => {
            const style = STATUS_STYLES[status]
            return (
              <div key={muscle} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 w-20">{muscle}</span>
                  <span className="text-slate-500">{sets} סטים</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${style.label}`}>{style.text}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${Math.min((sets / 20) * 100, 100)}%` }} />
                </div>
              </div>
            )
          })
        )}

        {underTrained.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-3 text-xs text-slate-400">
            <span className="font-semibold text-amber-400">אימון חסר: </span>
            {underTrained.map((m) => m.muscle).join(", ")} — הוסף סטים השבוע.
          </div>
        )}
      </div>

      {/* גלאי הפרדה */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <BedDouble size={15} className="text-blue-400" /> גלאי הפרדה
        </h2>
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 size={18} className="text-green-400 shrink-0" />
          <p className="text-slate-300">
            {consecutiveWeeks === 0
              ? "עדיין לא זוהו שבועות אימון."
              : <><span className="font-semibold text-slate-100">{consecutiveWeeks} שבועות</span> אימון רצופים.</>
            }
          </p>
        </div>
        <p className="text-xs text-slate-500">
          הפרדה תומלץ לאחר <span className="text-amber-400">{DELOAD_THRESHOLD} שבועות רצופים</span> של אימון.
        </p>
        <div className="flex gap-2">
          {Array.from({ length: DELOAD_THRESHOLD }).map((_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full ${i < consecutiveWeeks ? "bg-green-500" : "bg-slate-800"}`} />
          ))}
        </div>
        <p className="text-[11px] text-slate-600">{consecutiveWeeks} / {DELOAD_THRESHOLD} שבועות עד להפרדה המוצעת</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Weekly analytics tab content
// ─────────────────────────────────────────────────────────

function WeeklyContent({ data }: { data: WeeklyData }) {
  const {
    targetCalories, targetProtein, weekLabel, progressionList,
    dailyNutrition, avgCalories, avgProtein, proteinDaysHit,
    workoutsCompleted, workoutGoal,
    thisWeekAvgWeight, lastWeekAvgWeight, weightDelta,
  } = data

  const workoutPct = Math.min((workoutsCompleted / workoutGoal) * 100, 100)
  const proteinPct = Math.min((avgProtein / targetProtein) * 100, 100)
  const caloriePct = Math.min((avgCalories / targetCalories) * 100, 100)

  return (
    <div className="space-y-5">
      {/* KPI: workouts + protein days */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Dumbbell size={15} className="text-indigo-400" />
            <p className="text-xs text-slate-400">אימונים</p>
          </div>
          <p className="text-3xl font-bold leading-none">
            {workoutsCompleted}
            <span className="text-slate-500 text-lg font-normal">/{workoutGoal}</span>
          </p>
          <ProgressBar value={workoutsCompleted} max={workoutGoal}
            color={workoutsCompleted >= workoutGoal ? "bg-green-400" : "bg-indigo-400"} />
          <p className="text-[11px] text-slate-500">
            {workoutsCompleted >= workoutGoal ? "יעד הושג! 🎉" : `נותרו ${workoutGoal - workoutsCompleted}`}
          </p>
        </div>

        <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-violet-400" />
            <p className="text-xs text-slate-400">ימי חלבון</p>
          </div>
          <p className="text-3xl font-bold leading-none">
            {proteinDaysHit}
            <span className="text-slate-500 text-lg font-normal">/7</span>
          </p>
          <ProgressBar value={proteinDaysHit} max={7}
            color={proteinDaysHit >= 6 ? "bg-green-400" : proteinDaysHit >= 4 ? "bg-yellow-400" : "bg-red-400"} />
          <p className="text-[11px] text-slate-500">
            {proteinDaysHit >= 6 ? "עמידה מצוינת!" : `יעד: ${targetProtein} גר'`}
          </p>
        </div>
      </div>

      {/* Nutrition adherence */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <SectionHeader icon={Flame} title="תזונה שבועית" iconColor="text-orange-400" />

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">ממוצע קלוריות</span>
            <span className={cn("font-semibold",
              avgCalories >= targetCalories * 0.9 && avgCalories <= targetCalories * 1.1 ? "text-green-400" : "")}>
              {avgCalories}
              <span className="text-slate-500 font-normal"> / {targetCalories} קק&quot;ל</span>
            </span>
          </div>
          <ProgressBar value={caloriePct} max={100} color="bg-orange-400" />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">ממוצע חלבון</span>
            <span className={cn("font-semibold", avgProtein >= targetProtein ? "text-green-400" : "")}>
              {avgProtein}
              <span className="text-slate-500 font-normal"> / {targetProtein} גר&apos;</span>
            </span>
          </div>
          <ProgressBar value={proteinPct} max={100}
            color={avgProtein >= targetProtein ? "bg-green-400" : "bg-violet-400"} />
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
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold",
                    hit    ? "bg-green-500 text-white"
                    : missed ? "bg-red-500/30 text-red-300 border border-red-500/30"
                    : future ? "bg-slate-800/50 text-slate-700"
                    :          "bg-slate-800 text-slate-600",
                  )}>
                    {day.label}
                  </div>
                  {day.hasData && (
                    <p className="text-[9px] text-slate-600 text-center leading-none">{day.protein}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Body weight trend */}
      {(thisWeekAvgWeight !== null || lastWeekAvgWeight !== null) && (
        <div className="bg-slate-900 rounded-2xl p-4">
          <SectionHeader icon={Scale} title="מגמת משקל גוף" iconColor="text-teal-400" />
          <div className="mt-4 grid grid-cols-3 gap-2 items-center">
            <div className="text-center">
              <p className="text-[11px] text-slate-500 mb-1">שבוע קודם</p>
              <p className="text-xl font-bold">
                {lastWeekAvgWeight ?? "—"}
                <span className="text-xs text-slate-500 font-normal"> ק&quot;ג</span>
              </p>
              {lastWeekAvgWeight && <p className="text-[10px] text-slate-600">ממוצע 7י&apos;</p>}
            </div>

            <div className="flex flex-col items-center gap-1">
              {weightDelta !== null ? (
                <>
                  <div className={cn(
                    "flex items-center gap-1 text-base font-bold",
                    weightDelta > 0 ? "text-amber-400" : weightDelta < 0 ? "text-teal-400" : "text-slate-400",
                  )}>
                    {weightDelta > 0 ? <TrendingUp size={16} /> : weightDelta < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                    {weightDelta > 0 ? "+" : ""}{weightDelta} ק&quot;ג
                  </div>
                  <p className="text-[10px] text-slate-500">שינוי</p>
                </>
              ) : (
                <p className="text-xs text-slate-600 text-center">אין נתוני השוואה</p>
              )}
            </div>

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

      {/* 7-day nutrition charts */}
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

      {/* Progressive overload */}
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
            <div className="flex items-center justify-between text-[10px] text-slate-600 uppercase tracking-wide pb-1 border-b border-slate-800">
              <span>תרגיל</span>
              <div className="flex gap-4 text-end">
                <span className="w-16">נפח</span>
                <span className="w-16">מקסימום</span>
              </div>
            </div>
            {progressionList.map((ex, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
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
                <div className="flex gap-4 shrink-0">
                  <div className="w-16 text-end">
                    <p className={cn("text-xs font-semibold",
                      ex.volumeDelta > 0 ? "text-green-400" : ex.volumeDelta < 0 ? "text-red-400" : "text-slate-400")}>
                      {ex.volumeDelta > 0 ? "+" : ""}{ex.volumeDelta} ק&quot;ג
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {ex.volumeDeltaPct !== null ? `${ex.volumeDeltaPct > 0 ? "+" : ""}${ex.volumeDeltaPct}%` : "—"}
                    </p>
                  </div>
                  <div className="w-16 text-end">
                    <p className={cn("text-xs font-semibold",
                      ex.weightDelta > 0 ? "text-green-400" : ex.weightDelta < 0 ? "text-red-400" : "text-slate-400")}>
                      {ex.weightDelta > 0 ? "+" : ""}{ex.weightDelta} ק&quot;ג
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

// ─────────────────────────────────────────────────────────
// Main tabbed component
// ─────────────────────────────────────────────────────────

interface Props {
  recovery: RecoveryData
  weekly: WeeklyData
}

export default function RecoveryTabs({ recovery, weekly }: Props) {
  const [tab, setTab] = useState<"recovery" | "weekly">("recovery")

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">התאוששות ותובנות</h1>
          <p className="text-sm text-slate-400 mt-0.5">מ-{weekly.weekLabel} עד היום</p>
        </div>
        <CalendarDays size={26} className="text-violet-400" />
      </div>

      {/* Tab switcher */}
      <div className="flex bg-slate-900 rounded-2xl p-1 gap-1">
        <button
          onClick={() => setTab("recovery")}
          className={cn(
            "flex-1 py-2 text-sm font-medium rounded-xl transition-colors",
            tab === "recovery"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-300",
          )}
        >
          מצב התאוששות
        </button>
        <button
          onClick={() => setTab("weekly")}
          className={cn(
            "flex-1 py-2 text-sm font-medium rounded-xl transition-colors",
            tab === "weekly"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-300",
          )}
        >
          אנליטיקה שבועית
        </button>
      </div>

      {/* Tab content */}
      {tab === "recovery" ? (
        <RecoveryContent data={recovery} />
      ) : (
        <WeeklyContent data={weekly} />
      )}
    </div>
  )
}
