"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { groupIntoItems, itemStartIndices } from "@/lib/superset"

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
  durationSecs?: number // populated for static holds (plank, wall-sit, etc.)
  loggedAt: number      // Date.now() timestamp — survives serialisation
}

export type TrackingType = "weight_reps" | "reps_only" | "duration"

export interface PreviousPerformance {
  sessionDate: string   // "Apr 10"
  sets: { reps: number; weightKg: number; rpe?: number; durationSecs?: number }[]
  topSetWeightKg: number
  topDurationSecs?: number  // best hold time (duration exercises)
  totalVolume: number
}

export interface ExerciseBaseline {
  weightKg: number
  reps: number | null  // null when no history yet
  durationSecs?: number | null  // anchor for duration exercises
  // true = last 2 sessions matched → athlete consolidated, consider increasing
  // false = most-recent session used as anchor (athlete still adapting)
  isConfirmed: boolean
}

export interface SessionExercise {
  workoutExerciseId: string
  exerciseId: string
  name: string
  primaryMuscle: string
  equipment: string    // "barbell" | "bodyweight" | "household" | ...
  trackingType?: TrackingType  // optional for backwards-compat with persisted sessions
  order: number
  targetSets: number
  targetReps: string   // "8-12" | "5" | "AMRAP" | seconds range for duration
  restSeconds: number
  notes?: string
  // Exercises sharing the same superSetId are performed back-to-back as one
  // unified round (see src/lib/superset.ts) — sets stay logged independently.
  superSetId?: string
  previousPerformance: PreviousPerformance | null
  baseline: ExerciseBaseline | null
}

export interface LastLoggedSetInfo {
  exerciseName: string
  weightKg: number
  reps: number
  setNumber: number
  isWarmup: boolean
  durationSecs?: number  // set when the logged set was a timed hold
}

type GymStatus = "idle" | "active" | "finished"

