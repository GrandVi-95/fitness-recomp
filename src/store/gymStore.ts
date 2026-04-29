"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface LoggedSet {
  tempId: string        // client-assigned, used for optimistic updates
  serverId?: string     // assigned by server after successful POST
  exerciseId: string
  setNumber: number
  reps: number
  weightKg: number
  rpe: number           // 1–10
  isWarmup: boolean
  loggedAt: number      // Date.now() timestamp — survives serialisation
}

export interface PreviousPerformance {
  sessionDate: string   // "Apr 10"
  sets: { reps: number; weightKg: number; rpe?: number }[]
  topSetWeightKg: number
  totalVolume: number
}

export interface SessionExercise {
  workoutExerciseId: string
  exerciseId: string
  name: string
  primaryMuscle: string
  equipment: string    // "barbell" | "bodyweight" | ...
  order: number
  targetSets: number
  targetReps: string   // "8-12" | "5" | "AMRAP"
  restSeconds: number
  notes?: string
  previousPerformance: PreviousPerformance | null
}

export interface LastLoggedSetInfo {
  exerciseName: string
  weightKg: number
  reps: number
  setNumber: number
  isWarmup: boolean
}

type GymStatus = "idle" | "active" | "finished"

interface GymState {
  // ── Session ────────────────────────────────────────────────
  sessionId: string | null
  workoutId: string | null
  workoutName: string
  startedAt: number | null     // Date.now() ms
  status: GymStatus

  // ── Exercise list ──────────────────────────────────────────
  exercises: SessionExercise[]
  currentExIdx: number

  // ── Per-exercise set logs ──────────────────────────────────
  loggedSets: Record<string, LoggedSet[]>  // exerciseId → sets

  // ── Live inputs (persisted so refresh doesn't lose entry) ──
  inputWeightKg: Record<string, number>
  inputReps: Record<string, number>
  inputRpe: Record<string, number>

  // ── Rest timer ─────────────────────────────────────────────
  restActive: boolean
  restStartedAt: number | null  // Date.now() when rest started
  restDurationSecs: number      // total duration for current rest
  lastLoggedSetInfo: LastLoggedSetInfo | null

  // ── Finish ─────────────────────────────────────────────────
  fatigueLevel: number          // 1–5
  sleepHours: number | null     // hours slept before session

