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

const INK    = "#1d1d1f"
const MUTED  = "#86868b"
const ACCENT = "#0071e3"
const GREEN  = "#34c759"

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
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ backgroundColor: "#f5f5f7", color: INK }}
    >
      <Icon size={11} style={{ color: MUTED }} />
      {label}
    </span>
  )
}

/** Bi-weekly Controlled Lean Gain check-in prompt — appears on the dashboard
 *  once 14–21 days have passed since the last check-in, shows the decision
 *  engine's computed trend read + recommendation, and lets the user apply it
 *  (persisting the cumulative calorieAdjustmentOffset) or dismiss for now.
 *  Never appears at all while Vacation Mode is on — /api/checkin reports
 *  `due: false` unconditionally in that case. */
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
      <div className="flex items-start gap-3 bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]" dir="rtl">
        <Check size={18} className="mt-0.5 shrink-0" style={{ color: GREEN }} />
        <div>
          <p className="text-[14px] font-semibold" style={{ color: GREEN }}>הצ&apos;ק-אין הוחל</p>
          <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: MUTED }}>{applied.reasoning}</p>
          {applied.offsetDelta !== 0 && (
            <p className="text-[11px] mt-1" style={{ color: MUTED }}>
              תיקון קלוריות מצטבר: {applied.offsetAfter! > 0 ? "+" : ""}
              {applied.offsetAfter} קק&quot;ל
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl p-5 space-y-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]" dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold flex items-center gap-1.5" style={{ color: ACCENT }}>
          <ClipboardCheck size={16} /> צ&apos;ק-אין דו-שבועי
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-full hover:bg-[#f5f5f7] transition-colors"
          style={{ color: MUTED }}
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

      <p className="text-[13px] leading-relaxed" style={{ color: MUTED }}>{preview.reasoning}</p>

      {preview.offsetDelta !== 0 && (
        <p className="text-[13px] font-semibold" style={{ color: ACCENT }}>
          {preview.decision === "increase" ? "המלצה: הוספת" : "המלצה: הפחתת"} {Math.abs(preview.offsetDelta ?? 0)} קק&quot;ל ליעד היומי
        </p>
      )}

      <button
        onClick={handleApply}
        disabled={applying}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-semibold transition-opacity active:opacity-80 disabled:opacity-40 text-white",
        )}
        style={{ backgroundColor: ACCENT }}
      >
        {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {applying ? "מחיל..." : preview.offsetDelta !== 0 ? "החל שינוי" : "אשר — ללא שינוי"}
      </button>
    </div>
  )
}
