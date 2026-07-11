"use client"

import { useEffect, useRef } from "react"
import { CheckCircle2, SkipForward, Plus, Minus, Zap } from "lucide-react"
import { useRestTimer } from "@/hooks/useRestTimer"
import { useGymStore } from "@/store/gymStore"
import { cn } from "@/lib/utils"

// גיאומטריית טבעת SVG
const R = 54
const CIRCUMFERENCE = 2 * Math.PI * R  // ≈ 339.3

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export default function RestTimerOverlay() {
  const { secondsRemaining, percentRemaining, isFinished } = useRestTimer()
  const {
    skipRest,
    adjustRestDuration,
    lastLoggedSetInfo,
    currentExIdx,
    exercises,
    loggedSets,
  } = useGymStore()

  // רטט עדין כשהטיימר מסתיים (נתמך בעיקר ב-Android Chrome)
  const hasVibratedRef = useRef(false)
  useEffect(() => {
    if (isFinished && !hasVibratedRef.current) {
      hasVibratedRef.current = true
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200])
      }
    }
    if (!isFinished) hasVibratedRef.current = false
  }, [isFinished])

  const currentEx = exercises[currentExIdx]
  const nextEx = exercises[currentExIdx + 1] ?? null

  // צבע משתנה לפי זמן שנותר
  const ringColor = isFinished
    ? "#22c55e"
    : secondsRemaining > 45
    ? "#6366f1"
    : secondsRemaining > 20
    ? "#f59e0b"
    : "#ef4444"

  const strokeDashoffset = CIRCUMFERENCE * (1 - percentRemaining)

  // כמה סטים עבודה בוצעו לתרגיל הנוכחי
  const workingSets = (loggedSets[currentEx?.exerciseId ?? ""] ?? []).filter(
    (s) => !s.isWarmup
  )
  const setsRemaining =
    currentEx ? currentEx.targetSets - workingSets.length : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/98 backdrop-blur-sm px-6">
      {/* באנר אישור סט */}
      <div
        className={cn(
          "flex items-center gap-2 mb-3 px-4 py-2 rounded-full",
          isFinished
            ? "bg-green-500/20 text-green-400"
            : "bg-indigo-500/10 text-indigo-400"
        )}
      >
        <CheckCircle2 size={16} strokeWidth={2.5} />
        <span className="text-sm font-semibold">
          {lastLoggedSetInfo
            ? `סט ${lastLoggedSetInfo.setNumber} נרשם${lastLoggedSetInfo.isWarmup ? " (חימום)" : ""}`
            : "סט נרשם"}
        </span>
      </div>

      {/* פרטי הסט האחרון */}
      {lastLoggedSetInfo && (
        <p className="text-slate-400 text-sm mb-8 text-center">
          {lastLoggedSetInfo.exerciseName}
          {" · "}
          {lastLoggedSetInfo.durationSecs ? (
            <span className="text-slate-200 font-semibold">
              {lastLoggedSetInfo.durationSecs} שניות החזקה
            </span>
          ) : (
            <>
              <span className="text-slate-200 font-semibold">
                {lastLoggedSetInfo.weightKg > 0
                  ? `${lastLoggedSetInfo.weightKg} ק"ג`
                  : "BW"}
              </span>
              {" × "}
              <span className="text-slate-200 font-semibold">
                {lastLoggedSetInfo.reps} חזרות
              </span>
            </>
          )}
        </p>
      )}

      {/* ── טבעת טיימר SVG ──────────────────────────────────── */}
      <div className="relative mb-8" style={{ width: 148, height: 148 }}>
        <svg
          width="148"
          height="148"
          viewBox="0 0 128 128"
          className="-rotate-90"
        >
          {/* מסלול */}
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="#1e293b"
            strokeWidth="10"
          />
          {/* טבעת התקדמות */}
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 0.25s linear, stroke 0.4s ease",
              filter: isFinished ? `drop-shadow(0 0 6px ${ringColor})` : "none",
            }}
          />
        </svg>

        {/* תוכן מרכזי */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isFinished ? (
            <>
              <Zap size={28} className="text-green-400 mb-1" fill="currentColor" />
              <span className="text-sm font-bold text-green-400">קדימה!</span>
            </>
          ) : (
            <>
              <span
                className="text-4xl font-black tabular-nums leading-none"
                style={{ color: ringColor }}
              >
                {formatTime(secondsRemaining)}
              </span>
              <span className="text-xs text-slate-500 mt-1 tracking-widest uppercase">
                מנוחה
              </span>
            </>
          )}
        </div>
      </div>

      {/* כפתורי כוונון + דילוג */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => adjustRestDuration(-15)}
          className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-sm font-medium text-slate-300 transition-colors"
        >
          <Minus size={14} /> 15 שנ'
        </button>

        <button
          onClick={skipRest}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors",
            isFinished
              ? "bg-green-600 hover:bg-green-500 text-white"
              : "bg-slate-700 hover:bg-slate-600 text-slate-300"
          )}
        >
          <SkipForward size={16} />
          {isFinished ? "← סט הבא" : "דלג על מנוחה"}
        </button>

        <button
          onClick={() => adjustRestDuration(30)}
          className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-sm font-medium text-slate-300 transition-colors"
        >
          <Plus size={14} /> 30 שנ'
        </button>
      </div>

      {/* רמז הקשרי — מה הבא */}
      <div className="text-center space-y-1">
        {setsRemaining > 0 ? (
          <p className="text-xs text-slate-500">
            נותרו {setsRemaining} {setsRemaining === 1 ? "סט" : "סטים"} עבור{" "}
            <span className="text-slate-300">{currentEx?.name}</span>
          </p>
        ) : nextEx ? (
          <p className="text-xs text-slate-500">
            הבא:{" "}
            <span className="text-slate-300 font-medium">{nextEx.name}</span>
            {" · "}
            {nextEx.targetSets} × {nextEx.targetReps}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            תרגיל אחרון — סיים בכוח!
          </p>
        )}
      </div>
    </div>
  )
}
