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
  protein:  number
  carbs:    number
  fat:      number
  sugar:    number
}

interface MealData {
  name:        string
  ingredients: Array<{ quantity: string; name: string }>
  preparation: string
  macros:      MealMacros
}

interface SuggestionData {
  meals:   MealData[]
  warning?: string
}

interface Props {
  remaining: {
    calories: number
    protein:  number
    carbs:    number
    fats:     number
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
        method:  "POST",
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
    <div className="bg-white rounded-[2rem] p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ChefHat size={15} className="text-violet-500" /> הצעת ארוחה חכמה
        </h2>
        <p className="text-[11px] text-gray-400">{macroLine}</p>
      </div>

      {/* Suggestion result */}
      {parsedSuggestion && (
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 space-y-4">
          {parsedSuggestion.meals.map((meal, i) => (
            <div
              key={i}
              className={cn(i > 0 && "pt-4 border-t border-violet-100")}
              dir="rtl"
            >
              {parsedSuggestion.meals.length > 1 && (
                <p className="text-[11px] text-violet-600 font-semibold mb-1">ארוחה {i + 1}</p>
              )}
              <p className="text-sm font-bold text-gray-900 mb-2">{meal.name}</p>

              <ul className="space-y-0.5 mb-2">
                {meal.ingredients.map((ing, j) => (
                  <li key={j} className="text-xs text-gray-500">
                    <span className="text-gray-300 ml-1">—</span>
                    {ing.quantity} {ing.name}
                  </li>
                ))}
              </ul>

              {meal.preparation && (
                <p className="text-xs text-gray-500 leading-relaxed mb-2.5">{meal.preparation}</p>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
                <span className="text-[#FF9500]">{meal.macros.calories} קק"ל</span>
                <span className="text-[#007AFF]">{meal.macros.protein}ג' חלב'</span>
                <span className="text-[#34C759]">{meal.macros.carbs}ג' פחמ'</span>
                <span className="text-amber-600">{meal.macros.fat}ג' שומן</span>
                <span className="text-rose-500">{meal.macros.sugar}ג' סוכר</span>
              </div>
            </div>
          ))}

          {parsedSuggestion.warning && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed" dir="rtl">
              ⚠️ {parsedSuggestion.warning}
            </p>
          )}

          {onUseSuggestion && (
            <button
              onClick={() => onUseSuggestion(extractIngredients(suggestion!))}
              className="w-full flex items-center justify-center gap-2 bg-[#34C759] hover:opacity-90 rounded-full py-2.5 text-xs font-semibold text-white active:scale-95 transition"
            >
              <ClipboardPaste size={13} />
              השתמש בהצעה זו
            </button>
          )}
        </div>
      )}

      {/* Meal type selector */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-400 font-medium">סוג ארוחה</p>
        <div className="flex gap-1.5 flex-wrap">
          {MEAL_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setMealType(t.value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                mealType === t.value
                  ? "bg-violet-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Flavor profile selector */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-400 font-medium">פרופיל טעם</p>
        <div className="flex gap-1.5 flex-wrap">
          {FLAVOR_PROFILES.map((f) => (
            <button
              key={f.value}
              onClick={() => setFlavorProfile(f.value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                flavorProfile === f.value
                  ? "bg-violet-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
        className="w-full flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-full py-3 text-sm font-semibold text-white active:scale-95 transition"
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
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-[11px] text-gray-300">או</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Ingredients section */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium">מרכיבים שיש לי בבית</p>
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
            className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => suggest(ingredients.trim())}
            disabled={loading || !ingredients.trim()}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-full px-3 py-2 text-sm font-medium transition-colors shrink-0 text-gray-700"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            הצע
          </button>
        </div>
        <p className="text-[11px] text-gray-300">הצעה מותאמת למרכיבים שברשותך</p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}
    </div>
  )
}
