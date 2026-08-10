"use client"

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react"
import {
  Play,
  Pause,
  Trophy,
  CheckCircle2,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  Clock,
  Flame,
  Minus,
  Plus,
  Info,
  Timer,
  RotateCcw,
} from "lucide-react"
import { useGymStore, type SessionExercise, type LoggedSet } from "@/store/gymStore"
import RestTimerOverlay from "@/components/gym/RestTimerOverlay"
import FinishModal from "@/components/gym/FinishModal"
import { cn } from "@/lib/utils"
import { groupIntoItems, itemStartIndices } from "@/lib/superset"

// ─────────────────────────────────────────────────────────────
// Hooks / עזרים
// ─────────────────────────────────────────────────────────────

function useElapsedTime(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const tick = () =>
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

type SetPayload = {
  exerciseId: string
  setNumber: number
  reps: number
  weightKg: number
  rpe: number
  isWarmup: boolean
  durationSecs?: number
}

/** POSTs one logged set and reconciles the optimistic tempId with the server id
 *  (or queues it for retry) — shared by single-exercise and super-set logging. */
async function postLoggedSet(
  sessionId: string,
  tempId: string,
  setData: SetPayload,
  updateSetServerId: (tempId: string, serverId: string) => void,
  addPendingSync: (item: { sessionId: string; tempId: string; payload: SetPayload }) => void,
) {
  try {
    const res = await fetch(`/api/gym/sessions/${sessionId}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setData),
    })
    if (res.ok) {
      const { id } = await res.json()
      updateSetServerId(tempId, id)
    } else {
      addPendingSync({ sessionId, tempId, payload: setData })
    }
  } catch {
    addPendingSync({ sessionId, tempId, payload: setData })
  }
}

/** Derived per-exercise runtime numbers (logged sets, current input values) —
 *  used for both the single-exercise view and each half of a super-set pair. */
function exerciseRuntime(
  ex: SessionExercise,
  loggedSets: Record<string, LoggedSet[]>,
  inputWeightKg: Record<string, number>,
  inputReps: Record<string, number>,
  inputRpe: Record<string, number>,
  inputDurationSecs: Record<string, number>,
) {
  const allSets = loggedSets[ex.exerciseId] ?? []
  const workingSets = allSets.filter((s) => !s.isWarmup)
  const warmupSets = allSets.filter((s) => s.isWarmup)
  const setsCompleted = workingSets.length
  return {
    workingSets,
    warmupSets,
    setsCompleted,
    allSetsComplete: setsCompleted >= ex.targetSets,
    weight: inputWeightKg[ex.exerciseId] ?? 0,
    reps: inputReps[ex.exerciseId] ?? 8,
    rpe: inputRpe[ex.exerciseId] ?? 7,
    duration: inputDurationSecs[ex.exerciseId] ?? 30,
    isDuration: ex.trackingType === "duration",
  }
}

// ─────────────────────────────────────────────────────────────
// StepperInput — קלט ידידותי למגע
// ─────────────────────────────────────────────────────────────

function StepperInput({
  label,
  value,
  onAdjust,
  onSet,
  step,
  min,
  isDecimal,
  compact,
}: {
  label: string
  value: number
  onAdjust: (delta: number) => void
  onSet: (value: number) => void
  step: number
  min: number
  isDecimal?: boolean
  // Smaller footprint for side-by-side super-set columns on mobile widths.
  compact?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const openEdit = () => {
    setInputVal(isDecimal ? value.toFixed(1) : String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 40)
  }

  const commitEdit = () => {
    const parsed = parseFloat(inputVal)
    if (!isNaN(parsed)) onSet(Math.max(min, parsed))
    setEditing(false)
  }

  // Handles +/- button presses:
  // · e.preventDefault() stops the browser from moving focus away from any
  //   currently-focused element, so the first tap always fires immediately.
  // · If the centre value is in edit mode we commit whatever the user typed
  //   first, then apply the delta — prevents commitEdit(onBlur) from
  //   overwriting the adjusted value.
  const handleAdjust = (e: React.PointerEvent, delta: number) => {
    e.preventDefault()
    if (editing) {
      const parsed = parseFloat(inputVal)
      if (!isNaN(parsed)) onSet(Math.max(min, parsed))
      setEditing(false)
    }
    onAdjust(delta)
  }

  return (
    <div className={cn("flex-1 bg-slate-900 rounded-2xl flex flex-col gap-2.5", compact ? "p-2" : "p-3")}>
      <p className={cn(
        "text-slate-500 font-semibold uppercase tracking-wider px-1 truncate",
        compact ? "text-[9px]" : "text-[11px]"
      )}>
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onPointerDown={(e) => handleAdjust(e, -step)}
          className={cn(
            "rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 flex items-center justify-center shrink-0 transition-colors select-none",
            compact ? "w-9 h-9" : "w-12 h-12"
          )}
        >
          <Minus size={compact ? 15 : 20} className="text-slate-300" strokeWidth={2.5} />
        </button>

        <button
          onClick={openEdit}
          className={cn(
            "flex-1 flex items-center justify-center rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/60 focus-within:border-indigo-500 transition-colors overflow-hidden",
            compact ? "h-9" : "h-12"
          )}
        >
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              inputMode={isDecimal ? "decimal" : "numeric"}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.stopPropagation(); commitEdit() }
                if (e.key === "Escape") setEditing(false)
              }}
              className={cn(
                "w-full text-center font-black bg-transparent focus:outline-none px-1",
                compact ? "text-base" : "text-xl"
              )}
            />
          ) : (
            <span className={cn("font-black tabular-nums select-none", compact ? "text-base" : "text-xl")}>
              {isDecimal ? value.toFixed(1) : value}
            </span>
          )}
        </button>

        <button
          onPointerDown={(e) => handleAdjust(e, step)}
          className={cn(
            "rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 flex items-center justify-center shrink-0 transition-colors select-none",
            compact ? "w-9 h-9" : "w-12 h-12"
          )}
        >
          <Plus size={compact ? 15 : 20} className="text-slate-300" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ExerciseTimer — שעון עצר לתרגילים סטטיים (פלאנק וכו')
// ─────────────────────────────────────────────────────────────

function ExerciseTimer({ onLogTime }: { onLogTime?: (secs: number) => void }) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = () => {
    if (running) return
    setRunning(true)
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
  }

  const pause = () => {
    if (!running) return
    setRunning(false)
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }

  const reset = () => {
    pause()
    setElapsed(0)
    setRunning(false)
  }

  const logTime = () => {
    if (elapsed === 0) return
    pause()
    onLogTime?.(elapsed)
    // Reset after logging so the timer is ready for the next hold
    setElapsed(0)
    setRunning(false)
  }

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3">
      <Timer size={14} className="text-teal-400 shrink-0" />
      <span className="font-mono text-lg font-black tabular-nums text-teal-300 w-14 select-none">
        {formatElapsed(elapsed)}
      </span>
      <p className="text-[11px] text-slate-600 flex-1">טיימר תרגיל</p>
      <div className="flex gap-1.5">
        {elapsed > 0 && onLogTime && (
          <button
            onClick={logTime}
            className="h-8 px-2.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-indigo-100 text-[11px] font-semibold flex items-center gap-1 transition-colors"
            aria-label="שמור זמן"
          >
            <CheckCircle2 size={11} /> שמור
          </button>
        )}
        <button
          onClick={running ? pause : start}
          className="w-8 h-8 rounded-lg bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 flex items-center justify-center transition-colors"
          aria-label={running ? "השהה" : "התחל"}
        >
          {running
            ? <Pause size={13} />
            : <Play size={13} fill="currentColor" />}
        </button>
        <button
          onClick={reset}
          disabled={elapsed === 0 && !running}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition-colors disabled:opacity-30"
          aria-label="אפס"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// צבעי קבוצות שרירים
// ─────────────────────────────────────────────────────────────

const MG_COLORS: Record<string, string> = {
  chest:      "bg-red-500/20 text-red-300",
  back:       "bg-blue-500/20 text-blue-300",
  shoulders:  "bg-purple-500/20 text-purple-300",
  biceps:     "bg-green-500/20 text-green-300",
  triceps:    "bg-yellow-500/20 text-yellow-300",
  legs:       "bg-orange-500/20 text-orange-300",
  quads:      "bg-orange-500/20 text-orange-300",
  hamstrings: "bg-amber-500/20 text-amber-300",
  glutes:     "bg-pink-500/20 text-pink-300",
  calves:     "bg-teal-500/20 text-teal-300",
  core:       "bg-indigo-500/20 text-indigo-300",
}

const MG_HE: Record<string, string> = {
  chest:      "חזה",
  back:       "גב",
  shoulders:  "כתפיים",
  biceps:     "בייספס",
  triceps:    "טרייספס",
  legs:       "רגליים",
  quads:      "קוואדס",
  hamstrings: "ירכיים",
  glutes:     "ישבן",
  calves:     "שוקיים",
  core:       "בטן",
}

const EQUIPMENT_HE: Record<string, string> = {
  barbell:    "מוט",
  dumbbell:   "משקוליות",
  cable:      "כבל",
  machine:    "מכונה",
  bodyweight: "משקל גוף",
  kettlebell: "קטלבל",
  household:  "אביזר ביתי",
}

// ─────────────────────────────────────────────────────────────
// עמוד ראשי — ניתוב בין מצבים
// ─────────────────────────────────────────────────────────────

export default function GymPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const status     = useGymStore((s) => s.status)
  const restActive = useGymStore((s) => s.restActive)

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (status === "finished") return <FinishModal />
  if (status === "idle") return <WorkoutPicker />

  return (
    <>
      {restActive && <RestTimerOverlay />}
      <ActiveSession />
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// WorkoutPicker — בחירת אימון
// ─────────────────────────────────────────────────────────────

interface WorkoutOption {
  id: string
  name: string
  dayLabel: string
  environment?: "gym" | "home"
  muscleGroups: string[]
  exerciseCount: number
  lastSession: { date: string; durationMins: number | null } | null
}

function WorkoutPicker() {
  const [workouts, setWorkouts] = useState<WorkoutOption[] | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)
  // Environment toggle — persisted so the app opens where you train
  const [environment, setEnvironment] = useState<"gym" | "home">("gym")

  const { startSession } = useGymStore()

  useEffect(() => {
    const saved = localStorage.getItem("workout-environment")
    if (saved === "home" || saved === "gym") setEnvironment(saved)
    fetch("/api/gym/workouts")
      .then((r) => r.json())
      .then((data) => {
        setWorkouts(data.workouts ?? [])
        setPlanName(data.planName ?? null)
      })
      .catch(() => {
        setWorkouts([])
        setFetchError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSetEnvironment = (env: "gym" | "home") => {
    localStorage.setItem("workout-environment", env)
    setEnvironment(env)
  }

  // Legacy workouts predate the environment column and default to "gym"
  const visibleWorkouts = workouts?.filter(
    (w) => (w.environment ?? "gym") === environment,
  )

  const handleStart = async (workoutId: string, workoutName: string) => {
    setStarting(workoutId)
    try {
      const res = await fetch("/api/gym/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId }),
      })
      const { sessionId, exercises } = await res.json()
      startSession({ sessionId, workoutId, workoutName, exercises })
    } catch (err) {
      console.error("Failed to start session:", err)
      setStarting(null)
    }
  }

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Dumbbell size={22} className="text-indigo-400" />
          {environment === "gym" ? "מצב חדר כושר" : "מצב אימון ביתי"}
        </h1>
        {planName && (
          <p className="text-sm text-slate-400 mt-0.5">{planName}</p>
        )}
      </div>

      {/* ── Toggle: חדר כושר / אימון ביתי ──────────────────── */}
      <div className="flex items-center gap-2 bg-slate-900/60 rounded-2xl p-1.5" dir="rtl">
        <button
          onClick={() => handleSetEnvironment("gym")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            environment === "gym"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
              : "text-slate-400 hover:text-slate-200",
          )}
        >
          <span>🏋️</span> חדר כושר
        </button>
        <button
          onClick={() => handleSetEnvironment("home")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            environment === "home"
              ? "bg-teal-600 text-white shadow-lg shadow-teal-500/25"
              : "text-slate-400 hover:text-slate-200",
          )}
        >
          <span>🏡</span> אימון ביתי
        </button>
      </div>
      {environment === "home" && (
        <p className="text-[11px] text-slate-500 text-center -mt-3" dir="rtl">
          מעקב ביתי נפרד לחלוטין — לא משפיע על היסטוריית חדר הכושר
        </p>
      )}

      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 flex items-center gap-2 text-sm text-red-400">
          <Info size={16} /> לא ניתן לטעון אימונים. בדוק את החיבור שלך.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 bg-slate-900 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : visibleWorkouts?.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl p-6 text-center">
          <p className="text-slate-400">
            {environment === "home"
              ? "לא נמצאו אימונים ביתיים."
              : "לא נמצאו תוכניות אימון."}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            צור תוכנית תחילה בלשונית האימונים.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleWorkouts?.map((w) => (
            <div
              key={w.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
            >
              <div>
                <h3 className="font-bold text-xl leading-tight">{w.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {w.exerciseCount} תרגילים
                  {w.lastSession ? (
                    <>
                      {" · "}אחרון:{" "}
                      <span className="text-slate-400">{w.lastSession.date}</span>
                      {w.lastSession.durationMins != null && (
                        <span className="text-slate-600">
                          {" "}({w.lastSession.durationMins} דקות)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-400"> · אימון ראשון!</span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {w.muscleGroups.map((m) => (
                  <span
                    key={m}
                    className={cn(
                      "text-[11px] font-medium px-2 py-0.5 rounded-full",
                      MG_COLORS[m] ?? "bg-slate-700 text-slate-300"
                    )}
                  >
                    {MG_HE[m] ?? m}
                  </span>
                ))}
              </div>

              <button
                onClick={() => handleStart(w.id, w.name)}
                disabled={starting != null}
                className={cn(
                  "w-full rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors",
                  starting === w.id
                    ? "bg-indigo-700 opacity-70 cursor-wait"
                    : starting != null
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700"
                )}
              >
                {starting === w.id ? (
                  <>
                    <span className="animate-spin inline-block">◌</span>
                    טוען...
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" /> התחל {w.name}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ActiveSession — ממשק האימון החי
// ─────────────────────────────────────────────────────────────

const WEIGHT_STEP = 2.5

function ActiveSession() {
  // Granular selectors — each hook only re-renders this component when its
  // own slice changes.  Critically, rest-timer ticks (restActive/restStartedAt)
  // are NOT selected here, so the active session view stays still during rests.
  const sessionId      = useGymStore((s) => s.sessionId)
  const workoutName    = useGymStore((s) => s.workoutName)
  const exercises      = useGymStore((s) => s.exercises)
  const currentExIdx   = useGymStore((s) => s.currentExIdx)
  const loggedSets     = useGymStore((s) => s.loggedSets)
  const inputWeightKg      = useGymStore((s) => s.inputWeightKg)
  const inputReps          = useGymStore((s) => s.inputReps)
  const inputRpe           = useGymStore((s) => s.inputRpe)
  const inputDurationSecs  = useGymStore((s) => s.inputDurationSecs)
  const startedAt      = useGymStore((s) => s.startedAt)
  // Actions are stable references — selecting them individually never triggers re-renders
  const logSet             = useGymStore((s) => s.logSet)
  const updateSetServerId  = useGymStore((s) => s.updateSetServerId)
  const adjustWeight       = useGymStore((s) => s.adjustWeight)
  const adjustReps         = useGymStore((s) => s.adjustReps)
  const setWeight          = useGymStore((s) => s.setWeight)
  const setReps            = useGymStore((s) => s.setReps)
  const setRpe             = useGymStore((s) => s.setRpe)
  const adjustDuration     = useGymStore((s) => s.adjustDuration)
  const setDuration        = useGymStore((s) => s.setDuration)
  const moveItemAt         = useGymStore((s) => s.moveItemAt)
  const nextExercise       = useGymStore((s) => s.nextExercise)
  const prevExercise       = useGymStore((s) => s.prevExercise)
  const startRest          = useGymStore((s) => s.startRest)
  const markFinished       = useGymStore((s) => s.markFinished)
  const addPendingSync     = useGymStore((s) => s.addPendingSync)
  const flushPendingSync   = useGymStore((s) => s.flushPendingSync)

  const [isWarmup, setIsWarmup] = useState(false)
  const [showRpe, setShowRpe] = useState(false)

  const elapsed = useElapsedTime(startedAt)

  // Flush any offline-queued sets when the session first becomes active
  useEffect(() => { void flushPendingSync() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap markFinished to drain the sync queue first
  const handleFinish = useCallback(async () => {
    await flushPendingSync()
    markFinished()
  }, [flushPendingSync, markFinished])

  // Items group adjacent super-set pairs into one unit; currentExIdx always
  // lands on an item's first exercise (see moveItemAt/nextExercise/prevExercise
  // in the store), so `items[currentItemPos]` is always the active item.
  const items = useMemo(() => groupIntoItems(exercises), [exercises])
  const starts = useMemo(() => itemStartIndices(exercises), [exercises])
  const currentItemPos = starts.indexOf(currentExIdx)
  const currentItem = items[currentItemPos]
  const totalItems = items.length

  // Computed unconditionally (before the early return below) so hook order
  // stays stable across renders — mirrors items/starts above.
  const activeExercises: SessionExercise[] = useMemo(
    () => (!currentItem ? [] : currentItem.type === "superset" ? currentItem.exercises : [currentItem.exercise]),
    [currentItem]
  )
  const runtimes = useMemo(
    () => activeExercises.map((ex) =>
      exerciseRuntime(ex, loggedSets, inputWeightKg, inputReps, inputRpe, inputDurationSecs)
    ),
    [activeExercises, loggedSets, inputWeightKg, inputReps, inputRpe, inputDurationSecs]
  )

  if (!currentItem) return null

  const isSuperSet = currentItem.type === "superset"

  // The single-exercise view below reads `currentEx`/`weight`/`reps`/etc. as
  // the "first (and possibly only) exercise of the current item" — for a
  // single item this is exactly the old single-exercise behaviour unchanged.
  const currentEx = activeExercises[0]
  const warmupSets = runtimes[0].warmupSets
  const setsCompleted = runtimes[0].setsCompleted
  // Complete once every active exercise (both halves of a pair, or the one
  // single exercise) has reached its own target set count.
  const allSetsComplete = runtimes.every((r) => r.allSetsComplete)

  const weight   = runtimes[0].weight
  const reps     = runtimes[0].reps
  const rpe      = runtimes[0].rpe
  const duration = runtimes[0].duration

  // Tracking mode — duration exercises (wall sit, plank taps) log seconds,
  // not weight×reps. reps_only (push-ups, pull-ups) keeps an optional
  // added-weight field defaulting to bodyweight (0).
  const isDuration = runtimes[0].isDuration

  // Average completion fraction across active exercises — drives the progress bar.
  const roundFraction =
    runtimes.reduce((sum, r, i) => sum + r.setsCompleted / activeExercises[i].targetSets, 0) /
    activeExercises.length

  // Whether every active exercise is at the same set count with the same
  // target — lets the log button show one clean "Set N of M" for the round.
  const roundInSync =
    !isSuperSet ||
    (runtimes.every((r) => r.setsCompleted === runtimes[0].setsCompleted) &&
      activeExercises.every((ex) => ex.targetSets === activeExercises[0].targetSets))

  // ── תיעוד סט (בודד או שני חלקי סופר-סט כאחד) ─────────────────────────────
  const handleLogRound = useCallback(async () => {
    if (!sessionId) return

    let maxRest = 0
    const loggedNames: string[] = []
    let displayInfo: { weightKg: number; reps: number; durationSecs?: number; setNumber: number } | null = null

    for (let i = 0; i < activeExercises.length; i++) {
      const ex = activeExercises[i]
      const rt = runtimes[i]
      // If one exercise of a pair already finished its target sets while its
      // partner hasn't, keep logging only the partner — never write past target.
      if (!isWarmup && rt.allSetsComplete) continue

      const setNumber = isWarmup ? rt.warmupSets.length + 1 : rt.workingSets.length + 1
      const setData: SetPayload = rt.isDuration
        ? { exerciseId: ex.exerciseId, setNumber, reps: 0, weightKg: 0, rpe: rt.rpe, isWarmup, durationSecs: rt.duration }
        : { exerciseId: ex.exerciseId, setNumber, reps: rt.reps, weightKg: rt.weight, rpe: rt.rpe, isWarmup }

      const tempId = logSet(setData)
      void postLoggedSet(sessionId, tempId, setData, updateSetServerId, addPendingSync)

      maxRest = Math.max(maxRest, ex.restSeconds)
      loggedNames.push(ex.name)
      if (!displayInfo) {
        displayInfo = {
          weightKg: rt.isDuration ? 0 : rt.weight,
          reps: rt.isDuration ? 0 : rt.reps,
          setNumber,
          ...(rt.isDuration && { durationSecs: rt.duration }),
        }
      }
    }

    if (!isWarmup && displayInfo && loggedNames.length > 0) {
      startRest(maxRest, {
        exerciseName: loggedNames.join(" 🔗 "),
        ...displayInfo,
        isWarmup: false,
      })
      setIsWarmup(false)
    }
  }, [
    sessionId,
    activeExercises,
    runtimes,
    isWarmup,
    logSet,
    startRest,
    updateSetServerId,
    addPendingSync,
  ])

  // ── תיעוד החזקה סטטית (פלאנק וכד') ──────────────────────────────────────────
  const handleLogHold = useCallback(async (durationSecs: number) => {
    if (!sessionId || !currentEx) return
    const allSetsForEx = loggedSets[currentEx.exerciseId] ?? []
    const setNumber    = allSetsForEx.filter((s) => !s.isWarmup).length + 1
    const setData      = {
      exerciseId: currentEx.exerciseId,
      setNumber,
      reps: 0,
      weightKg: 0,
      rpe,
      isWarmup: false,
      durationSecs,
    }
    const tempId = logSet(setData)
    startRest(currentEx.restSeconds, {
      exerciseName: currentEx.name,
      weightKg: 0,
      reps: 0,
      setNumber,
      isWarmup: false,
      durationSecs,
    })
    void postLoggedSet(sessionId, tempId, setData, updateSetServerId, addPendingSync)
  }, [sessionId, currentEx, rpe, loggedSets, logSet, startRest, updateSetServerId, addPendingSync])

  // Enter = תעד סט
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !allSetsComplete) handleLogRound()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleLogRound, allSetsComplete])

  return (
    <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

      {/* ── כותרת אימון ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 truncate max-w-[55%]">
          <span className="text-slate-400 font-medium">{workoutName}</span>
          {" · "}תרגיל {currentItemPos + 1}/{totalItems}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg">
            {formatElapsed(elapsed)}
          </span>
          <button
            onClick={handleFinish}
            className="text-xs text-slate-600 hover:text-red-400 transition-colors font-medium px-2"
          >
            סיים
          </button>
        </div>
      </div>

      {/* ── סרגל התקדמות ──────────────────────────────────────── */}
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{
            width: `${((currentItemPos + roundFraction) / totalItems) * 100}%`,
          }}
        />
      </div>

      {/* ── שם תרגיל (או זוג סופר-סט) ───────────────────────────── */}
      <div className="flex items-start gap-2.5">
        {/* סידור מחדש — מאפשר להזיז את הפריט הנוכחי (כולל הראשון) אם המכונה תפוסה */}
        <div className="flex flex-col gap-1 pt-1 shrink-0">
          <button
            onClick={() => moveItemAt(currentExIdx, -1)}
            disabled={currentItemPos === 0}
            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 flex items-center justify-center text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:pointer-events-none transition-colors"
            aria-label="הזז פריט זה למעלה"
            title="הזז למעלה"
          >
            <ArrowUp size={13} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => moveItemAt(currentExIdx, 1)}
            disabled={currentItemPos === totalItems - 1}
            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 flex items-center justify-center text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:pointer-events-none transition-colors"
            aria-label="הזז פריט זה למטה"
            title="הזז למטה — למשל אם המכונה תפוסה"
          >
            <ArrowDown size={13} strokeWidth={2.5} />
          </button>
        </div>

        {isSuperSet ? (
          <div className="flex-1 min-w-0">
            <h1 className="text-[1.6rem] font-black leading-tight tracking-tight">
              {activeExercises[0].name}
              <span className="text-indigo-400 mx-1.5">🔗</span>
              {activeExercises[1].name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5 bg-indigo-500/10 text-indigo-300 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                🔗 סופר-סט
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-slate-600" />
                {Math.max(activeExercises[0].restSeconds, activeExercises[1].restSeconds)} שנ' מנוחה משותפת
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <h1 className="text-[2rem] font-black leading-none tracking-tight">
              {currentEx.name}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
              <span className="font-medium text-slate-400">
                {currentEx.targetSets} × {currentEx.targetReps}
                {isDuration && " שנ'"}
              </span>
              <span className="text-slate-700">·</span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-slate-600" />
                {currentEx.restSeconds} שנ' מנוחה
              </span>
              <span className="text-slate-700">·</span>
              <span className="capitalize text-slate-600">
                {EQUIPMENT_HE[currentEx.equipment] ?? currentEx.equipment}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ╔══════════════════════════════════════════════════════╗
          ║  כרטיס ביצועים קודמים — הכי חשוב                    ║
          ╚══════════════════════════════════════════════════════╝ */}
      {isSuperSet ? (
        <div className="grid grid-cols-2 gap-2">
          {activeExercises.map((ex, i) => (
            <div
              key={ex.exerciseId}
              className={cn(
                "rounded-xl p-3",
                ex.previousPerformance
                  ? "bg-amber-950/40 border border-amber-500/40"
                  : "bg-slate-900 border border-slate-800"
              )}
            >
              <p className="text-[11px] font-bold text-slate-400 truncate mb-1.5">
                {ex.name}
              </p>
              {ex.previousPerformance ? (
                <div className="flex items-center gap-1.5">
                  <Trophy size={12} className="text-amber-400 shrink-0" strokeWidth={2.5} />
                  <span className="text-sm font-black text-amber-100">
                    {(ex.previousPerformance.topDurationSecs ?? 0) > 0
                      ? `${ex.previousPerformance.topDurationSecs} שנ'`
                      : ex.previousPerformance.topSetWeightKg > 0
                      ? `${ex.previousPerformance.topSetWeightKg}ק"ג`
                      : "BW"}
                  </span>
                  {ex.previousPerformance.sets[0] != null && (ex.previousPerformance.topDurationSecs ?? 0) === 0 && (
                    <span className="text-xs text-amber-400/80">
                      × {ex.previousPerformance.sets[0].reps}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Flame size={12} className="text-indigo-400 shrink-0" /> שיא ראשון
                </p>
              )}
              <p className="text-[11px] text-slate-600 mt-1">{runtimes[i].setsCompleted}/{ex.targetSets} סטים</p>
            </div>
          ))}
        </div>
      ) : currentEx.previousPerformance ? (
        <div className="bg-amber-950/40 border-2 border-amber-500/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy size={17} className="text-amber-400" strokeWidth={2.5} />
              <span className="text-sm font-bold text-amber-400 tracking-wide">
                קודם — {currentEx.previousPerformance.sessionDate}
              </span>
            </div>
            <span className="text-[11px] text-amber-700">
              {(currentEx.previousPerformance.topDurationSecs ?? 0) > 0
                ? `שיא: ${currentEx.previousPerformance.topDurationSecs} שנ'`
                : `${currentEx.previousPerformance.totalVolume.toLocaleString()} ק"ג סה"כ`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {currentEx.previousPerformance.sets.map((s, i) => (
              <div
                key={i}
                className="flex items-baseline gap-1 bg-amber-900/50 border border-amber-700/50 rounded-xl px-3 py-2"
              >
                <span className="text-[10px] text-amber-700 font-semibold me-0.5">
                  {i + 1}
                </span>
                {(s.durationSecs ?? 0) > 0 ? (
                  <span className="text-sm font-black text-amber-100">
                    {s.durationSecs} שנ'
                  </span>
                ) : (
                  <>
                    <span className="text-sm font-black text-amber-100">
                      {s.weightKg > 0 ? `${s.weightKg}ק"ג` : "BW"}
                    </span>
                    <span className="text-amber-700 text-xs mx-0.5">×</span>
                    <span className="text-sm font-black text-amber-100">
                      {s.reps}
                    </span>
                  </>
                )}
                {s.rpe != null && (
                  <span className="text-[10px] text-amber-700 ms-0.5">
                    @{s.rpe}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-amber-800/30" />
            <p className="text-[11px] text-amber-600 font-semibold">
              ↑ התאם או שפר מספרים אלה להתקדמות
            </p>
            <div className="h-px flex-1 bg-amber-800/30" />
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center gap-3">
          <Flame size={16} className="text-indigo-400 shrink-0" />
          <p className="text-sm text-slate-400">
            אין נתונים קודמים — כל משקל הוא שיא!
          </p>
        </div>
      )}

      {/* ── נקודות התקדמות סטים ─────────────────────────────── */}
      {isSuperSet ? (
        <div className="space-y-1.5">
          {activeExercises.map((ex, i) => (
            <div key={ex.exerciseId} className="flex items-center gap-2 px-1">
              <span className="text-[11px] text-slate-500 w-24 truncate shrink-0">{ex.name}</span>
              {runtimes[i].warmupSets.map((_, wi) => (
                <div
                  key={`w${wi}`}
                  className="w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-500 shrink-0"
                  title={`חימום ${wi + 1}`}
                />
              ))}
              {Array.from({ length: ex.targetSets }).map((_, si) => (
                <div
                  key={si}
                  className={cn(
                    "h-2.5 rounded-full transition-all duration-300 shrink-0",
                    si < runtimes[i].setsCompleted
                      ? "w-4 bg-indigo-500"
                      : si === runtimes[i].setsCompleted && !runtimes[i].allSetsComplete
                      ? "w-2.5 bg-slate-700 border-2 border-indigo-500 animate-pulse"
                      : "w-2.5 bg-slate-800"
                  )}
                />
              ))}
              <span className="text-xs text-slate-400 ms-1">
                {runtimes[i].setsCompleted}/{ex.targetSets}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] text-slate-500 me-1">סטים</span>
          {warmupSets.map((_, i) => (
            <div
              key={`w${i}`}
              className="w-3 h-3 rounded-full bg-slate-700 border border-slate-500 shrink-0"
              title={`חימום ${i + 1}`}
            />
          ))}
          {Array.from({ length: currentEx.targetSets }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-3 rounded-full transition-all duration-300 shrink-0",
                i < setsCompleted
                  ? "w-5 bg-indigo-500"
                  : i === setsCompleted && !allSetsComplete
                  ? "w-3 bg-slate-700 border-2 border-indigo-500 animate-pulse"
                  : "w-3 bg-slate-800"
              )}
            />
          ))}
          <span className="text-xs text-slate-400 ms-1">
            {setsCompleted}/{currentEx.targetSets}
            {warmupSets.length > 0 && (
              <span className="text-slate-600 ms-1">
                +{warmupSets.length}ח
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── תיעוד סט ─────────────────────────────────────────── */}
      {allSetsComplete ? (
        <div className="bg-green-950/30 border border-green-500/30 rounded-2xl p-5 flex flex-col items-center gap-2">
          <CheckCircle2 size={30} className="text-green-400" />
          <p className="font-bold text-green-400 text-lg">כל הסטים הושלמו!</p>
          <p className="text-xs text-slate-500">
            {currentItemPos < totalItems - 1
              ? `לחץ "תרגיל הבא" להמשך`
              : `לחץ "סיים אימון" כשמוכן`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* סט חימום ו-RPE */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => setIsWarmup((v) => !v)}
              className={cn(
                "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                isWarmup
                  ? "bg-slate-700 border-slate-500 text-slate-200"
                  : "bg-transparent border-slate-800 text-slate-500 hover:border-slate-600"
              )}
            >
              <span
                className={cn(
                  "w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0",
                  isWarmup
                    ? "bg-indigo-500 border-indigo-400"
                    : "border-slate-600"
                )}
              >
                {isWarmup && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path
                      d="M1 4l2 2 4-4"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </span>
              סט חימום
            </button>

            <button
              onClick={() => setShowRpe((v) => !v)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              RPE {showRpe ? "▴" : "▾"}
            </button>
          </div>

          {/* ── קלט לפי סוג מעקב ─────────────────────────────── */}
          {isSuperSet ? (
            /* שני התרגילים זה לצד זה — עמודה לכל תרגיל, קלט אחד משותף לתיעוד */
            <div className="grid grid-cols-2 gap-3">
              {activeExercises.map((ex, i) => {
                const rt = runtimes[i]
                return (
                  <div key={ex.exerciseId} className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-400 truncate px-1">
                      {ex.name}
                    </p>
                    {rt.isDuration ? (
                      <StepperInput
                        compact
                        label="שניות"
                        value={rt.duration}
                        onAdjust={(delta) => adjustDuration(ex.exerciseId, delta)}
                        onSet={(v) => setDuration(ex.exerciseId, v)}
                        step={5}
                        min={5}
                      />
                    ) : (
                      <div className="space-y-2">
                        <StepperInput
                          compact
                          label={
                            ex.trackingType === "reps_only" || ex.equipment === "bodyweight"
                              ? "משקל נוסף"
                              : "משקל (ק\"ג)"
                          }
                          value={rt.weight}
                          onAdjust={(delta) => adjustWeight(ex.exerciseId, delta)}
                          onSet={(v) => setWeight(ex.exerciseId, v)}
                          step={WEIGHT_STEP}
                          min={0}
                          isDecimal
                        />
                        <StepperInput
                          compact
                          label="חזרות"
                          value={rt.reps}
                          onAdjust={(delta) => adjustReps(ex.exerciseId, delta)}
                          onSet={(v) => setReps(ex.exerciseId, v)}
                          step={1}
                          min={1}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : isDuration ? (
            /* תרגיל איזומטרי — שניות × סטים במקום משקל × חזרות */
            <div className="flex gap-3">
              <StepperInput
                label="זמן החזקה (שניות)"
                value={duration}
                onAdjust={(delta) =>
                  adjustDuration(currentEx.exerciseId, delta)
                }
                onSet={(v) => setDuration(currentEx.exerciseId, v)}
                step={5}
                min={5}
              />
            </div>
          ) : (
            <div className="flex gap-3">
              <StepperInput
                label={
                  currentEx.trackingType === "reps_only" ||
                  currentEx.equipment === "bodyweight"
                    ? "משקל נוסף (ק\"ג)"
                    : "משקל (ק\"ג)"
                }
                value={weight}
                onAdjust={(delta) =>
                  adjustWeight(currentEx.exerciseId, delta)
                }
                onSet={(v) => setWeight(currentEx.exerciseId, v)}
                step={WEIGHT_STEP}
                min={0}
                isDecimal
              />
              <StepperInput
                label="חזרות"
                value={reps}
                onAdjust={(delta) =>
                  adjustReps(currentEx.exerciseId, delta)
                }
                onSet={(v) => setReps(currentEx.exerciseId, v)}
                step={1}
                min={1}
              />
            </div>
          )}

          {/* Previous performance hint near inputs (single-exercise view only —
              the super-set view already shows this in its mini cards above) */}
          {!isSuperSet && currentEx.previousPerformance && (
            <p className="text-[11px] text-amber-600/80 text-center -mt-1">
              פעם קודמת:{" "}
              {isDuration && (currentEx.previousPerformance.topDurationSecs ?? 0) > 0 ? (
                `${currentEx.previousPerformance.topDurationSecs} שניות החזקה`
              ) : (
                <>
                  {currentEx.previousPerformance.topSetWeightKg > 0
                    ? `${currentEx.previousPerformance.topSetWeightKg} ק"ג`
                    : "BW"}
                  {currentEx.previousPerformance.sets[0] != null &&
                    ` × ${currentEx.previousPerformance.sets[0].reps} חזרות`}
                </>
              )}
            </p>
          )}

          {/* RPE (מתקפל) — סט משותף, אז דירוג אחד חל על שני התרגילים בסופר-סט */}
          {showRpe && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] text-slate-500 w-10 shrink-0">
                RPE
              </span>
              <div className="flex gap-1.5 flex-1">
                {[5, 6, 7, 8, 9, 10].map((r) => (
                  <button
                    key={r}
                    onClick={() => activeExercises.forEach((ex) => setRpe(ex.exerciseId, r))}
                    className={cn(
                      "flex-1 h-9 rounded-lg text-xs font-bold transition-colors",
                      rpe === r
                        ? r <= 7
                          ? "bg-green-600 text-white"
                          : r <= 9
                          ? "bg-amber-600 text-white"
                          : "bg-red-600 text-white"
                        : "bg-slate-800 text-slate-500 hover:bg-slate-700"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ╔══════════════════════════════════════╗
              ║  כפתור תיעוד סט — אחד לכל הפריט      ║
              ╚══════════════════════════════════════╝ */}
          <button
            onClick={handleLogRound}
            className={cn(
              "w-full h-16 rounded-2xl font-black text-[1.05rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg",
              isWarmup
                ? "bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 shadow-none"
                : "bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow-green-900/40"
            )}
          >
            <CheckCircle2 size={22} strokeWidth={2.5} />
            {isWarmup
              ? `תעד חימום ${warmupSets.length + 1}`
              : isSuperSet
              ? roundInSync
                ? `תעד סט ${setsCompleted + 1} מתוך ${currentEx.targetSets} — שני התרגילים`
                : `תעד סט — שני התרגילים`
              : `תעד סט ${setsCompleted + 1} מתוך ${currentEx.targetSets}`}
          </button>
        </div>
      )}

      {/* ── טיימר תרגיל — key resets the component on exercise change ─────────── */}
      <ExerciseTimer key={currentExIdx} onLogTime={handleLogHold} />

      {/* ── תרגילים קרובים + סידור מחדש ────────────────────────── */}
      {items.slice(currentItemPos + 1).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-600 font-semibold uppercase tracking-wider px-1">
            קרובים
          </p>
          {items.slice(currentItemPos + 1).map((item, relIdx) => {
            const pos = currentItemPos + 1 + relIdx
            const startIdx = starts[pos]
            const isLast = pos === items.length - 1
            const itemExercises = item.type === "superset" ? item.exercises : [item.exercise]
            const name = itemExercises.map((e) => e.name).join(" 🔗 ")
            const meta = itemExercises.map((e) => `${e.targetSets} × ${e.targetReps}`).join(" · ")
            const firstPrev = itemExercises.find((e) => e.previousPerformance)?.previousPerformance
            return (
              <div
                key={startIdx}
                className={cn(
                  "border rounded-2xl px-3 py-2.5 flex items-center gap-2",
                  item.type === "superset"
                    ? "bg-indigo-500/5 border-indigo-500/20"
                    : "bg-slate-900/70 border-slate-800"
                )}
              >
                {/* ↑ / ↓ reorder buttons — the first upcoming item can always move
                    up into the active slot (pos - 1 is always a valid target: it's
                    either the previous upcoming item or the current item) */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveItemAt(startIdx, -1)}
                    className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                    aria-label="הזז למעלה"
                  >
                    <ArrowUp size={11} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => moveItemAt(startIdx, 1)}
                    disabled={isLast}
                    className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                    aria-label="הזז למטה"
                  >
                    <ArrowDown size={11} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{meta}</p>
                </div>

                {firstPrev ? (
                  <p className="text-xs text-indigo-400 font-medium shrink-0">
                    {(firstPrev.topDurationSecs ?? 0) > 0
                      ? `${firstPrev.topDurationSecs} שנ'`
                      : firstPrev.topSetWeightKg > 0
                      ? `${firstPrev.topSetWeightKg} ק"ג`
                      : "BW"}
                  </p>
                ) : (
                  <p className="text-xs text-amber-400 shrink-0">פעם ראשונה</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── ניווט ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevExercise}
          disabled={currentItemPos === 0}
          className="flex items-center gap-1 border border-slate-800 hover:border-slate-600 rounded-2xl px-4 py-3 text-sm font-medium text-slate-400 disabled:opacity-25 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight size={16} /> הקודם
        </button>

        <div className="flex-1" />

        {allSetsComplete &&
          (currentItemPos < totalItems - 1 ? (
            <button
              onClick={nextExercise}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-2xl px-5 py-3 text-sm font-bold transition-colors"
            >
              תרגיל הבא <ArrowLeft size={16} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 rounded-2xl px-5 py-3 text-sm font-bold transition-colors"
            >
              <CheckCircle2 size={16} /> סיים אימון
            </button>
          ))
        }
      </div>

      <div className="h-2" />
    </div>
  )
}
