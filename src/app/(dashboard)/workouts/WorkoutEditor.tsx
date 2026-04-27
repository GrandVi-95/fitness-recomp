"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  X, Plus, ChevronUp, ChevronDown, Trash2, Save,
  Loader2, Search, CheckCircle2, Dumbbell,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface ExerciseResult {
  id: string
  name: string
  primaryMuscle: string
  equipment: string
  isCompound: boolean
}

interface ExDraft {
  _key: string        // local-only React key
  id: string | null   // WorkoutExercise.id — null if new
  exerciseId: string
  name: string
  primaryMuscle: string
  equipment: string
  order: number
  targetSets: number
  targetReps: string
  restSeconds: number
}

interface DayDraft {
  _key: string
  id: string | null
  name: string
  dayLabel: string
  order: number
  exercises: ExDraft[]
}

const SPLIT_TYPES = ["PPL", "AB", "FULL_BODY", "CUSTOM"]
const DAY_LABELS  = ["Push", "Pull", "Legs", "A", "B", "C", "D", "Upper", "Lower", "Full"]

const MUSCLE_HE: Record<string, string> = {
  chest: "חזה", back: "גב", shoulders: "כתפיים", biceps: "בייספס",
  triceps: "טרייספס", legs: "רגליים", quads: "קוואדס",
  hamstrings: "ירכיים", glutes: "ישבן", calves: "שוקיים", core: "בטן",
}
const EQUIPMENT_HE: Record<string, string> = {
  barbell: "מוט", dumbbell: "משקוליות", cable: "כבל",
  machine: "מכונה", bodyweight: "גוף", kettlebell: "קטלבל",
}

function newKey() {
  return `_${Math.random().toString(36).slice(2)}`
}

const MUSCLE_OPTIONS = [
  { value: "chest", label: "חזה" },
  { value: "back", label: "גב" },
  { value: "shoulders", label: "כתפיים" },
  { value: "biceps", label: "בייספס" },
  { value: "triceps", label: "טרייספס" },
  { value: "legs", label: "רגליים" },
  { value: "core", label: "בטן" },
  { value: "other", label: "אחר" },
]

// ─────────────────────────────────────────────────────────
// ExerciseSearch — searchable combobox with on-the-fly creation
// ─────────────────────────────────────────────────────────

