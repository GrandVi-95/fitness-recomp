"use client"

import { useState, useMemo } from "react"
import { Sparkles, Loader2, RefreshCw, ChefHat, ClipboardPaste } from "lucide-react"
import { cn } from "@/lib/utils"

const MEAL_TYPES = [
  { value: "breakfast", label: "בוקר" },
  { value: "lunch",     label: "צהריים" },
  { value: "dinner",    label: "ערב" },
  { value: "snack",     label: "חטיף" },
] as const

const FLAVOR_PROFILES = [
  { value: "savory",   label: "מלוח" },
  { value: "sweet",    label: "מתוק" },
  { value: "surprise", label: "הפתיעו אותי" },
] as const

type MealTypeValue = typeof MEAL_TYPES[number]["value"]
type FlavorValue   = typeof FLAVOR_PROFILES[number]["value"]

interface MealMacros {
  calories: number
  protein: number
  carbs: number
  fat: number
  sugar: number
}

interface MealData {
  name: string
  ingredients: Array<{ quantity: string; name: string }>
  preparation: string
  macros: MealMacros
}

interface SuggestionData {
  meals: MealData[]
  warning?: string
}

interface Props {
  remaining: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  dietaryPreference: string
  onUseSuggestion?: (ingredientsText: string) => void
}

function extractIngredients(suggestion: string): string {
  try {
    const data = JSON.parse(suggestion) as SuggestionData
    return data.meals
      .flatMap((m) => m.ingredients.map((i) => `${i.quantity} ${i.name}`))
      .join(", ")
  } catch {
    return suggestion
  }
}

export default function MealSuggester({ remaining, dietaryPreference, onUseSuggestion }: Props) {
  const [suggestion, setSuggestion]       = useState<string | null>(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [ingredients, setIngredients]     = useState("")
  const [mealType, setMealType]           = useState<MealTypeValue>("dinner")
  const [flavorProfile, setFlavorProfile] = useState<FlavorValue>("savory")

  const parsedSuggestion = useMemo<SuggestionData | null>(() => {
    if (!suggestion) return null
    try {
      return JSON.parse(suggestion) as SuggestionData
    } catch {
      return null
    }
  }, [suggestion])

  const suggest = async (withIngredients?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ai/suggest-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: withIngredients ?? "",
          remaining,
          mealType,
          flavorProfile,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "שגיאה בהצעת הארוחה — נסה שוב")
        return
      }
      setSuggestion(data.suggestion)
    } catch {
      setError("שגיאת רשת — בדוק את החיבור שלך")
    } finally {
      setLoading(false)
    }
  }

  const macroLine =
    remaining.calories > 0
      ? `נותרו ${remaining.calories} קק"ל · ${remaining.protein} גר' חלבון`
      : "הגעת ליעד הקלוריות היום"

  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <ChefHat size={15} className="text-violet-400" /> הצעת ארוחה חכמה
        </h2>
        <p className="text-[11px] text-slate-500">{macroLine}</p>
      </div>

      {/* Suggestion result */}
      {parsedSuggestion && (
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 space-y-4">
          {parsedSuggestion.meals.map((meal, i) => (
            <div
              key={i}
              className={cn(i > 0 && "pt-4 border-t border-violet-500/20")}
              dir="rtl"
            >
              {parsedSuggestion.meals.length > 1 && (
                <p className="text-[11px] text-violet-400 font-semibold mb-1">ארוחה {i + 1}</p>
              )}
              <p className="text-sm font-bold text-slate-100 mb-2">{meal.name}</p>

              <ul className="space-y-0.5 mb-2">
                {meal.ingredients.map((ing, j) => (
                  <li key={j} className="text-xs text-slate-400">
                    <span className="text-slate-600 ml-1">—</span>
                    {ing.quantity} {ing.name}
                  </li>
                ))}
              </ul>

              <p className="text-xs text-slate-400 leading-relaxed mb-2.5">{meal.preparation}</p>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
                <span className="text-orange-400">{meal.macros.calories} קק"ל</span>
                <span className="text-indigo-400">{meal.macros.protein}ג' חלב'</span>
                <span className="text-emerald-400">{meal.macros.carbs}ג' פחמ'</span>
                <span className="text-amber-400">{meal.macros.fat}ג' שומן</span>
                <span className="text-rose-400">{meal.macros.sugar}ג' סוכר</span>
              </div>
            </div>
          ))}

          {parsedSuggestion.warning && (
            <p className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 leading-relaxed" dir="rtl">
              ⚠️ {parsedSuggestion.warning}
            </p>
          )}

          {onUseSuggestion && (
            <button
              onClick={() => onUseSuggestion(extractIngredients(suggestion!))}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 rounded-lg py-2 text-xs font-semibold text-emerald-50 transition-colors"
            >
              <ClipboardPaste size={13} />
              השתמש בהצעה זו
            </button>
          )}
        </div>
      )}

      {/* Meal type selector */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-slate-500 font-medium">סוג ארוחה</p>
        <div className="flex gap-1.5 flex-wrap">
          {MEAL_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setMealType(t.value)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                mealType === t.value
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Flavor profile selector */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-slate-500 font-medium">פרופיל טעם</p>
        <div className="flex gap-1.5 flex-wrap">
          {FLAVOR_PROFILES.map((f) => (
            <button
              key={f.value}
              onClick={() => setFlavorProfile(f.value)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                flavorProfile === f.value
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary CTA */}
      <button
        onClick={() => suggest()}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-2.5 text-sm font-semibold transition-colors"
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : parsedSuggestion ? (
          <RefreshCw size={14} />
        ) : (
          <Sparkles size={14} />
        )}
        {loading ? "מייצר הצעה..." : parsedSuggestion ? "הצע אפשרות אחרת" : "הצע לי ארוחה"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-[11px] text-slate-600">או</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* Ingredients section */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500 font-medium">מרכיבים שיש לי בבית</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ingredients.trim() && !loading) suggest(ingredients.trim())
            }}
            placeholder="לדוגמה: ביצים, גבינה, ברוקולי..."
            dir="rtl"
            disabled={loading}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => suggest(ingredients.trim())}
            disabled={loading || !ingredients.trim()}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-3 py-2 text-sm font-medium transition-colors shrink-0 text-slate-200"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            הצע
          </button>
        </div>
        <p className="text-[11px] text-slate-600">הצעה מותאמת למרכיבים שברשותך</p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{error}</p>
      )}
    </div>
  )
}
