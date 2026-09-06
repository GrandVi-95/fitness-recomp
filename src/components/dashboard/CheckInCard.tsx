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

// Shared "bento box" card treatment — matches the dashboard page's CARD constant.
const CARD = "bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"

const WEIGHT_LABELS: Record<string, string> = {
  fast_loss: "ירידה מהירה",
  down: "ירידה",
  stable: "יציב",
  up: "עלייה",
}
const WAIST_LABELS: Record<string, string> = { down: "ירידה", stable: "יציב", up: "עלייה" }
const PERF_LABELS: Record<string, string> = { down: "ירידה", stable: "יציב", up: "שיפור" }

// Read-only "pill" — the check-in engine's auto-computed weight/waist/
// performance trend readouts, styled like modern iOS segmented pills rather
// than a raw HTML <select>.
function TrendPill({ label, trend }: { label: string; trend: "down" | "stable" | "up" | "fast_loss" }) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" || trend === "fast_loss" ? TrendingDown : Minus
  return (
    <span className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full px-4 py-2 text-sm font-medium border-none text-gray-900">
      <Icon size={13} className="text-gray-400" />
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
      <div className={cn(CARD, "flex items-start gap-3")} dir="rtl">
        <Check size={18} className="mt-0.5 shrink-0 text-[#34C759]" />
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-[#34C759]">הצ&apos;ק-אין הוחל</p>
          <p className="text-[13px] mt-0.5 leading-relaxed text-gray-500">{applied.reasoning}</p>
          {applied.offsetDelta !== 0 && (
            <p className="text-[11px] mt-1 text-gray-400">
              תיקון קלוריות מצטבר: {applied.offsetAfter! > 0 ? "+" : ""}
              {applied.offsetAfter} קק&quot;ל
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn(CARD, "space-y-4")} dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold tracking-tight flex items-center gap-1.5 text-[#007AFF]">
          <ClipboardCheck size={16} /> צ&apos;ק-אין דו-שבועי
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-full hover:bg-gray-100 transition-colors text-gray-400"
          aria-label="סגור"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {preview.weightTrendLabel && (
          <TrendPill label={`משקל: ${WEIGHT_LABELS[preview.weightTrendLabel]}`} trend={preview.weightTrendLabel} />
        )}
        {preview.waistTrendLabel && (
          <TrendPill label={`היקף מותן: ${WAIST_LABELS[preview.waistTrendLabel]}`} trend={preview.waistTrendLabel} />
        )}
        {preview.perfTrendLabel && (
          <TrendPill label={`ביצועים: ${PERF_LABELS[preview.perfTrendLabel]}`} trend={preview.perfTrendLabel} />
        )}
      </div>

      <p className="text-[13px] leading-relaxed text-gray-500">{preview.reasoning}</p>

      {preview.offsetDelta !== 0 && (
        <p className="text-[13px] font-semibold text-[#007AFF]">
          {preview.decision === "increase" ? "המלצה: הוספת" : "המלצה: הפחתת"} {Math.abs(preview.offsetDelta ?? 0)} קק&quot;ל ליעד היומי
        </p>
      )}

      <button
        onClick={handleApply}
        disabled={applying}
        className="w-full flex items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-semibold text-white bg-[#007AFF] transition active:scale-95 disabled:opacity-40"
      >
        {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {applying ? "מחיל..." : preview.offsetDelta !== 0 ? "החל שינוי" : "אשר — ללא שינוי"}
      </button>
    </div>
  )
}
