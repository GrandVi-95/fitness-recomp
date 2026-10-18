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
import type { MetricKind, PlanningStatus, VolumeEntry } from "@/lib/training"

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface RecoveryData {
  lastSleep: number | null
  lastFatigue: number | null
  lastAvgRpe: number | null
  weeklyVolume: VolumeEntry[]
  consecutiveWeeks: number
  // Consecutive completed weeks with no e1RM improvement on the main lifts,
  // vs UserSettings.deloadThreshold.
  stalledWeeks: number
  deloadThreshold: number
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
  // e1rm (weighted, kg) | reps (bodyweight) | duration (seconds)
  kind: MetricKind
  thisVolume: number          // tonnage kg · total reps · total seconds
  lastVolume: number
  volumeDelta: number
  volumeDeltaPct: number | null
  thisBest: number            // best e1RM · best reps · longest hold
  bestDelta: number | null    // vs the week before (null = not trained then)
  isPR: boolean               // beats ALL prior history (lifetime)
  isNew: boolean              // never logged before this week
}

export interface WeeklyData {
  targetCalories: number
  targetProtein: number
  weekLabel: string
  progressionWeekLabel: string   // start of the last COMPLETED week
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

// Shared "bento box" card treatment — matches the dashboard page / CheckInCard.
const CARD = "bg-white rounded-2xl shadow-[0_4px_16px_rgb(0,0,0,0.04)]"

// Weekly set targets are PLANNING ranges, not physiological limits — being
// above a range just means "more than planned", so no alarm colours.
const STATUS_STYLES: Record<PlanningStatus, { bar: string; label: string; text: string }> = {
  in_range: { bar: "bg-[#34C759]", label: "bg-green-50 text-[#34C759]", text: "בטווח התכנון"     },
  below:    { bar: "bg-[#FF9500]", label: "bg-amber-50 text-[#FF9500]", text: "מתחת לטווח התכנון" },
  above:    { bar: "bg-[#007AFF]", label: "bg-blue-50 text-[#007AFF]",  text: "מעל טווח התכנון"   },
}

const METRIC_UNIT: Record<MetricKind, string> = {
  e1rm:     "ק\"ג",
  reps:     "חז'",
  duration: "שנ'",
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
  iconColor = "text-[#007AFF]",
}: {
  icon: React.ElementType
  title: string
  iconColor?: string
}) {
  return (
    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
      <Icon size={16} className={iconColor} />
      {title}
    </h2>
  )
}

function ProgressBar({
  value,
  max,
  color = "bg-[#007AFF]",
}: {
  value: number
  max: number
  color?: string
}) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Recovery tab content
// ─────────────────────────────────────────────────────────

