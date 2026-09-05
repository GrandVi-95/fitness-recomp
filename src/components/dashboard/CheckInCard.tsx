"use client"

import { useEffect, useState } from "react"
import { ClipboardCheck, Loader2, Check, X, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckInPreview {
  due: boolean
  weightTrendLabel?: "fast_loss" | "down" | "stable" | "up"
  waistTrendLabel?: "down" | "stable" | "up"
  perfTrendLabel?: "down" | "stable" | "up"
  decision?: "no_change" | "increase" | "decrease"
  offsetDelta?: number
  reasoning?: string
  currentOffset?: number
  offsetAfter?: number
}

const WEIGHT_LABELS: Record<string, string> = {
  fast_loss: "ירידה מהירה",
  down: "ירידה",
  stable: "יציב",
  up: "עלייה",
}
const WAIST_LABELS: Record<string, string> = { down: "ירידה", stable: "יציב", up: "עלייה" }
const PERF_LABELS: Record<string, string> = { down: "ירידה", stable: "יציב", up: "שיפור" }

function TrendChip({ label, trend }: { label: string; trend: "down" | "stable" | "up" | "fast_loss" }) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" || trend === "fast_loss" ? TrendingDown : Minus
  return (
    <span className="inline-flex items-center gap-1 bg-slate-800 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-300">
      <Icon size={11} className="text-slate-500" />
      {label}
    </span>
  )
}

/** Bi-weekly Controlled Lean Gain check-in prompt — appears on the dashboard
 *  once 14–21 days have passed since the last check-in, shows the decision
 *  engine's computed trend read + recommendation, and lets the user apply it
 *  (persisting the cumulative calorieAdjustmentOffset) or dismiss for now. */
export default function CheckInCard() {
  const [preview, setPreview] = useState<CheckInPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState<CheckInPreview | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    fetch("/api/checkin")
      .then((r) => r.json())
      .then((data: CheckInPreview) => setPreview(data))
      .catch(() => setPreview({ due: false }))
      .finally(() => setLoading(false))
  }, [])

  const handleApply = async () => {
    setApplying(true)
    try {
      const res = await fetch("/api/checkin", { method: "POST" })
      const data = await res.json()
      if (res.ok) setApplied(data)
    } catch {
      // Silently fail — the card just stays visible for a retry.
    } finally {
      setApplying(false)
    }
  }

  if (loading || dismissed || !preview?.due) return null

  if (applied) {
    return (
      <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4" dir="rtl">
        <Check size={18} className="text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-400">הצ&apos;ק-אין הוחל</p>
          <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{applied.reasoning}</p>
          {applied.offsetDelta !== 0 && (
            <p className="text-[11px] text-slate-500 mt-1">
              תיקון קלוריות מצטבר: {applied.offsetAfter! > 0 ? "+" : ""}
              {applied.offsetAfter} קק&quot;ל
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-indigo-300 flex items-center gap-1.5">
          <ClipboardCheck size={16} /> צ&apos;ק-אין דו-שבועי
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="סגור"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {preview.weightTrendLabel && (
          <TrendChip label={`משקל: ${WEIGHT_LABELS[preview.weightTrendLabel]}`} trend={preview.weightTrendLabel} />
        )}
        {preview.waistTrendLabel && (
          <TrendChip label={`היקף מותן: ${WAIST_LABELS[preview.waistTrendLabel]}`} trend={preview.waistTrendLabel} />
        )}
        {preview.perfTrendLabel && (
          <TrendChip label={`ביצועים: ${PERF_LABELS[preview.perfTrendLabel]}`} trend={preview.perfTrendLabel} />
        )}
      </div>

      <p className="text-xs text-slate-300 leading-relaxed">{preview.reasoning}</p>

      {preview.offsetDelta !== 0 && (
        <p className="text-xs font-semibold text-indigo-300">
          {preview.decision === "increase" ? "המלצה: הוספת" : "המלצה: הפחתת"} {Math.abs(preview.offsetDelta ?? 0)} קק&quot;ל ליעד היומי
        </p>
      )}

      <button
        onClick={handleApply}
        disabled={applying}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors",
          "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white",
        )}
      >
        {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {applying ? "מחיל..." : preview.offsetDelta !== 0 ? "החל שינוי" : "אשר — ללא שינוי"}
      </button>
    </div>
  )
}