function ExerciseSearch({ onSelect }: { onSelect: (ex: ExerciseResult) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<ExerciseResult[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newMuscle, setNewMuscle] = useState("other")
  const [createError, setCreateError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((query: string) => {
    setLoading(true)
    fetch(`/api/exercises?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => setResults(d.exercises ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [])

  // Initial load (show all exercises) + debounced search
  useEffect(() => { search("") }, [search])
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(q), 300)
  }, [q, search])

  const trimmed = q.trim()
  const exactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())
  const showAddOption = trimmed.length > 0 && !loading && !exactMatch

  const handleCreate = async () => {
    if (!trimmed || creating) return
    setCreating(true)
    setCreateError(false)
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, primaryMuscle: newMuscle }),
      })
      const data = await res.json()
      if (!res.ok || !data.exercise) throw new Error()
      onSelect(data.exercise)
    } catch {
      setCreateError(true)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="border border-slate-700 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-800">
        <Search size={14} className="text-slate-500 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חפש או הקלד שם תרגיל חדש..."
          className="flex-1 bg-transparent text-sm placeholder:text-slate-600 focus:outline-none"
          autoFocus
        />
        {loading && <Loader2 size={12} className="animate-spin text-slate-600 shrink-0" />}
      </div>
      <div className="max-h-52 overflow-y-auto">
        {results.length === 0 && !loading && !showAddOption ? (
          <p className="text-xs text-slate-600 text-center py-4">לא נמצאו תרגילים</p>
        ) : (
          results.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onSelect(ex)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 transition-colors text-start border-b border-slate-800 last:border-0"
            >
              <div className="p-1.5 bg-slate-800 rounded-lg shrink-0">
                <Dumbbell size={12} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ex.name}</p>
                <p className="text-[11px] text-slate-500">
                  {MUSCLE_HE[ex.primaryMuscle] ?? ex.primaryMuscle}
                  {" · "}{EQUIPMENT_HE[ex.equipment] ?? ex.equipment}
                  {ex.isCompound && " · מורכב"}
                </p>
              </div>
              <Plus size={14} className="text-indigo-400 shrink-0" />
            </button>
          ))
        )}
      </div>

      {/* Add new exercise row */}
      {showAddOption && (
        <div className="border-t border-slate-700 bg-slate-900 px-3 py-2.5 flex items-center gap-2">
          <select
            value={newMuscle}
            onChange={(e) => setNewMuscle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 shrink-0"
          >
            {MUSCLE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors"
          >
            {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            הוסף &ldquo;{trimmed}&rdquo;
          </button>
          {createError && <span className="text-[10px] text-red-400 shrink-0">שגיאה</span>}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ExerciseRow — single exercise in a day
// ─────────────────────────────────────────────────────────

function ExerciseRow({
  ex, idx, total,
  onUpdate, onRemove, onMoveUp, onMoveDown,
}: {
  ex: ExDraft
  idx: number
  total: number
  onUpdate: (changes: Partial<ExDraft>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      {/* שורה ראשית */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-slate-900 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs text-slate-600 w-5 shrink-0 text-center font-bold">{idx + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{ex.name}</p>
          <p className="text-[11px] text-slate-500">
            {ex.targetSets} × {ex.targetReps} · {ex.restSeconds}שנ' מנוחה
          </p>
        </div>
        {/* Move buttons */}
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp() }}
          disabled={idx === 0}
          className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown() }}
          disabled={idx === total - 1}
          className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors"
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1 text-slate-600 hover:text-red-400 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* פרטים מורחבים */}
      {expanded && (
        <div className="px-3 py-3 bg-slate-950 border-t border-slate-800 grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">סטים</label>
            <input
              type="number"
              value={ex.targetSets}
              min={1} max={20}
              onChange={(e) => onUpdate({ targetSets: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">חזרות</label>
            <input
              type="text"
              value={ex.targetReps}
              placeholder="8-12"
              onChange={(e) => onUpdate({ targetReps: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">מנוחה (שנ')</label>
            <input
              type="number"
              value={ex.restSeconds}
              min={15} max={600} step={15}
              onChange={(e) => onUpdate({ restSeconds: Math.max(15, parseInt(e.target.value) || 90) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// WorkoutEditor — main component
// ─────────────────────────────────────────────────────────

interface WorkoutEditorProps {
  planId: string | "new"
  onClose: () => void
  onSaved: () => void
}

export default function WorkoutEditor({ planId, onClose, onSaved }: WorkoutEditorProps) {
  const isNew = planId === "new"

  const [planName, setPlanName]     = useState("תוכנית חדשה")
  const [splitType, setSplitType]   = useState("PPL")
  const [days, setDays]             = useState<DayDraft[]>([])
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [loadError, setLoadError]   = useState(false)
  const [savedOk, setSavedOk]       = useState(false)

  // ── Load existing plan ──────────────────────────────────
  useEffect(() => {
    if (isNew) {
      // Default 3 days for new plan
      const defaultDays: DayDraft[] = [
        { _key: newKey(), id: null, name: "Push A", dayLabel: "Push", order: 0, exercises: [] },
        { _key: newKey(), id: null, name: "Pull A", dayLabel: "Pull", order: 1, exercises: [] },
        { _key: newKey(), id: null, name: "Legs A", dayLabel: "Legs", order: 2, exercises: [] },
      ]
      setDays(defaultDays)
      setActiveDayKey(defaultDays[0]._key)
      return
    }

    fetch("/api/workouts/plans")
      .then((r) => r.json())
      .then((data) => {
        const plan = data.plans?.find((p: { id: string }) => p.id === planId)
        if (!plan) { setLoadError(true); return }
        setPlanName(plan.name)
        setSplitType(plan.splitType)
        const drafts: DayDraft[] = plan.workouts.map((w: {
          id: string; name: string; dayLabel: string; order: number;
          exercises: Array<{ id: string; exerciseId: string; name: string; primaryMuscle: string; equipment: string; order: number; targetSets: number; targetReps: string; restSeconds: number }>
        }) => ({
          _key: newKey(),
          id: w.id,
          name: w.name,
          dayLabel: w.dayLabel,
          order: w.order,
          exercises: w.exercises.map((e) => ({
            _key: newKey(),
            id: e.id,
            exerciseId: e.exerciseId,
            name: e.name,
            primaryMuscle: e.primaryMuscle,
            equipment: e.equipment,
            order: e.order,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            restSeconds: e.restSeconds,
          })),
        }))
        setDays(drafts)
        setActiveDayKey(drafts[0]?._key ?? null)
      })
      .catch(() => setLoadError(true))
  }, [isNew, planId])

  // ── Day helpers ─────────────────────────────────────────
  const activeDay = days.find((d) => d._key === activeDayKey) ?? null

  const addDay = () => {
    const next: DayDraft = {
      _key: newKey(), id: null,
      name: `יום ${days.length + 1}`,
      dayLabel: "A",
      order: days.length,
      exercises: [],
    }
    setDays((prev) => [...prev, next])
    setActiveDayKey(next._key)
    setShowSearch(false)
  }

  const removeDay = (key: string) => {
    setDays((prev) => {
      const filtered = prev.filter((d) => d._key !== key)
      if (activeDayKey === key) setActiveDayKey(filtered[0]?._key ?? null)
      return filtered
    })
  }

  const updateDay = (key: string, changes: Partial<DayDraft>) => {
    setDays((prev) => prev.map((d) => d._key === key ? { ...d, ...changes } : d))
  }

  // ── Exercise helpers ────────────────────────────────────
  const addExercise = (ex: ExerciseResult) => {
    if (!activeDayKey) return
    const newEx: ExDraft = {
      _key: newKey(),
      id: null,
      exerciseId: ex.id,
      name: ex.name,
      primaryMuscle: ex.primaryMuscle,
      equipment: ex.equipment,
      order: activeDay?.exercises.length ?? 0,
      targetSets: 3,
      targetReps: "8-12",
      restSeconds: 90,
    }
    updateDay(activeDayKey, {
      exercises: [...(activeDay?.exercises ?? []), newEx],
    })
    setShowSearch(false)
  }

  const updateExercise = (dayKey: string, exKey: string, changes: Partial<ExDraft>) => {
    setDays((prev) => prev.map((d) =>
      d._key !== dayKey ? d : {
        ...d,
        exercises: d.exercises.map((e) => e._key !== exKey ? e : { ...e, ...changes }),
      }
    ))
  }

  const removeExercise = (dayKey: string, exKey: string) => {
    setDays((prev) => prev.map((d) =>
      d._key !== dayKey ? d : { ...d, exercises: d.exercises.filter((e) => e._key !== exKey) }
    ))
  }

  const moveExercise = (dayKey: string, exKey: string, dir: -1 | 1) => {
    setDays((prev) => prev.map((d) => {
      if (d._key !== dayKey) return d
      const exs = [...d.exercises]
      const idx = exs.findIndex((e) => e._key === exKey)
      if (idx < 0) return d
      const swap = idx + dir
      if (swap < 0 || swap >= exs.length) return d
      ;[exs[idx], exs[swap]] = [exs[swap], exs[idx]]
      return { ...d, exercises: exs.map((e, i) => ({ ...e, order: i })) }
    }))
  }

  // ── Save ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!planName.trim()) return
    setSaving(true)

    const payload = {
      name: planName.trim(),
      splitType,
      workouts: days.map((d, di) => ({
        ...(d.id ? { id: d.id } : {}),
        name: d.name,
        dayLabel: d.dayLabel,
        order: di,
        muscleGroups: [...new Set(d.exercises.map((e) => e.primaryMuscle))],
        exercises: d.exercises.map((e, ei) => ({
          ...(e.id ? { id: e.id } : {}),
          exerciseId: e.exerciseId,
          order: ei,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          restSeconds: e.restSeconds,
        })),
      })),
    }

    try {
      let res: Response
      if (isNew) {
        // Create plan, then update with workouts
        const createRes = await fetch("/api/workouts/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: payload.name, splitType: payload.splitType }),
        })
        const { planId: newId } = await createRes.json()
        res = await fetch(`/api/workouts/plans/${newId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/workouts/plans/${planId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) throw new Error()
      setSavedOk(true)
      setTimeout(() => { setSavedOk(false); onSaved() }, 800)
    } catch {
      alert("שגיאה בשמירה — אנא נסה שוב")
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-red-400">שגיאה בטעינת התוכנית</p>
          <button onClick={onClose} className="text-sm text-indigo-400 underline">חזור</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden">

      {/* ── כותרת ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
        <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
          <X size={20} />
        </button>
        <input
          type="text"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder="שם תוכנית..."
          className="flex-1 bg-transparent text-base font-bold focus:outline-none placeholder:text-slate-600 placeholder:font-normal"
        />
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={splitType}
            onChange={(e) => setSplitType(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            {SPLIT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={handleSave}
            disabled={saving || savedOk}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors",
              savedOk
                ? "bg-green-600 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            )}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> :
             savedOk ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {savedOk ? "נשמר!" : "שמור"}
          </button>
        </div>
      </div>

      {/* ── טאבים של ימים ─────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 overflow-x-auto shrink-0">
        {days.map((d) => (
          <div key={d._key} className="relative shrink-0">
            <button
              onClick={() => { setActiveDayKey(d._key); setShowSearch(false) }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors pe-6",
                activeDayKey === d._key
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              )}
            >
              {d.name}
            </button>
            {days.length > 1 && (
              <button
                onClick={() => removeDay(d._key)}
                className="absolute top-0.5 end-1 p-0.5 text-slate-500 hover:text-red-400 transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addDay}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors border border-dashed border-slate-700"
        >
          <Plus size={12} /> יום
        </button>
      </div>

      {/* ── תוכן היום הפעיל ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!activeDay ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            הוסף יום אימון ↑
          </div>
        ) : (
          <div className="space-y-3 max-w-lg mx-auto">
            {/* שם + תגית יום */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">שם היום</label>
                <input
                  type="text"
                  value={activeDay.name}
                  onChange={(e) => updateDay(activeDay._key, { name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">תגית</label>
                <select
                  value={activeDay.dayLabel}
                  onChange={(e) => updateDay(activeDay._key, { dayLabel: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500 h-[38px]"
                >
                  {DAY_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* רשימת תרגילים */}
            {activeDay.exercises.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  {activeDay.exercises.length} תרגילים — לחץ לעריכה
                </p>
                {activeDay.exercises.map((ex, idx) => (
                  <ExerciseRow
                    key={ex._key}
                    ex={ex}
                    idx={idx}
                    total={activeDay.exercises.length}
                    onUpdate={(changes) => updateExercise(activeDay._key, ex._key, changes)}
                    onRemove={() => removeExercise(activeDay._key, ex._key)}
                    onMoveUp={() => moveExercise(activeDay._key, ex._key, -1)}
                    onMoveDown={() => moveExercise(activeDay._key, ex._key, 1)}
                  />
                ))}
              </div>
            )}

            {/* כפתור הוסף תרגיל */}
            {!showSearch ? (
              <button
                onClick={() => setShowSearch(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-700 hover:border-indigo-600/50 rounded-2xl py-4 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Plus size={16} /> הוסף תרגיל
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400">בחר תרגיל</p>
                  <button onClick={() => setShowSearch(false)} className="text-xs text-slate-600 hover:text-slate-400">
                    ביטול
                  </button>
                </div>
                <ExerciseSearch onSelect={addExercise} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