function RecoveryContent({ data }: { data: RecoveryData }) {
  const { lastSleep, lastFatigue, lastAvgRpe, weeklyVolume, consecutiveWeeks, stalledWeeks, deloadThreshold } = data
  const hasData = lastSleep != null || lastFatigue != null || lastAvgRpe != null
  const belowRange = weeklyVolume.filter((m) => m.status === "below")
  const deloadSuggested = deloadThreshold > 0 && stalledWeeks >= deloadThreshold

  const scores = [
    { label: "שינה",      value: lastSleep   ?? "—", unit: lastSleep   != null ? "שע'"  : "", icon: BedDouble,  color: "text-blue-500"   },
    { label: "עייפות",    value: lastFatigue  ?? "—", unit: lastFatigue  != null ? "/5"   : "", icon: Zap,        color: "text-[#FF9500]"  },
    { label: "RPE אימון", value: lastAvgRpe   ?? "—", unit: lastAvgRpe   != null ? "/10"  : "", icon: HeartPulse, color: "text-[#FF3B30]"  },
  ]

  return (
    <div className="space-y-5">
      {/* ציוני התאוששות */}
      <div className="grid grid-cols-3 gap-3">
        {scores.map(({ label, value, unit, icon: Icon, color }) => (
          <div key={label} className={cn(CARD, "p-3 flex flex-col items-center gap-1.5")}>
            <Icon size={18} className={color} />
            <p className="text-lg font-bold leading-none text-gray-900">
              {value}{unit && <span className="text-xs font-normal text-gray-400">{unit}</span>}
            </p>
            <p className="text-[11px] text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {!hasData && (
        <div className={cn(CARD, "p-4 text-center text-gray-400 text-sm")}>
          <p className="font-medium text-gray-500 mb-1">אין נתוני התאוששות עדיין</p>
          <p className="text-xs">לאחר סיום אימון עם דיווח שינה ועייפות, הנתונים יופיעו כאן.</p>
          <Link href="/gym" className="text-[#007AFF] text-xs font-semibold mt-2 inline-block">
            התחל אימון ←
          </Link>
        </div>
      )}

      {/* התראה */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <AlertTriangle size={15} className="text-[#FF9500]" /> התראות
        </h2>
        <div className="border rounded-2xl p-4 space-y-2 bg-blue-50 border-blue-100">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-[#007AFF] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#007AFF]">עקוב אחר רישום תזונה</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                רשום ארוחות במהלך היום כדי לוודא עמידה ביעד החלבון היומי.
              </p>
            </div>
          </div>
          <Link href="/nutrition" className="text-xs font-semibold text-[#007AFF] hover:text-[#007AFF]/80">
            עבור לתזונה ←
          </Link>
        </div>
      </div>

      {/* נפח שבועי */}
      <div className={cn(CARD, "p-4 space-y-4")}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 size={15} className="text-[#007AFF]" /> נפח שבועי מול טווח תכנון
          </h2>
          <span className="text-xs text-gray-400">7 ימים אחרונים</span>
        </div>
        <p className="text-[11px] text-gray-400 -mt-2">
          סט ישיר = 1, סט עקיף (שריר משני) = 0.5. הטווחים הם יעדי תכנון, לא גבול פיזיולוגי.
        </p>

        {weeklyVolume.every((m) => m.sets === 0) ? (
          <p className="text-xs text-gray-300 text-center py-2">אין אימונים מ-7 הימים האחרונים.</p>
        ) : (
          weeklyVolume.map(({ muscle, sets, min, max, status }) => {
            const style = STATUS_STYLES[status]
            return (
              <div key={muscle} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 w-20">{muscle}</span>
                  <span className="text-gray-400">
                    {sets} סטים <span className="text-gray-300">({min}–{max})</span>
                  </span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${style.label}`}>{style.text}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${Math.min((sets / (max * 1.25)) * 100, 100)}%` }} />
                </div>
              </div>
            )
          })
        )}

        {belowRange.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
            <span className="font-semibold text-[#FF9500]">מתחת לטווח התכנון: </span>
            {belowRange.map((m) => m.muscle).join(", ")} — אפשר לשקול להוסיף סטים.
          </div>
        )}
      </div>

      {/* הצעת דילואד — לפי שבועות קיפאון בביצועים, לא לפי מספר שבועות אימון */}
      <div className={cn(CARD, "p-4 space-y-3")}>
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <BedDouble size={15} className="text-blue-500" /> הצעת דילואד (שבוע הורדת עומס)
        </h2>
        <div className="flex items-center gap-3 text-sm">
          {deloadSuggested
            ? <AlertTriangle size={18} className="text-[#FF9500] shrink-0" />
            : <CheckCircle2 size={18} className="text-[#34C759] shrink-0" />}
          <p className="text-gray-500">
            {deloadSuggested
              ? <>אין שיפור בתרגילים המרכזיים כבר <span className="font-semibold text-gray-900">{stalledWeeks} שבועות</span> — כדאי לשקול שבוע דילואד.</>
              : stalledWeeks === 0
              ? "אין כרגע סימני קיפאון בתרגילים המרכזיים."
              : <><span className="font-semibold text-gray-900">{stalledWeeks} שבועות</span> ללא שיפור בתרגילים המרכזיים.</>
            }
          </p>
        </div>
        <p className="text-xs text-gray-400">
          הצעה בלבד: דילואד מוצע אחרי <span className="text-[#FF9500]">{deloadThreshold} שבועות רצופים</span> ללא
          שיפור ב-1RM המשוער בתרגילים המרכזיים (ניתן לשנות בהגדרות).
        </p>
        {deloadThreshold > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: deloadThreshold }).map((_, i) => (
              <div key={i} className={`flex-1 h-2 rounded-full ${i < stalledWeeks ? "bg-[#FF9500]" : "bg-gray-100"}`} />
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-300">
          {Math.min(stalledWeeks, deloadThreshold)} / {deloadThreshold} שבועות קיפאון
          {consecutiveWeeks > 0 && ` · ${consecutiveWeeks} שבועות אימון רצופים`}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Weekly analytics tab content
// ─────────────────────────────────────────────────────────

function WeeklyContent({ data }: { data: WeeklyData }) {
  const {
    targetCalories, targetProtein, progressionWeekLabel, progressionList,
    dailyNutrition, avgCalories, avgProtein, proteinDaysHit,
    workoutsCompleted, workoutGoal,
    thisWeekAvgWeight, lastWeekAvgWeight, weightDelta,
  } = data

  const proteinPct = Math.min((avgProtein / targetProtein) * 100, 100)
  const caloriePct = Math.min((avgCalories / targetCalories) * 100, 100)

  return (
    <div className="space-y-5">
      {/* KPI: workouts + protein days */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cn(CARD, "p-4 space-y-2")}>
          <div className="flex items-center gap-2">
            <Dumbbell size={15} className="text-[#007AFF]" />
            <p className="text-xs text-gray-500">אימונים השבוע</p>
          </div>
          <p className="text-3xl font-bold leading-none text-gray-900">
            {workoutsCompleted}
            <span className="text-gray-400 text-lg font-normal">/{workoutGoal}</span>
          </p>
          <ProgressBar value={workoutsCompleted} max={workoutGoal}
            color={workoutsCompleted >= workoutGoal ? "bg-[#34C759]" : "bg-[#007AFF]"} />
          <p className="text-[11px] text-gray-400">
            {workoutsCompleted >= workoutGoal ? "יעד הושג! 🎉" : `נותרו ${workoutGoal - workoutsCompleted}`}
          </p>
        </div>

        <div className={cn(CARD, "p-4 space-y-2")}>
          <div className="flex items-center gap-2">
            <Target size={15} className="text-violet-500" />
            <p className="text-xs text-gray-500">ימי חלבון</p>
          </div>
          <p className="text-3xl font-bold leading-none text-gray-900">
            {proteinDaysHit}
            <span className="text-gray-400 text-lg font-normal">/7</span>
          </p>
          <ProgressBar value={proteinDaysHit} max={7}
            color={proteinDaysHit >= 6 ? "bg-[#34C759]" : proteinDaysHit >= 4 ? "bg-[#FF9500]" : "bg-[#FF3B30]"} />
          <p className="text-[11px] text-gray-400">
            {proteinDaysHit >= 6 ? "עמידה מצוינת!" : `יעד: ${targetProtein} גר'`}
          </p>
        </div>
      </div>

      {/* Nutrition adherence */}
      <div className={cn(CARD, "p-4 space-y-4")}>
        <SectionHeader icon={Flame} title="תזונה שבועית" iconColor="text-orange-500" />

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-500">ממוצע קלוריות</span>
            <span className={cn("font-semibold text-gray-900",
              avgCalories >= targetCalories * 0.9 && avgCalories <= targetCalories * 1.1 ? "text-[#34C759]" : "")}>
              {avgCalories}
              <span className="text-gray-400 font-normal"> / {targetCalories} קק&quot;ל</span>
            </span>
          </div>
          <ProgressBar value={caloriePct} max={100} color="bg-orange-400" />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-500">ממוצע חלבון</span>
            <span className={cn("font-semibold text-gray-900", avgProtein >= targetProtein ? "text-[#34C759]" : "")}>
              {avgProtein}
              <span className="text-gray-400 font-normal"> / {targetProtein} גר&apos;</span>
            </span>
          </div>
          <ProgressBar value={proteinPct} max={100}
            color={avgProtein >= targetProtein ? "bg-[#34C759]" : "bg-violet-500"} />
        </div>

        {/* Protein day dots */}
        <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
          <p className="text-[11px] text-gray-500 mb-2">עמידה ביעד חלבון — יום לפי יום</p>
          <div className="flex gap-1.5 justify-between">
            {dailyNutrition.map((day, i) => {
              const hit = day.hasData && day.protein >= targetProtein
              const missed = day.hasData && !hit
              const future = day.isFuture
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold",
                    hit    ? "bg-[#34C759] text-white"
                    : missed ? "bg-red-50 text-[#FF3B30] border border-red-100"
                    : future ? "bg-gray-50 text-gray-300"
                    :          "bg-gray-100 text-gray-300",
                  )}>
                    {day.label}
                  </div>
                  {day.hasData && (
                    <p className="text-[9px] text-gray-300 text-center leading-none">{day.protein}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Body weight trend */}
      {(thisWeekAvgWeight !== null || lastWeekAvgWeight !== null) && (
        <div className={cn(CARD, "p-4")}>
          <SectionHeader icon={Scale} title="מגמת משקל גוף" iconColor="text-teal-500" />
          <div className="mt-4 grid grid-cols-3 gap-2 items-center">
            <div className="text-center">
              <p className="text-[11px] text-gray-400 mb-1">שבוע קודם</p>
              <p className="text-xl font-bold text-gray-900">
                {lastWeekAvgWeight ?? "—"}
                <span className="text-xs text-gray-400 font-normal"> ק&quot;ג</span>
              </p>
              {lastWeekAvgWeight && <p className="text-[10px] text-gray-300">ממוצע 7י&apos;</p>}
            </div>

            <div className="flex flex-col items-center gap-1">
              {weightDelta !== null ? (
                <>
                  <div className={cn(
                    "flex items-center gap-1 text-base font-bold",
                    weightDelta > 0 ? "text-[#FF9500]" : weightDelta < 0 ? "text-teal-600" : "text-gray-400",
                  )}>
                    {weightDelta > 0 ? <TrendingUp size={16} /> : weightDelta < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                    {weightDelta > 0 ? "+" : ""}{weightDelta} ק&quot;ג
                  </div>
                  <p className="text-[10px] text-gray-400">שינוי</p>
                </>
              ) : (
                <p className="text-xs text-gray-300 text-center">אין נתוני השוואה</p>
              )}
            </div>

            <div className="text-center">
              <p className="text-[11px] text-gray-400 mb-1">השבוע (חלקי)</p>
              <p className="text-xl font-bold text-gray-900">
                {thisWeekAvgWeight ?? "—"}
                <span className="text-xs text-gray-400 font-normal"> ק&quot;ג</span>
              </p>
              {thisWeekAvgWeight && (
                <p className="text-[10px] text-gray-300">ממוצע עד היום</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7-day nutrition charts */}
      <div className={cn(CARD, "p-4")}>
        <SectionHeader icon={Flame} title="תזונה — 7 ימים" iconColor="text-orange-500" />
        <div className="mt-4">
          <WeeklyCharts
            dailyNutrition={dailyNutrition}
            targetCalories={targetCalories}
            targetProtein={targetProtein}
          />
        </div>
        <p className="text-[10px] text-gray-300 mt-2 text-center">
          קו מקווקו = יעד · ירוק = בטווח היעד
        </p>
      </div>

      {/* Progressive overload */}
      <div className={cn(CARD, "p-4")}>
        <SectionHeader icon={TrendingUp} title="עומס פרוגרסיבי" iconColor="text-[#34C759]" />
        <p className="text-[11px] text-gray-400 mt-1">
          שבוע מלא אחרון (מ-{progressionWeekLabel}) מול השבוע שלפניו · שיא = מעל כל ההיסטוריה
        </p>

        {progressionList.length === 0 ? (
          <div className="mt-4 text-center py-4">
            <TrendingUp size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">אין נתוני אימון בשבוע המלא האחרון</p>
            <p className="text-xs text-gray-300 mt-1">לאחר האימון הראשון, תראה כאן ניתוח עומס</p>
          </div>
        ) : (
          <div className="mt-3 space-y-0">
            <div className="flex items-center justify-between text-[10px] text-gray-300 uppercase tracking-wide pb-1 border-b border-gray-100">
              <span>תרגיל</span>
              <div className="flex gap-4 text-end">
                <span className="w-16">נפח</span>
                <span className="w-16">סט מוביל</span>
              </div>
            </div>
            {progressionList.map((ex, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0 me-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold leading-tight text-gray-900">{ex.name}</p>
                    {ex.isPR && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 shrink-0">
                        <Trophy size={9} /> שיא!
                      </span>
                    )}
                    {ex.isNew && (
                      <span className="text-[10px] font-bold text-[#007AFF] bg-blue-50 border border-blue-100 rounded-full px-1.5 py-0.5 shrink-0">
                        חדש
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {MUSCLE_HE[ex.primaryMuscle] ?? ex.primaryMuscle}
                  </p>
                </div>
                <div className="flex gap-4 shrink-0">
                  {/* Volume: tonnage (kg) for weighted, total reps / seconds otherwise */}
                  <div className="w-16 text-end">
                    <p className={cn("text-xs font-semibold",
                      ex.volumeDelta > 0 ? "text-[#34C759]" : ex.volumeDelta < 0 ? "text-[#FF3B30]" : "text-gray-400")}>
                      {ex.volumeDelta > 0 ? "+" : ""}{ex.volumeDelta} {METRIC_UNIT[ex.kind]}
                    </p>
                    <p className="text-[10px] text-gray-300">
                      {ex.volumeDeltaPct !== null ? `${ex.volumeDeltaPct > 0 ? "+" : ""}${ex.volumeDeltaPct}%` : "—"}
                    </p>
                  </div>
                  {/* Best set: e1RM (kg) · reps · seconds */}
                  <div className="w-16 text-end">
                    <p className={cn("text-xs font-semibold",
                      ex.bestDelta == null ? "text-gray-400"
                      : ex.bestDelta > 0 ? "text-[#34C759]" : ex.bestDelta < 0 ? "text-[#FF3B30]" : "text-gray-400")}>
                      {ex.bestDelta == null ? "—" : `${ex.bestDelta > 0 ? "+" : ""}${ex.bestDelta} ${METRIC_UNIT[ex.kind]}`}
                    </p>
                    <p className="text-[10px] text-gray-300">
                      {ex.thisBest} {ex.kind === "e1rm" ? "1RM משוער" : METRIC_UNIT[ex.kind]}
                    </p>
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
          <h1 className="text-2xl font-bold text-gray-900">התאוששות ותובנות</h1>
          <p className="text-sm text-gray-500 mt-0.5">מ-{weekly.weekLabel} עד היום</p>
        </div>
        <CalendarDays size={26} className="text-violet-500" />
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
        <button
          onClick={() => setTab("recovery")}
          className={cn(
            "flex-1 py-2 text-sm font-medium rounded-xl transition-colors",
            tab === "recovery"
              ? "bg-[#007AFF] text-white"
              : "text-gray-400 hover:text-gray-600",
          )}
        >
          מצב התאוששות
        </button>
        <button
          onClick={() => setTab("weekly")}
          className={cn(
            "flex-1 py-2 text-sm font-medium rounded-xl transition-colors",
            tab === "weekly"
              ? "bg-[#007AFF] text-white"
              : "text-gray-400 hover:text-gray-600",
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
