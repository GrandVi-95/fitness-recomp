"use client"

import { useState, useEffect, useCallback } from "react"
import { Dumbbell, Plus, ChevronLeft, Calendar, Pencil, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import WorkoutEditor from "./WorkoutEditor"
import { cn } from "@/lib/utils"
import { groupIntoItems } from "@/lib/superset"

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface WorkoutDay {
  id: string
  name: string
  dayLabel: string
  order: number
  muscleGroups: string[]
  exercises: Array<{
    id: string
    name: string
    targetSets: number
    targetReps: string
    superSetId?: string | null
  }>
}

// Clusters consecutive exercises that share a superSetId into groups of 2
// (a super-set pair, performed back-to-back) or 1 (a standalone exercise).
// Delegates to the shared grouping algorithm (src/lib/superset.ts) also used
// by the live gym session and the workout editor.
function groupSuperSets<T extends { superSetId?: string | null }>(exercises: T[]): T[][] {
  return groupIntoItems(exercises).map((item) =>
    item.type === "superset" ? item.exercises : [item.exercise]
  )
}

interface Plan {
  id: string
  name: string
  splitType: string
  isActive: boolean
  workouts: WorkoutDay[]
}

// ─────────────────────────────────────────────────────────
// Colour maps (shared with gym page)
// ─────────────────────────────────────────────────────────

const MUSCLE_COLOR: Record<string, string> = {
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

const MUSCLE_HE: Record<string, string> = {
  chest: "חזה", back: "גב", shoulders: "כתפיים", biceps: "בייספס",
  triceps: "טרייספס", legs: "רגליים", quads: "קוואדס",
  hamstrings: "ירכיים", glutes: "ישבן", calves: "שוקיים", core: "בטן",
}

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  const [plans, setPlans]           = useState<Plan[] | null>(null)
  const [loading, setLoading]       = useState(true)
  const [editingPlanId, setEditingPlanId] = useState<string | "new" | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/workouts/plans")
      const data = await res.json()
      setPlans(data.plans ?? [])
    } catch {
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const handleDelete = async (planId: string) => {
    if (!confirm("למחוק את תוכנית האימון? כל היסטוריית האימונים שלה תימחק גם היא. פעולה זו אינה הפיכה.")) return
    setDeleting(planId)
    try {
      const res = await fetch(`/api/workouts/plans/${planId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? "שגיאה במחיקת התוכנית — אנא נסה שוב")
        return
      }
      setPlans((prev) => prev?.filter((p) => p.id !== planId) ?? [])
    } catch {
      alert("שגיאה במחיקת התוכנית — בדוק את החיבור שלך")
    } finally {
      setDeleting(null)
    }
  }

  // Show editor overlay
  if (editingPlanId !== null) {
    return (
      <WorkoutEditor
        planId={editingPlanId}
        onClose={() => setEditingPlanId(null)}
        onSaved={() => {
          setEditingPlanId(null)
          setLoading(true)
          fetchPlans()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-slate-500">
        <Loader2 size={20} className="animate-spin me-2" /> טוען תוכניות...
      </div>
    )
  }

  const activePlan = plans?.find((p) => p.isActive) ?? plans?.[0] ?? null

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">אימונים</h1>
          {activePlan ? (
            <p className="text-sm text-slate-400 mt-0.5">
              {activePlan.name} · {activePlan.splitType}
            </p>
          ) : (
            <p className="text-sm text-slate-400 mt-0.5">אין תוכנית פעילה</p>
          )}
        </div>
        <button
          onClick={() => setEditingPlanId("new")}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} /> תוכנית חדשה
        </button>
      </div>

      {/* מצב ריק */}
      {(!plans || plans.length === 0) && (
        <div className="bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <Dumbbell size={40} className="text-slate-700" />
          <div>
            <p className="text-base font-semibold text-slate-300">אין תוכניות אימון</p>
            <p className="text-sm text-slate-500 mt-1">
              לחץ על "תוכנית חדשה" כדי לבנות את האימון שלך.
            </p>
          </div>
          <button
            onClick={() => setEditingPlanId("new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            <Plus size={16} /> צור תוכנית
          </button>
        </div>
      )}

      {/* ימי אימון של התוכנית הפעילה */}
      {activePlan && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">ימי האימון</h2>
            <button
              onClick={() => setEditingPlanId(activePlan.id)}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Pencil size={13} /> ערוך תוכנית
            </button>
          </div>

          <div className="space-y-3">
            {activePlan.workouts.map((workout) => (
              <div key={workout.id} className="bg-slate-900 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-xl">
                      <Dumbbell size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-semibold">{workout.name}</p>
                      <p className="text-xs text-slate-500">
                        {workout.exercises.length} תרגילים
                      </p>
                    </div>
                  </div>
                  <ChevronLeft size={18} className="text-slate-600" />
                </div>

                {/* תגיות קבוצות שרירים */}
                {workout.muscleGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {workout.muscleGroups.map((m) => (
                      <span
                        key={m}
                        className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full",
                          MUSCLE_COLOR[m] ?? "bg-slate-700 text-slate-300"
                        )}
                      >
                        {MUSCLE_HE[m] ?? m}
                      </span>
                    ))}
                  </div>
                )}

                {/* תצוגת תרגילים */}
                {workout.exercises.length > 0 && (() => {
                  const groups = groupSuperSets(workout.exercises)
                  let shown = 0
                  const visibleGroups: typeof groups = []
                  for (const g of groups) {
                    if (shown >= 4) {
                      // Let a super-set pair that starts exactly at the cutoff
                      // complete, rather than hiding it behind "+N more".
                      if (g.length === 2 && shown === 4) {
                        visibleGroups.push(g)
                        shown += g.length
                      }
                      break
                    }
                    visibleGroups.push(g)
                    shown += g.length
                  }
                  const remaining = workout.exercises.length - shown
                  let counter = 0

                  return (
                    <div className="space-y-1.5">
                      {visibleGroups.map((group, gi) => {
                        if (group.length === 1) {
                          const ex = group[0]
                          counter += 1
                          return (
                            <p key={ex.id} className="text-xs text-slate-500">
                              <span className="text-slate-600 me-1">{counter}.</span>
                              {ex.name}
                              <span className="text-slate-700 mx-1">·</span>
                              <span className="text-slate-600">{ex.targetSets} × {ex.targetReps}</span>
                            </p>
                          )
                        }
                        const startNum = counter + 1
                        counter += group.length
                        return (
                          <div
                            key={`ss-${gi}`}
                            className="bg-indigo-500/10 border border-indigo-500/25 rounded-lg px-2 py-1.5 space-y-1"
                          >
                            {group.map((ex, idx) => (
                              <p key={ex.id} className="text-xs text-slate-400">
                                <span className="text-slate-600 me-1">{startNum + idx}.</span>
                                {ex.name}
                                <span className="text-slate-700 mx-1">·</span>
                                <span className="text-slate-500">{ex.targetSets} × {ex.targetReps}</span>
                              </p>
                            ))}
                            <p className="text-[10px] text-indigo-400 font-semibold flex items-center gap-1">
                              🔗 סופר-סט — ללא מנוחה בין התרגילים
                            </p>
                          </div>
                        )
                      })}
                      {remaining > 0 && (
                        <p className="text-xs text-slate-600">
                          +{remaining} תרגילים נוספים
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* שורת תחתית */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Calendar size={12} />
                    {workout.dayLabel}
                  </span>
                  <Link
                    href="/gym"
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    התחל <ChevronLeft size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {activePlan.workouts.length === 0 && (
            <div className="bg-slate-900 rounded-2xl p-5 text-center text-sm text-slate-500">
              <p>התוכנית ריקה — לחץ "ערוך תוכנית" כדי להוסיף ימי אימון ותרגילים.</p>
            </div>
          )}
        </>
      )}

      {/* תוכניות נוספות */}
      {plans && plans.length > 1 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">תוכניות נוספות</h2>
          {plans.filter((p) => p.id !== activePlan?.id).map((plan) => (
            <div key={plan.id} className="bg-slate-900 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{plan.name}</p>
                <p className="text-xs text-slate-500">{plan.splitType} · {plan.workouts.length} ימים</p>
              </div>
              <button
                onClick={() => setEditingPlanId(plan.id)}
                className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => handleDelete(plan.id)}
                disabled={deleting === plan.id}
                className="p-1.5 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
              >
                {deleting === plan.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
