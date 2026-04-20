import {
  HeartPulse,
  BedDouble,
  Zap,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
} from "lucide-react"
import Link from "next/link"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

// ─────────────────────────────────────────────────────────
// Volume landmarks
// ─────────────────────────────────────────────────────────

const MUSCLE_ORDER  = ["chest","back","shoulders","biceps","triceps","quads","hamstrings","core"] as const
type Muscle = typeof MUSCLE_ORDER[number]

const MUSCLE_LABELS: Record<Muscle, string> = {
  chest:"חזה", back:"גב", shoulders:"כתפיים", biceps:"בייספס",
  triceps:"טרייספס", quads:"קוואדס", hamstrings:"ירכיים", core:"בטן",
}

const THRESHOLDS: Record<Muscle, { min: number; max: number }> = {
  chest:      { min:8,  max:20 }, back:      { min:8,  max:20 },
  shoulders:  { min:6,  max:16 }, biceps:    { min:6,  max:12 },
  triceps:    { min:6,  max:12 }, quads:     { min:8,  max:20 },
  hamstrings: { min:8,  max:20 }, core:      { min:6,  max:12 },
}

const STATUS_STYLES = {
  optimal: { bar:"bg-green-500", label:"bg-green-500/10 text-green-400",  text:"אופטימלי" },
  under:   { bar:"bg-amber-500", label:"bg-amber-500/10 text-amber-400",  text:"חסר"      },
  over:    { bar:"bg-red-500",   label:"bg-red-500/10 text-red-400",      text:"ביתר"     },
}

const DELOAD_THRESHOLD = 6

// ─────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────

async function getRecoveryData() {
  const now = new Date()

  // Last completed session
  const lastSession = await db.workoutSession.findFirst({
    where: { userId: DEMO_USER_ID, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    include: { sets: { where: { isWarmup: false } } },
  })

  const rpeValues = lastSession?.sets.map((s) => s.rpe).filter((r): r is number => r != null) ?? []
  const lastAvgRpe = rpeValues.length
    ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
    : null

  // Weekly volume (last 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const recentSessions = await db.workoutSession.findMany({
    where: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { gte: sevenDaysAgo } },
    include: {
      sets: {
        where: { isWarmup: false },
        include: { exercise: { select: { primaryMuscle: true } } },
      },
    },
  })

  const setsByMuscle: Record<string, number> = {}
  for (const s of recentSessions)
    for (const set of s.sets)
      setsByMuscle[set.exercise.primaryMuscle] = (setsByMuscle[set.exercise.primaryMuscle] ?? 0) + 1

  const weeklyVolume = MUSCLE_ORDER.map((muscle) => {
    const sets = setsByMuscle[muscle] ?? 0
    const { min, max } = THRESHOLDS[muscle]
    const status: "under" | "optimal" | "over" = sets < min ? "under" : sets > max ? "over" : "optimal"
    return { muscle: MUSCLE_LABELS[muscle], sets, status }
  })

  // Consecutive weeks
  let consecutiveWeeks = 0
  for (let w = 0; w < 12; w++) {
    const end   = new Date(now.getTime() - w * 7 * 86_400_000)
    const start = new Date(now.getTime() - (w + 1) * 7 * 86_400_000)
    const count = await db.workoutSession.count({
      where: { userId: DEMO_USER_ID, completedAt: { not: null }, startedAt: { gte: start, lt: end } },
    })
    if (count === 0) break
    consecutiveWeeks++
  }

  return {
    lastSleep:    lastSession?.sleepHours   ?? null,
    lastFatigue:  lastSession?.fatigueLevel ?? null,
    lastAvgRpe,
    weeklyVolume,
    consecutiveWeeks,
  }
}

// ─────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────

export default async function RecoveryPage() {
  const { lastSleep, lastFatigue, lastAvgRpe, weeklyVolume, consecutiveWeeks } = await getRecoveryData()

  const hasData = lastSleep != null || lastFatigue != null || lastAvgRpe != null
  const underTrained = weeklyVolume.filter((m) => m.status === "under")

  const scores = [
    { label:"שינה",      value: lastSleep   != null ? lastSleep   : "—", unit: lastSleep   != null ? "שע'" : "", icon: BedDouble,  color:"text-blue-400"  },
    { label:"עייפות",    value: lastFatigue  != null ? lastFatigue  : "—", unit: lastFatigue  != null ? "/5"  : "", icon: Zap,        color:"text-amber-400" },
    { label:"RPE אימון", value: lastAvgRpe   != null ? lastAvgRpe   : "—", unit: lastAvgRpe   != null ? "/10" : "", icon: HeartPulse, color:"text-red-400"   },
  ]

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

      {/* כותרת */}
      <div>
        <h1 className="text-2xl font-bold">התאוששות ותובנות</h1>
        <p className="text-sm text-slate-400 mt-0.5">מעקב נפח · אותות דילוד · קצב חלבון</p>
      </div>

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