export interface SyncQueueItem {
  sessionId: string
  tempId:    string
  payload: {
    exerciseId:    string
    setNumber:     number
    reps:          number
    weightKg:      number
    rpe:           number
    isWarmup:      boolean
    durationSecs?: number
  }
}

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
  inputDurationSecs: Record<string, number>  // duration-tracked exercises

  // ── Rest timer ─────────────────────────────────────────────
  restActive: boolean
  restStartedAt: number | null  // Date.now() when rest started
  restDurationSecs: number      // total duration for current rest
  lastLoggedSetInfo: LastLoggedSetInfo | null

  // ── Finish ─────────────────────────────────────────────────
  fatigueLevel: number          // 1–5
  sleepHours: number | null     // hours slept before session

  // ── Offline sync queue ─────────────────────────────────────
  pendingSync: SyncQueueItem[]  // sets that failed to POST, persisted for retry

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
  adjustDuration: (exerciseId: string, delta: number) => void
  setDuration: (exerciseId: string, value: number) => void
  // Moves the whole item (single exercise, or super-set pair) starting at
  // `startIndex` one slot earlier/later, keeping super-set pairs adjacent.
  moveItemAt: (startIndex: number, direction: -1 | 1) => void
  nextExercise: () => void
  prevExercise: () => void
  startRest: (durationSecs: number, info: LastLoggedSetInfo) => void
  skipRest: () => void
  adjustRestDuration: (deltaSecs: number) => void
  setFatigue: (level: number) => void
  setSleepHours: (hours: number | null) => void
  markFinished: () => void
  resetSession: () => void
  addPendingSync: (item: SyncQueueItem) => void
  flushPendingSync: () => Promise<void>
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
      inputDurationSecs: {},
      restActive: false,
      restStartedAt: null,
      restDurationSecs: 90,
      lastLoggedSetInfo: null,
      fatigueLevel: 3,
      sleepHours: null,
      pendingSync: [],

      // ── Actions ────────────────────────────────────────────
      startSession: ({ sessionId, workoutId, workoutName, exercises }) => {
        const inputWeightKg: Record<string, number> = {}
        const inputReps: Record<string, number> = {}
        const inputRpe: Record<string, number> = {}
        const inputDurationSecs: Record<string, number> = {}

        for (const ex of exercises) {
          // Prefer the server-computed baseline (driven by last-2-session comparison).
          // Fall back to previous-performance top set, then 0.
          inputWeightKg[ex.exerciseId] =
            ex.baseline?.weightKg ?? ex.previousPerformance?.topSetWeightKg ?? 0
          // Use the baseline's confirmed reps when available, otherwise parse the
          // target rep string (e.g. "8-12" → 8). `||` (not ??) so duration sets
          // whose history has reps 0 fall through to the target parse.
          inputReps[ex.exerciseId] =
            ex.baseline?.reps || parseDefaultReps(ex.targetReps)
          inputRpe[ex.exerciseId] = 7
          // Duration anchor: best previous hold, else lower bound of the
          // seconds target (e.g. "30-60" → 30)
          inputDurationSecs[ex.exerciseId] =
            ex.baseline?.durationSecs || parseDefaultReps(ex.targetReps)
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
          inputDurationSecs,
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

      adjustDuration: (exerciseId, delta) =>
        set((state) => ({
          inputDurationSecs: {
            ...state.inputDurationSecs,
            [exerciseId]: Math.max(
              5,
              (state.inputDurationSecs[exerciseId] ?? 30) + delta
            ),
          },
        })),

      setDuration: (exerciseId, value) =>
        set((state) => ({
          inputDurationSecs: {
            ...state.inputDurationSecs,
            [exerciseId]: Math.max(5, Math.floor(value)),
          },
        })),

      moveItemAt: (startIndex, direction) =>
        set((state) => {
          const items = groupIntoItems(state.exercises)
          const starts = itemStartIndices(state.exercises)
          const pos = starts.indexOf(startIndex)
          if (pos === -1) return {}
          const swapPos = pos + direction
          if (swapPos < 0 || swapPos >= items.length) return {}

          // Track the active item by its first exercise's id, so it stays
          // "current" even when a different item is the one being moved.
          const activeExerciseId = state.exercises[state.currentExIdx]?.exerciseId

          const newItems = [...items]
          ;[newItems[pos], newItems[swapPos]] = [newItems[swapPos], newItems[pos]]
          const newExercises = newItems.flatMap((it) =>
            it.type === "superset" ? it.exercises : [it.exercise]
          )

          const newCurrentIdx = activeExerciseId
            ? newExercises.findIndex((e) => e.exerciseId === activeExerciseId)
            : state.currentExIdx

          return {
            exercises: newExercises,
            currentExIdx: newCurrentIdx >= 0 ? newCurrentIdx : state.currentExIdx,
          }
        }),

      nextExercise: () =>
        set((state) => {
          const starts = itemStartIndices(state.exercises)
          const pos = starts.indexOf(state.currentExIdx)
          const nextStart = pos >= 0 ? starts[pos + 1] : undefined
          return {
            currentExIdx: nextStart ?? state.currentExIdx,
            restActive: false,
          }
        }),

      prevExercise: () =>
        set((state) => {
          const starts = itemStartIndices(state.exercises)
          const pos = starts.indexOf(state.currentExIdx)
          const prevStart = pos > 0 ? starts[pos - 1] : starts[0] ?? 0
          return {
            currentExIdx: prevStart,
            restActive: false,
          }
        }),

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

      addPendingSync: (item) =>
        set((state) => ({ pendingSync: [...state.pendingSync, item] })),

      flushPendingSync: async () => {
        const { pendingSync, updateSetServerId } = get()
        if (pendingSync.length === 0) return
        const failed: SyncQueueItem[] = []
        for (const item of pendingSync) {
          try {
            const res = await fetch(`/api/gym/sessions/${item.sessionId}/sets`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify(item.payload),
            })
            if (res.ok) {
              const { id } = await res.json()
              updateSetServerId(item.tempId, id)
            } else {
              failed.push(item)
            }
          } catch {
            failed.push(item)
          }
        }
        set({ pendingSync: failed })
      },

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
          inputDurationSecs: {},
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
