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

// Shared "bento box" card treatment — matches the dashboard page / CheckInCard.
const CARD = "bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)]"

// ─────────────────────────────────────────────────────────
// Hebrew muscle-group labels
// ─────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-center min-h-64 text-gray-400">
        <Loader2 size={20} className="animate-spin me-2" /> טוען תוכניות...
      </div>
    )
  }

  const activePlan = plans?.find((p) => p.isActive) ?? plans?.[0] ?? null

  return (
    <div className="bg-[#F9FAFB] px-4 py-5 space-y-5 max-w-lg mx-auto">

      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">אימונים</h1>
          {activePlan ? (
            <p className="text-sm text-gray-500 mt-0.5">
              {activePlan.name} · {activePlan.splitType}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">אין תוכנית פעילה</p>
          )}
        </div>
        <button
          onClick={() => setEditingPlanId("new")}
          className="flex items-center gap-1.5 rounded-full bg-[#007AFF] text-white px-4 py-2.5 text-sm font-semibold active:scale-95 transition"
        >
          <Plus size={16} /> תוכנית חדשה
        </button>
      </div>

      {/* מצב ריק */}
      {(!plans || plans.length === 0) && (
        <div className={cn(CARD, "p-8 flex flex-col items-center gap-4 text-center")}>
          <Dumbbell size={40} className="text-gray-300" />
          <div>
            <p className="text-base font-semibold text-gray-900">אין תוכניות אימון</p>
            <p className="text-sm text-gray-500 mt-1">
              לחץ על &quot;תוכנית חדשה&quot; כדי לבנות את האימון שלך.
            </p>
          </div>
          <button
            onClick={() => setEditingPlanId("new")}
            className="flex items-center gap-2 rounded-full bg-[#007AFF] text-white px-5 py-3 text-sm font-semibold active:scale-95 transition"
          >
            <Plus size={16} /> צור תוכנית
          </button>
        </div>
      )}

      {/* ימי אימון של התוכנית הפעילה */}
      {activePlan && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">ימי האימון</h2>
            <button
              onClick={() => setEditingPlanId(activePlan.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-[#007AFF] hover:opacity-70 transition-opacity"
            >
              <Pencil size={13} /> ערוך תוכנית
            </button>
          </div>

          <div className="space-y-3">
            {activePlan.workouts.map((workout) => (
              <div key={workout.id} className={cn(CARD, "p-5 space-y-3")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-xl">
                      <Dumbbell size={18} className="text-[#007AFF]" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{workout.name}</p>
                      <p className="text-xs text-gray-500">
                        {workout.exercises.length} תרגילים
                      </p>
                    </div>
                  </div>
                  <ChevronLeft size={18} className="text-gray-300" />
                </div>

                {/* תגיות קבוצות שרירים */}
                {workout.muscleGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {workout.muscleGroups.map((m) => (
                      <span
                        key={m}
                        className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-700"
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
                            <p key={ex.id} className="text-xs text-gray-500">
                              <span className="text-gray-400 me-1">{counter}.</span>
                              {ex.name}
                              <span className="text-gray-300 mx-1">·</span>
                              <span className="text-gray-400">{ex.targetSets} × {ex.targetReps}</span>
                            </p>
                          )
                        }
                        const startNum = counter + 1
                        counter += group.length
                        return (
                          <div
                            key={`ss-${gi}`}
                            className="bg-blue-50 border border-blue-100 rounded-xl px-2 py-1.5 space-y-1"
                          >
                            {group.map((ex, idx) => (
                              <p key={ex.id} className="text-xs text-gray-500">
                                <span className="text-gray-400 me-1">{startNum + idx}.</span>
                                {ex.name}
                                <span className="text-gray-300 mx-1">·</span>
                                <span className="text-gray-400">{ex.targetSets} × {ex.targetReps}</span>
                              </p>
                            ))}
                            <p className="text-[10px] text-[#007AFF] font-semibold flex items-center gap-1">
                              🔗 סופר-סט — ללא מנוחה בין התרגילים
                            </p>
                          </div>
                        )
                      })}
                      {remaining > 0 && (
                        <p className="text-xs text-gray-400">
                          +{remaining} תרגילים נוספים
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* שורת תחתית */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                    <Calendar size={12} />
                    {workout.dayLabel}
                  </span>
                  <Link
                    href="/gym"
                    className="text-xs font-semibold text-[#007AFF] hover:opacity-70 flex items-center gap-1 transition-opacity"
                  >
                    התחל <ChevronLeft size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {activePlan.workouts.length === 0 && (
            <div className={cn(CARD, "p-5 text-center text-sm text-gray-500")}>
              <p>התוכנית ריקה — לחץ &quot;ערוך תוכנית&quot; כדי להוסיף ימי אימון ותרגילים.</p>
            </div>
          )}
        </>
      )}

      {/* תוכניות נוספות */}
      {plans && plans.length > 1 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">תוכניות נוספות</h2>
          {plans.filter((p) => p.id !== activePlan?.id).map((plan) => (
            <div key={plan.id} className={cn(CARD, "px-4 py-3 flex items-center gap-3")}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-gray-900">{plan.name}</p>
                <p className="text-xs text-gray-500">{plan.splitType} · {plan.workouts.length} ימים</p>
              </div>
              <button
                onClick={() => setEditingPlanId(plan.id)}
                className="p-1.5 text-gray-400 hover:text-[#007AFF] transition-colors"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => handleDelete(plan.id)}
                disabled={deleting === plan.id}
                className="p-1.5 text-gray-400 hover:text-[#FF3B30] transition-colors disabled:opacity-40"
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
