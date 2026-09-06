"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  X, Plus, ChevronUp, ChevronDown, Trash2, Save,
  Loader2, Search, CheckCircle2, Dumbbell, Link2, Unlink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { groupIntoItems } from "@/lib/superset"

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
  // Two adjacent exercises sharing the same superSetId form a Super-Set —
  // performed back-to-back, tracked independently. See src/lib/superset.ts.
  superSetId?: string
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
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-[0_4px_16px_rgb(0,0,0,0.04)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
        <Search size={14} className="text-gray-300 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חפש או הקלד שם תרגיל חדש..."
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none"
          autoFocus
        />
        {loading && <Loader2 size={12} className="animate-spin text-gray-300 shrink-0" />}
      </div>
      <div className="max-h-52 overflow-y-auto">
        {results.length === 0 && !loading && !showAddOption ? (
          <p className="text-xs text-gray-300 text-center py-4">לא נמצאו תרגילים</p>
        ) : (
          results.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onSelect(ex)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-start border-b border-gray-100 last:border-0"
            >
              <div className="p-1.5 bg-gray-100 rounded-lg shrink-0">
                <Dumbbell size={12} className="text-[#007AFF]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900">{ex.name}</p>
                <p className="text-[11px] text-gray-400">
                  {MUSCLE_HE[ex.primaryMuscle] ?? ex.primaryMuscle}
                  {" · "}{EQUIPMENT_HE[ex.equipment] ?? ex.equipment}
                  {ex.isCompound && " · מורכב"}
                </p>
              </div>
              <Plus size={14} className="text-[#007AFF] shrink-0" />
            </button>
          ))
        )}
      </div>

      {/* Add new exercise row */}
      {showAddOption && (
        <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5 flex items-center gap-2">
          <select
            value={newMuscle}
            onChange={(e) => setNewMuscle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-gray-200 rounded-full px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-[#007AFF] shrink-0"
          >
            {MUSCLE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#007AFF] disabled:opacity-50 text-white text-xs font-semibold rounded-full px-3 py-1.5 active:scale-95 transition"
          >
            {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            הוסף &ldquo;{trimmed}&rdquo;
          </button>
          {createError && <span className="text-[10px] text-[#FF3B30] shrink-0">שגיאה</span>}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ExerciseRow — single exercise in a day
// ─────────────────────────────────────────────────────────

function ExerciseRow({
  ex, idx, disableUp, disableDown,
  onUpdate, onRemove, onMoveUp, onMoveDown,
}: {
  ex: ExDraft
  idx: number
  disableUp: boolean
  disableDown: boolean
  onUpdate: (changes: Partial<ExDraft>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_16px_rgb(0,0,0,0.04)]">
      {/* שורה ראשית */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs text-gray-300 w-5 shrink-0 text-center font-bold">{idx + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-gray-900">{ex.name}</p>
          <p className="text-[11px] text-gray-400">
            {ex.targetSets} × {ex.targetReps} · {ex.restSeconds}שנ&apos; מנוחה
          </p>
        </div>
        {/* Move buttons */}
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp() }}
          disabled={disableUp}
          className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown() }}
          disabled={disableDown}
          className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors"
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1 text-gray-300 hover:text-[#FF3B30] transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* פרטים מורחבים */}
      {expanded && (
        <div className="px-3 py-3 bg-gray-50 border-t border-gray-100 grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">סטים</label>
            <input
              type="number"
              value={ex.targetSets}
              min={1} max={20}
              onChange={(e) => onUpdate({ targetSets: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-sm text-center font-bold text-gray-900 focus:outline-none focus:border-[#007AFF]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">חזרות</label>
            <input
              type="text"
              value={ex.targetReps}
              placeholder="8-12"
              onChange={(e) => onUpdate({ targetReps: e.target.value })}
              className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-sm text-center font-bold text-gray-900 focus:outline-none focus:border-[#007AFF]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">מנוחה (שנ&apos;)</label>
            <input
              type="number"
              value={ex.restSeconds}
              min={15} max={600} step={15}
              onChange={(e) => onUpdate({ restSeconds: Math.max(15, parseInt(e.target.value) || 90) })}
              className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-sm text-center font-bold text-gray-900 focus:outline-none focus:border-[#007AFF]"
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
          exercises: Array<{ id: string; exerciseId: string; name: string; primaryMuscle: string; equipment: string; order: number; targetSets: number; targetReps: string; restSeconds: number; superSetId?: string | null }>
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
            superSetId: e.superSetId ?? undefined,
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
    setDays((prev) => prev.map((d) => {
      if (d._key !== dayKey) return d
      const removed = d.exercises.find((e) => e._key === exKey)
      const exercises = d.exercises
        .filter((e) => e._key !== exKey)
        // Unlink the partner left behind — a Super-Set is always exactly two.
        .map((e) =>
          removed?.superSetId && e.superSetId === removed.superSetId
            ? { ...e, superSetId: undefined }
            : e
        )
      return { ...d, exercises }
    }))
  }

  // Moves the whole item (single exercise, or linked super-set pair)
  // containing `exKey` one slot earlier/later, keeping pairs adjacent.
  const moveItemInDay = (dayKey: string, exKey: string, dir: -1 | 1) => {
    setDays((prev) => prev.map((d) => {
      if (d._key !== dayKey) return d
      const items = groupIntoItems(d.exercises)
      const pos = items.findIndex((it) =>
        it.type === "single" ? it.exercise._key === exKey : it.exercises.some((e) => e._key === exKey)
      )
      if (pos === -1) return d
      const swapPos = pos + dir
      if (swapPos < 0 || swapPos >= items.length) return d
      const newItems = [...items]
      ;[newItems[pos], newItems[swapPos]] = [newItems[swapPos], newItems[pos]]
      const exercises = newItems
        .flatMap((it) => (it.type === "superset" ? it.exercises : [it.exercise]))
        .map((e, i) => ({ ...e, order: i }))
      return { ...d, exercises }
    }))
  }

  // Links two adjacent single exercises into a Super-Set, or unlinks an
  // existing pair back into two standalone exercises.
  const toggleSuperset = (dayKey: string, exKeyA: string, exKeyB: string) => {
    setDays((prev) => prev.map((d) => {
      if (d._key !== dayKey) return d
      const a = d.exercises.find((e) => e._key === exKeyA)
      const b = d.exercises.find((e) => e._key === exKeyB)
      const isLinked = !!a?.superSetId && a.superSetId === b?.superSetId
      const nextId = isLinked ? undefined : `ss-${newKey()}`
      return {
        ...d,
        exercises: d.exercises.map((e) =>
          e._key === exKeyA || e._key === exKeyB ? { ...e, superSetId: nextId } : e
        ),
      }
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
          superSetId: e.superSetId ?? null,
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
      <div className="fixed inset-0 z-50 bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-[#FF3B30]">שגיאה בטעינת התוכנית</p>
          <button onClick={onClose} className="text-sm font-medium text-[#007AFF] underline">חזור</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#F9FAFB] flex flex-col overflow-hidden">

      {/* ── כותרת ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white/80 backdrop-blur-lg shrink-0">
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-black transition-colors">
          <X size={20} />
        </button>
        <input
          type="text"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder="שם תוכנית..."
          className="flex-1 bg-transparent text-base font-bold text-gray-900 focus:outline-none placeholder:text-gray-300 placeholder:font-normal"
        />
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={splitType}
            onChange={(e) => setSplitType(e.target.value)}
            className="bg-gray-100 border-none rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
          >
            {SPLIT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={handleSave}
            disabled={saving || savedOk}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white active:scale-95 transition",
              savedOk ? "bg-[#34C759]" : "bg-[#007AFF] disabled:opacity-50"
            )}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> :
             savedOk ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {savedOk ? "נשמר!" : "שמור"}
          </button>
        </div>
      </div>

      {/* ── טאבים של ימים ─────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white overflow-x-auto shrink-0">
        {days.map((d) => (
          <div key={d._key} className="relative shrink-0">
            <button
              onClick={() => { setActiveDayKey(d._key); setShowSearch(false) }}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors pe-6",
                activeDayKey === d._key
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              )}
            >
              {d.name}
            </button>
            {days.length > 1 && (
              <button
                onClick={() => removeDay(d._key)}
                className="absolute top-0.5 end-1 p-0.5 text-gray-400 hover:text-[#FF3B30] transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addDay}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border border-dashed border-gray-200"
        >
          <Plus size={12} /> יום
        </button>
      </div>

      {/* ── תוכן היום הפעיל ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!activeDay ? (
          <div className="flex items-center justify-center h-full text-gray-300 text-sm">
            הוסף יום אימון ↑
          </div>
        ) : (
          <div className="space-y-3 max-w-lg mx-auto">
            {/* שם + תגית יום */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">שם היום</label>
                <input
                  type="text"
                  value={activeDay.name}
                  onChange={(e) => updateDay(activeDay._key, { name: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-2xl px-3 py-2.5 text-sm font-bold text-gray-900 shadow-[0_2px_10px_rgb(0,0,0,0.03)] focus:outline-none focus:border-[#007AFF]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">תגית</label>
                <select
                  value={activeDay.dayLabel}
                  onChange={(e) => updateDay(activeDay._key, { dayLabel: e.target.value })}
                  className="bg-white border border-gray-200 rounded-2xl px-3 py-2.5 text-sm font-bold text-gray-900 shadow-[0_2px_10px_rgb(0,0,0,0.03)] focus:outline-none focus:border-[#007AFF] h-[42px]"
                >
                  {DAY_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* רשימת תרגילים */}
            {activeDay.exercises.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  {activeDay.exercises.length} תרגילים — לחץ לעריכה
                </p>
                {(() => {
                  const items = groupIntoItems(activeDay.exercises)
                  return items.map((item, itemPos) => {
                    const disableUp = itemPos === 0
                    const disableDown = itemPos === items.length - 1

                    if (item.type === "single") {
                      const ex = item.exercise
                      const flatIdx = activeDay.exercises.findIndex((e) => e._key === ex._key)
                      const nextItem = items[itemPos + 1]
                      const canLink = nextItem?.type === "single"
                      return (
                        <div key={ex._key}>
                          <ExerciseRow
                            ex={ex}
                            idx={flatIdx}
                            disableUp={disableUp}
                            disableDown={disableDown}
                            onUpdate={(changes) => updateExercise(activeDay._key, ex._key, changes)}
                            onRemove={() => removeExercise(activeDay._key, ex._key)}
                            onMoveUp={() => moveItemInDay(activeDay._key, ex._key, -1)}
                            onMoveDown={() => moveItemInDay(activeDay._key, ex._key, 1)}
                          />
                          {canLink && (
                            <button
                              onClick={() => toggleSuperset(activeDay._key, ex._key, nextItem.exercise._key)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-gray-300 hover:text-[#007AFF] transition-colors"
                            >
                              <Link2 size={11} /> חבר לסופר-סט עם התרגיל הבא
                            </button>
                          )}
                        </div>
                      )
                    }

                    const [exA, exB] = item.exercises
                    const flatIdxA = activeDay.exercises.findIndex((e) => e._key === exA._key)
                    const flatIdxB = activeDay.exercises.findIndex((e) => e._key === exB._key)
                    return (
                      <div
                        key={item.superSetId}
                        className="border-2 border-[#007AFF]/20 rounded-2xl p-1.5 space-y-1.5 bg-blue-50/50"
                      >
                        <ExerciseRow
                          ex={exA}
                          idx={flatIdxA}
                          disableUp={disableUp}
                          disableDown={disableDown}
                          onUpdate={(changes) => updateExercise(activeDay._key, exA._key, changes)}
                          onRemove={() => removeExercise(activeDay._key, exA._key)}
                          onMoveUp={() => moveItemInDay(activeDay._key, exA._key, -1)}
                          onMoveDown={() => moveItemInDay(activeDay._key, exA._key, 1)}
                        />
                        <button
                          onClick={() => toggleSuperset(activeDay._key, exA._key, exB._key)}
                          className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] font-semibold text-[#007AFF] hover:opacity-70 transition-opacity"
                        >
                          <Unlink size={11} /> 🔗 סופר-סט — לחץ לביטול
                        </button>
                        <ExerciseRow
                          ex={exB}
                          idx={flatIdxB}
                          disableUp={disableUp}
                          disableDown={disableDown}
                          onUpdate={(changes) => updateExercise(activeDay._key, exB._key, changes)}
                          onRemove={() => removeExercise(activeDay._key, exB._key)}
                          onMoveUp={() => moveItemInDay(activeDay._key, exB._key, -1)}
                          onMoveDown={() => moveItemInDay(activeDay._key, exB._key, 1)}
                        />
                      </div>
                    )
                  })
                })()}
              </div>
            )}

            {/* כפתור הוסף תרגיל */}
            {!showSearch ? (
              <button
                onClick={() => setShowSearch(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-[#007AFF]/50 rounded-2xl py-4 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Plus size={16} /> הוסף תרגיל
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500">בחר תרגיל</p>
                  <button onClick={() => setShowSearch(false)} className="text-xs text-gray-400 hover:text-gray-600">
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
