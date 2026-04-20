"use client"

import { useEffect, useState } from "react"
import { useGymStore } from "@/store/gymStore"

export interface RestTimerState {
  secondsRemaining: number
  percentRemaining: number   // 1.0 → 0.0 as timer counts down
  isActive: boolean
  isFinished: boolean        // true once timer hits 0 while active
}

/**
 * Derives real-time countdown from the timestamp stored in Zustand.
 * Uses Date.now() arithmetic so tab-switching / refresh is handled correctly:
 * when the user comes back, the remaining time reflects wall-clock time, not
 * an in-memory countdown that was paused.
 */
export function useRestTimer(): RestTimerState {
  const restActive = useGymStore((s) => s.restActive)
  const restStartedAt = useGymStore((s) => s.restStartedAt)
  const restDurationSecs = useGymStore((s) => s.restDurationSecs)

  const [secondsRemaining, setSecondsRemaining] = useState<number>(
    restDurationSecs
  )

  useEffect(() => {
    if (!restActive || restStartedAt === null) {
      setSecondsRemaining(restDurationSecs)
      return
    }

    const calculate = () => {
      const elapsed = (Date.now() - restStartedAt) / 1000
      return Math.max(0, restDurationSecs - elapsed)
    }

    // Set immediately so there's no initial flash
    setSecondsRemaining(calculate())

    const id = setInterval(() => {
      const rem = calculate()
      setSecondsRemaining(rem)
      if (rem <= 0) clearInterval(id)
    }, 250)

    return () => clearInterval(id)
  }, [restActive, restStartedAt, restDurationSecs])

  return {
    secondsRemaining: Math.ceil(secondsRemaining),
    percentRemaining:
      restDurationSecs > 0 ? Math.max(0, secondsRemaining / restDurationSecs) : 0,
    isActive: restActive,
    isFinished: restActive && secondsRemaining <= 0,
  }
}
