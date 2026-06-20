"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChefHat,
  ChevronLeft,
  Loader2,
  Trash2,
  Check,
  AlertCircle,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import RecipeCreator from "./RecipeCreator"

// ── Types ─────────────────────────────────────────────────────

interface Recipe {
  id:               string
  name:             string
  ingredients:      string
  totalCalories:    number
  totalProtein:     number
  totalCarbs:       number
  totalFat:         number
  totalSugar:       number
  defaultServingPct: number
}

type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "pre_workout"
  | "post_workout"

interface Props {
  selectedMeal: MealType
  onLogSuccess: () => void
}

// Parse "1/8" → 12.5  |  "25" → 25  |  "12.5" → 12.5
function parsePct(val: string): number | null {
  const trimmed = val.trim()
  if (trimmed.includes("/")) {
    const [n, d] = trimmed.split("/").map((s) => parseFloat(s.trim()))
    if (!isNaN(n) && !isNaN(d) && d !== 0) return (n / d) * 100
    return null
  }
  const num = parseFloat(trimmed)
  return isNaN(num) ? null : num
}

// ── Component ─────────────────────────────────────────────────

export default function RecipePanel({ selectedMeal, onLogSuccess }: Props) {
  const [open, setOpen] = useState(false)

  const [recipes,        setRecipes]        = useState<Recipe[]>([])
  const [recipesLoading, setRecipesLoading] = useState(false)

  // Per-recipe UI state
  const [customPctMap,  setCustomPctMap]  = useState<Record<string, string>>({})
  const [loggingId,     setLoggingId]     = useState<string | null>(null)
  const [logSuccessId,  setLogSuccessId]  = useState<string | null>(null)
  const [logErrorId,    setLogErrorId]    = useState<string | null>(null)
  const [deletingId,    setDeletingId]    = useState<string | null>(null)

  const [showCreator, setShowCreator] = useState(false)

  // ── Fetch recipes ──────────────────────────────────────────
  const fetchRecipes = useCallback(async () => {
    setRecipesLoading(true)
    try {
      const res  = await fetch("/api/recipes")
      const data = await res.json()
      if (res.ok) setRecipes(data.recipes ?? [])
    } catch {
      // ignore — empty list is fine
    } finally {
      setRecipesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchRecipes()
  }, [open, fetchRecipes])

  // ── Log a fraction ─────────────────────────────────────────
  const handleLog = async (recipe: Recipe, servingPct: number) => {
    if (servingPct <= 0 || servingPct > 100) return
    setLoggingId(recipe.id)
    setLogErrorId(null)
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/log`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ servingPct, mealType: selectedMeal }),
      })
      if (!res.ok) {
        setLogErrorId(recipe.id)
        setTimeout(() => setLogErrorId(null), 3000)
        return
      }
      setLogSuccessId(recipe.id)
      setTimeout(() => setLogSuccessId(null), 2000)
      onLogSuccess()
    } catch {
      setLogErrorId(recipe.id)
      setTimeout(() => setLogErrorId(null), 3000)
    } finally {
      setLoggingId(null)
    }
  }

  const handleCustomLog = (recipe: Recipe) => {
    const raw = customPctMap[recipe.id] ?? ""
    const pct = parsePct(raw)
    if (!pct) return
    handleLog(recipe, pct)
  }

  // ── Delete a recipe ────────────────────────────────────────
  const handleDelete = async (recipe: Recipe) => {
    setDeletingId(recipe.id)
    try {
      await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" })
      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id))
    } catch {
      // silent fail
    } finally {
      setDeletingId(null)
    }
  }

  // ── Macro preview for a fraction ──────────────────────────
  const fracMacros = (recipe: Recipe, pct: number) => ({
    cal:  Math.round(recipe.totalCalories * pct / 100),
    prot: Math.round(recipe.totalProtein  * pct / 100 * 10) / 10,
    carb: Math.round(recipe.totalCarbs    * pct / 100),
    fat:  Math.round(recipe.totalFat      * pct / 100 * 10) / 10,
  })

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ChefHat size={15} className="text-amber-400" />
          <span className="text-sm font-semibold">מתכונים שמורים</span>
          {recipes.length > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.5 font-medium">
              {recipes.length}
            </span>
          )}
        </div>
        <ChevronLeft
          size={16}
          className={cn(
            "text-slate-600 transition-transform duration-200",
            open ? "rotate-90" : "rtl:-rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800">
          {/* Recipe list */}
          {recipesLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={16} className="animate-spin text-slate-500" />
            </div>
          ) : recipes.length === 0 ? (
            <p className="text-xs text-slate-600 py-2 text-center" dir="rtl">
              אין מתכונים שמורים עדיין — צור מתכון חדש למטה
            </p>
          ) : (
            <div className="space-y-3 pt-2">
              {recipes.map((recipe) => {
                const def    = recipe.defaultServingPct
                const defM   = fracMacros(recipe, def)
                const halfM  = fracMacros(recipe, 50)
                const isLogging  = loggingId    === recipe.id
                const isSuccess  = logSuccessId === recipe.id
                const isError    = logErrorId   === recipe.id
                const isDeleting = deletingId   === recipe.id

                return (
                  <div
                    key={recipe.id}
                    className={cn(
                      "bg-slate-800/60 rounded-xl p-3 space-y-2.5 transition-opacity",
                      isDeleting && "opacity-30 pointer-events-none",
                    )}
                    dir="rtl"
                  >
                    {/* Recipe header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{recipe.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          סה"כ: {recipe.totalCalories} קק"ל · {recipe.totalProtein}ג' חלב'
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(recipe)}
                        className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                        aria-label="מחק מתכון"
                      >
                        {isDeleting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                      </button>
                    </div>

                    {/* Success / error feedback */}
                    {isSuccess && (
                      <div className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 rounded-lg px-2.5 py-1.5">
                        <Check size={11} /> נרשם בהצלחה!
                      </div>
                    )}
                    {isError && (
                      <div className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1.5">
                        <AlertCircle size={11} /> שגיאה — נסה שוב
                      </div>
                    )}

                    {/* Quick-log buttons */}
                    <div className="flex gap-1.5">
                      {/* Standard portion = defaultServingPct */}
                      <button
                        onClick={() => handleLog(recipe, def)}
                        disabled={isLogging}
                        className="flex-1 flex flex-col items-center gap-0.5 bg-amber-600/15 hover:bg-amber-600/25 disabled:opacity-40 border border-amber-600/30 rounded-xl py-2 text-[10px] font-medium text-amber-300 transition-colors"
                      >
                        {isLogging ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <>
                            <span className="font-semibold">{def}%</span>
                            <span className="text-slate-500">{defM.cal} קק"ל</span>
                            <span className="text-[9px] text-amber-400/70">מנה סטנדרטית</span>
                          </>
                        )}
                      </button>

                      {/* Half portion */}
                      <button
                        onClick={() => handleLog(recipe, 50)}
                        disabled={isLogging}
                        className="flex-1 flex flex-col items-center gap-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 rounded-xl py-2 text-[10px] font-medium text-slate-300 transition-colors"
                      >
                        <>
                          <span className="font-semibold">50%</span>
                          <span className="text-slate-500">{halfM.cal} קק"ל</span>
                          <span className="text-[9px] text-slate-500">חצי מנה</span>
                        </>
                      </button>

                      {/* Custom % */}
                      <div className="flex-1 flex flex-col gap-1">
                        <input
                          type="text"
                          value={customPctMap[recipe.id] ?? ""}
                          onChange={(e) =>
                            setCustomPctMap((m) => ({ ...m, [recipe.id]: e.target.value }))
                          }
                          placeholder="% / 1/8"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-[10px] text-center focus:outline-none focus:border-amber-500/60 placeholder:text-slate-600"
                          dir="ltr"
                        />
                        <button
                          onClick={() => handleCustomLog(recipe)}
                          disabled={isLogging || !parsePct(customPctMap[recipe.id] ?? "")}
                          className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 rounded-xl py-1 text-[10px] font-medium text-slate-400 hover:text-amber-300 transition-colors"
                        >
                          מותאם אישית
                        </button>
                      </div>
                    </div>

                    {/* Macro preview for custom pct */}
                    {customPctMap[recipe.id] && parsePct(customPctMap[recipe.id]) && (
                      <p className="text-[10px] text-slate-500" dir="rtl">
                        {parsePct(customPctMap[recipe.id])!.toFixed(1)}% ={" "}
                        <span className="text-orange-400 font-semibold">
                          {fracMacros(recipe, parsePct(customPctMap[recipe.id])!).cal} קק"ל
                        </span>
                        {" · "}
                        <span className="text-indigo-400 font-semibold">
                          {fracMacros(recipe, parsePct(customPctMap[recipe.id])!).prot}ג' ח'
                        </span>
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Create recipe toggle */}
          <button
            onClick={() => setShowCreator((s) => !s)}
            className="w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-amber-600/50 rounded-xl py-2 text-xs text-slate-500 hover:text-amber-300 transition-colors"
          >
            <Plus size={13} />
            {showCreator ? "סגור טופס מתכון" : "צור מתכון חדש"}
          </button>

          {showCreator && (
            <RecipeCreator
              onSaved={() => {
                fetchRecipes()
                setShowCreator(false)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
