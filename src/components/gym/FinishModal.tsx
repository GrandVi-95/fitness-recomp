"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Clock, Dumbbell, TrendingUp, Zap, BedDouble } from "lucide-react"
import { useGymStore } from "@/store/gymStore"
import { cn } from "@/lib/utils"

function formatDuration(mins: number | null): string {
  if (mins == null) return "—"
  if (mins < 60) return `${mins} דק'`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h} שע' ${m} דק'`
}

const FATIGUE_OPTIONS = [
  { value: 1, emoji: "😴", label: "קל"            },
  { value: 2, emoji: "🙂", label: "קצת קשה"      },
  { value: 3, emoji: "💪", label: "בינוני"        },
  { value: 4, emoji: "😤", label: "קשה"           },
  { value: 5, emoji: "🥵", label: "מאמץ מקסימלי" },
]

const SLEEP_PRESETS = [5, 6, 7, 7.5, 8, 9]

interface FinishSummary {
  durationMins: number | null
  totalVolume: number
  workingSetCount: number
  avgRpe: number | null
}

export default function FinishModal() {
  const router = useRouter()
  const {
    sessionId,
    workoutName,
    startedAt,
    loggedSets,
    fatigueLevel,
    sleepHours,
    setFatigue,
    setSleepHours,
    resetSession,
  } = useGymStore()

  const [summary, setSummary] = useState<FinishSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local totals (shown while saving)
  const localWorkingSets = Object.values(loggedSets)
    .flat()
    .filter((s) => !s.isWarmup)
  const localVolume = localWorkingSets.reduce(
    (sum, s) => sum + s.weightKg * s.reps,
    0
  )
  const localDuration = startedAt
    ? Math.round((Date.now() - startedAt) / 60_000)
    : null

  const handleSave = async () => {
    if (!sessionId) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/gym/sessions/${sessionId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatigueLevel, sleepHours }),
      })

      if (!res.ok) throw new Error("Server error")
      const data: FinishSummary = await res.json()
      setSummary(data)
    } catch {
      setError("שמירה נכשלה — הסטים שלך נשמרו ויסונכרנו בקרוב.")
    } finally {
      setSaving(false)
    }
  }

  const handleDone = () => {
    resetSession()
    router.push("/dashboard")
  }

  const displayVolume = summary?.totalVolume ?? Math.round(localVolume)
  const displayDuration = summary?.durationMins ?? localDuration
  const displaySetCount = summary?.workingSetCount ?? localWorkingSets.length

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto">
      <div className="flex flex-col items-center justify-start min-h-full px-6 py-10 max-w-lg mx-auto w-full">

        {/* גיבור */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-3xl font-black mb-1">האימון הושלם!</h1>
          <p className="text-slate-400 text-sm">{workoutName}</p>
        </div>

        {/* רשת סטטיסטיקות */}
        <div className="grid grid-cols-2 gap-3 w-full mb-8">
          <StatCard icon={Clock}      label="משך"        value={formatDuration(displayDuration)} color="text-blue-400"   />
          <StatCard icon={Dumbbell}   label="סטים עבודה" value={displaySetCount.toString()}       color="text-indigo-400" />
          <StatCard icon={TrendingUp} label="נפח כולל"   value={`${displayVolume.toLocaleString()} ק"ג`} color="text-green-400" />
          {summary?.avgRpe != null && (
            <StatCard icon={Zap} label="RPE ממוצע" value={`${summary.avgRpe} / 10`} color="text-amber-400" />
          )}
        </div>

        {/* שאלות סיום — מוסתרות לאחר שמירה */}
        {!summary && (
          <>
            {/* ── שינה ── */}
            <div className="w-full mb-6">
              <div className="flex items-center gap-2 mb-3">
                <BedDouble size={16} className="text-blue-400" />
                <p className="text-sm font-semibold text-slate-300">כמה שעות ישנת אתמול?</p>
                {sleepHours != null && (
                  <span className="ms-auto text-sm font-bold text-blue-300">{sleepHours} שע'</span>
                )}
              </div>
              <div className="flex gap-2">
                {SLEEP_PRESETS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setSleepHours(sleepHours === h ? null : h)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all",
                      sleepHours === h
                        ? "border-blue-500 bg-blue-500/20 text-blue-200 scale-105"
                        : "border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-600"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 text-center">שעות שינה (אופציונלי)</p>
            </div>

            {/* ── עייפות ── */}
            <div className="w-full mb-8">
              <p className="text-sm font-semibold text-center mb-4 text-slate-300">
                איך אתה מרגיש?
              </p>
              <div className="flex gap-2">
                {FATIGUE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFatigue(opt.value)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all",
                      fatigueLevel === opt.value
                        ? "border-indigo-500 bg-indigo-500/20 scale-105"
                        : "border-slate-800 bg-slate-900 hover:border-slate-600"
                    )}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* שגיאה */}
        {error && (
          <p className="text-amber-400 text-xs text-center mb-4 bg-amber-500/10 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* פעולות */}
        {!summary ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-2xl py-4 text-base font-bold flex items-center justify-center gap-2 transition-colors mb-3"
          >
            {saving ? (
              <><span className="animate-spin text-lg">◌</span> שומר...</>
            ) : (
              <><CheckCircle2 size={20} /> שמור אימון</>
            )}
          </button>
        ) : (
          <button
            onClick={handleDone}
            className="w-full bg-green-600 hover:bg-green-500 rounded-2xl py-4 text-base font-bold flex items-center justify-center gap-2 transition-colors mb-3"
          >
            <CheckCircle2 size={20} /> חזרה ללוח הבקרה
          </button>
        )}

        <button
          onClick={handleDone}
          className="text-sm text-slate-500 hover:text-slate-300 py-2 transition-colors"
        >
          {summary ? "סגור" : "דלג ומחק אימון"}
        </button>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-xl bg-slate-800 ${color}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-bold leading-tight">{value}</p>
      </div>
    </div>
  )
}