  // ── Actions ────────────────────────────────────────────────
  startSession: (p: {
    sessionId: string
    workoutId: string
    workoutName: string
    exercises: SessionExercise[]
  }) => void
  logSet: (
    setData: Omit<LoggedSet, "tempId" | "loggedAt">
  ) => string  // returns tempId
  updateSetServerId: (tempId: string, serverId: string) => void
  adjustWeight: (exerciseId: string, delta: number) => void
  adjustReps: (exerciseId: string, delta: number) => void
  setWeight: (exerciseId: string, value: number) => void
  setReps: (exerciseId: string, value: number) => void
  setRpe: (exerciseId: string, value: number) => void
  nextExercise: () => void
  prevExercise: () => void
  startRest: (durationSecs: number, info: LastLoggedSetInfo) => void
  skipRest: () => void
  adjustRestDuration: (deltaSecs: number) => void
  setFatigue: (level: number) => void
  setSleepHours: (hours: number | null) => void
  markFinished: () => void
  resetSession: () => void
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Parse the lower bound of a rep range string, e.g. "8-12" → 8, "5" → 5 */
export function parseDefaultReps(targetReps: string): number {
  const match = targetReps.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 8
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useGymStore = create<GymState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──────────────────────────────────────
      sessionId: null,
      workoutId: null,
      workoutName: "",
      startedAt: null,
      status: "idle",
      exercises: [],
      currentExIdx: 0,
      loggedSets: {},
      inputWeightKg: {},
      inputReps: {},
      inputRpe: {},
      restActive: false,
      restStartedAt: null,
      restDurationSecs: 90,
      lastLoggedSetInfo: null,
      fatigueLevel: 3,
      sleepHours: null,

      // ── Actions ────────────────────────────────────────────
      startSession: ({ sessionId, workoutId, workoutName, exercises }) => {
        const inputWeightKg: Record<string, number> = {}
        const inputReps: Record<string, number> = {}
        const inputRpe: Record<string, number> = {}

        for (const ex of exercises) {
          inputWeightKg[ex.exerciseId] =
            ex.previousPerformance?.topSetWeightKg ?? 0
          inputReps[ex.exerciseId] = parseDefaultReps(ex.targetReps)
          inputRpe[ex.exerciseId] = 7
        }

        set({
          sessionId,
          workoutId,
          workoutName,
          startedAt: Date.now(),
          status: "active",
          exercises,
          currentExIdx: 0,
          loggedSets: {},
          inputWeightKg,
          inputReps,
          inputRpe,
          restActive: false,
          restStartedAt: null,
          restDurationSecs: 90,
          lastLoggedSetInfo: null,
          fatigueLevel: 3,
          sleepHours: null,
        })
      },

      logSet: (setData) => {
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const newSet: LoggedSet = { ...setData, tempId, loggedAt: Date.now() }

        set((state) => ({
          loggedSets: {
            ...state.loggedSets,
            [setData.exerciseId]: [
              ...(state.loggedSets[setData.exerciseId] ?? []),
              newSet,
            ],
          },
        }))

        return tempId
      },

      updateSetServerId: (tempId, serverId) => {
        set((state) => {
          const updated = { ...state.loggedSets }
          for (const exId in updated) {
            updated[exId] = updated[exId].map((s) =>
              s.tempId === tempId ? { ...s, serverId } : s
            )
          }
          return { loggedSets: updated }
        })
      },

      adjustWeight: (exerciseId, delta) =>
        set((state) => ({
          inputWeightKg: {
            ...state.inputWeightKg,
            [exerciseId]: Math.max(
              0,
              Math.round(
                ((state.inputWeightKg[exerciseId] ?? 0) + delta) * 10
              ) / 10
            ),
          },
        })),

      adjustReps: (exerciseId, delta) =>
        set((state) => ({
          inputReps: {
            ...state.inputReps,
            [exerciseId]: Math.max(
              1,
              (state.inputReps[exerciseId] ?? 1) + delta
            ),
          },
        })),

      setWeight: (exerciseId, value) =>
        set((state) => ({
          inputWeightKg: {
            ...state.inputWeightKg,
            [exerciseId]: Math.max(0, Math.round(value * 10) / 10),
          },
        })),

      setReps: (exerciseId, value) =>
        set((state) => ({
          inputReps: {
            ...state.inputReps,
            [exerciseId]: Math.max(1, Math.floor(value)),
          },
        })),

      setRpe: (exerciseId, value) =>
        set((state) => ({
          inputRpe: { ...state.inputRpe, [exerciseId]: value },
        })),

      nextExercise: () =>
        set((state) => ({
          currentExIdx: Math.min(
            state.currentExIdx + 1,
            state.exercises.length - 1
          ),
          restActive: false,
        })),

      prevExercise: () =>
        set((state) => ({
          currentExIdx: Math.max(state.currentExIdx - 1, 0),
          restActive: false,
        })),

      startRest: (durationSecs, info) =>
        set({
          restActive: true,
          restStartedAt: Date.now(),
          restDurationSecs: durationSecs,
          lastLoggedSetInfo: info,
        }),

      skipRest: () => set({ restActive: false, restStartedAt: null }),

      // Adjust the *duration* (not startedAt) so remaining time changes correctly
      adjustRestDuration: (deltaSecs) =>
        set((state) => ({
          restDurationSecs: Math.max(10, state.restDurationSecs + deltaSecs),
        })),

      setFatigue: (level) => set({ fatigueLevel: level }),
      setSleepHours: (hours) => set({ sleepHours: hours }),

      markFinished: () => set({ status: "finished", restActive: false }),

      resetSession: () =>
        set({
          sessionId: null,
          workoutId: null,
          workoutName: "",
          startedAt: null,
          status: "idle",
          exercises: [],
          currentExIdx: 0,
          loggedSets: {},
          inputWeightKg: {},
          inputReps: {},
          inputRpe: {},
          restActive: false,
          restStartedAt: null,
          lastLoggedSetInfo: null,
          fatigueLevel: 3,
          sleepHours: null,
        }),
    }),
    {
      name: "recompos-gym-v1",
      storage: createJSONStorage(() => {
        // Safe for SSR — falls back to a no-op storage on the server
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return localStorage
      }),
    }
  )
)
