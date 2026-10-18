"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { groupIntoItems, itemStartIndices } from "@/lib/superset"
import type { ProgressionSuggestion } from "@/lib/training"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface LoggedSet {
  tempId: string        // client-assigned, used for optimistic updates
  // Idempotency key sent with every POST of this set (first try, retries and
  // the offline queue) — the server upserts on it, so a retry never duplicates.
  clientId?: string
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
  topSetReps?: number       // reps performed WITH the top-set weight
  topDurationSecs?: number  // best hold time (duration exercises)
  totalVolume: number
}

/** Last session's top set — a real performed (weight, reps) pair. */
export interface ExerciseBaseline {
  weightKg: number
  reps: number | null  // null when no history yet
  durationSecs?: number | null  // anchor for duration exercises
}

export type { ProgressionSuggestion }

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
  // Double-progression suggestion (null for AMRAP / no history)
  progression?: ProgressionSuggestion | null
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
    clientId?:     string
  }
}

export type SetPayload = SyncQueueItem["payload"]

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
  fatigueLevel: number | null   // 1–5, only when the user explicitly rates it
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
    setData: Omit<LoggedSet, "tempId" | "loggedAt" | "clientId">
  ) => string  // returns tempId
  // Optimistically records a set AND persists it (tracked, idempotent POST;
  // queued for retry on failure). Returns the tempId.
  recordSet: (setData: Omit<SetPayload, "clientId">) => string
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
  setFatigue: (level: number | null) => void
  setSleepHours: (hours: number | null) => void
  markFinished: () => void
  resetSession: () => void
  addPendingSync: (item: SyncQueueItem) => void
  // Serialized: concurrent calls chain onto the running flush.
  flushPendingSync: () => Promise<void>
  // Awaits every in-flight set POST, then flushes the queue. Resolves with
  // the number of sets still pending (offline) afterwards.
  drainSync: () => Promise<number>
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Parse the lower bound of a rep range string, e.g. "8-12" → 8, "5" → 5 */
export function parseDefaultReps(targetReps: string): number {
  const match = targetReps.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 8
}

/** Unique id per logged set — doubles as the server idempotency key. */
function newClientId(): string {
  // randomUUID needs a secure context (https / localhost) — fall back otherwise
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

type PostResult = { ok: true; id: string } | { ok: false; retry: boolean }

/** One set POST. A 4xx (other than 401/403/408/429) means the server will
 *  never accept it, so it must not sit in the retry queue forever. 401/403
 *  are retryable: an expired login must not discard sets — they sync once
 *  the user signs in again. */
async function postSet(sessionId: string, payload: SetPayload): Promise<PostResult> {
  try {
    const res = await fetch(`/api/gym/sessions/${sessionId}/sets`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })
    if (res.ok) {
      const { id } = await res.json()
      return { ok: true, id }
    }
    const retry =
      res.status >= 500 || [401, 403, 408, 429].includes(res.status)
    if (!retry) console.warn("[gym] set rejected by server", res.status, payload)
    return { ok: false, retry }
  } catch {
    return { ok: false, retry: true }
  }
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useGymStore = create<GymState>()(
  persist(
    (set, get) => {
      // In-flight first-attempt POSTs. Every set is ALSO queued in the
      // persisted pendingSync BEFORE its first POST, so a reload mid-request
      // can't lose it (the server dedupes the retry on clientId).
      const inFlight = new Set<Promise<void>>()
      // Tail of the serialized flush chain.
      let flushChain: Promise<void> = Promise.resolve()

      const removeQueued = (tempId: string) =>
        set((state) => ({ pendingSync: state.pendingSync.filter((p) => p.tempId !== tempId) }))

      // Works through a snapshot of the queue, removing ONLY the items that
      // succeeded (or were permanently rejected) — items added meanwhile are
      // untouched and picked up by the next flush.
      const runFlush = async () => {
        const items = get().pendingSync
        for (const item of items) {
          // Back-compat: items queued before clientIds existed get one now
          // (stable from here on, since it's written back into the queue).
          let payload = item.payload
          if (!payload.clientId) {
            payload = { ...payload, clientId: item.tempId }
            set((state) => ({
              pendingSync: state.pendingSync.map((p) => (p.tempId === item.tempId ? { ...p, payload } : p)),
            }))
          }
          const result = await postSet(item.sessionId, payload)
          if (result.ok) {
            get().updateSetServerId(item.tempId, result.id)
            removeQueued(item.tempId)
          } else if (!result.retry) {
            removeQueued(item.tempId)
          }
        }
      }

      return {
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
      fatigueLevel: null,
      sleepHours: null,
      pendingSync: [],

      // ── Actions ────────────────────────────────────────────
      startSession: ({ sessionId, workoutId, workoutName, exercises }) => {
        const inputWeightKg: Record<string, number> = {}
        const inputReps: Record<string, number> = {}
        const inputRpe: Record<string, number> = {}
        const inputDurationSecs: Record<string, number> = {}

        for (const ex of exercises) {
          // Prefer the double-progression suggestion (next target), then the
          // last real top set (baseline), then previous top weight, then 0.
          const prog = ex.progression
          inputWeightKg[ex.exerciseId] =
            prog?.suggestedWeightKg ?? ex.baseline?.weightKg ?? ex.previousPerformance?.topSetWeightKg ?? 0
          // `||` (not ??) so duration sets whose history has reps 0 fall
          // through to the target parse (e.g. "8-12" → 8).
          inputReps[ex.exerciseId] =
            prog?.suggestedReps || ex.baseline?.reps || parseDefaultReps(ex.targetReps)
          inputRpe[ex.exerciseId] = 7
          // Duration anchor: suggested / best previous hold, else lower bound
          // of the seconds target (e.g. "30-60" → 30)
          inputDurationSecs[ex.exerciseId] =
            prog?.suggestedDurationSecs || ex.baseline?.durationSecs || parseDefaultReps(ex.targetReps)
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
          fatigueLevel: null,
          sleepHours: null,
        })
      },

      logSet: (setData) => {
        const tempId = newClientId()
        const newSet: LoggedSet = { ...setData, tempId, clientId: tempId, loggedAt: Date.now() }

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

      recordSet: (setData) => {
        const sessionId = get().sessionId
        const tempId = get().logSet(setData)
        if (!sessionId) return tempId
        const payload: SetPayload = { ...setData, clientId: tempId }
        get().addPendingSync({ sessionId, tempId, payload })
        const p = (async () => {
          const result = await postSet(sessionId, payload)
          if (result.ok) {
            get().updateSetServerId(tempId, result.id)
            removeQueued(tempId)
          } else if (!result.retry) {
            removeQueued(tempId)
          }
        })()
        inFlight.add(p)
        void p.finally(() => inFlight.delete(p))
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
        set((state) =>
          state.pendingSync.some((p) => p.tempId === item.tempId)
            ? {}
            : { pendingSync: [...state.pendingSync, item] }
        ),

      flushPendingSync: () => {
        flushChain = flushChain.then(runFlush, runFlush)
        return flushChain
      },

      drainSync: async () => {
        await Promise.allSettled([...inFlight])
        await get().flushPendingSync()
        return get().pendingSync.length
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
          fatigueLevel: null,
          sleepHours: null,
        }),
      }
    },
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
