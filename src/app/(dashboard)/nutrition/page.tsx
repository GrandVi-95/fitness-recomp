"use client"

import { useState, useEffect, useCallback } from "react"
import MealSuggester from "@/components/dashboard/MealSuggester"
import {
  Send,
  Flame,
  ChevronLeft,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────
// טיפוסים
// ─────────────────────────────────────────────────────────────

interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface FoodItem {
  id: string
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface TodayData {
  totals: MacroTotals
  byMealType: Record<string, FoodItem[]>
  targets: MacroTotals
}

// ─────────────────────────────────────────────────────────────
// מוגדר מראש: ארוחות
// ─────────────────────────────────────────────────────────────

const MEALS = [
  { type: "breakfast",    label: "ארוחת בוקר",  emoji: "🌅" },
  { type: "lunch",        label: "צהריים",       emoji: "☀️" },
  { type: "dinner",       label: "ארוחת ערב",   emoji: "🌙" },
  { type: "snack",        label: "חטיפים",       emoji: "🍎" },
  { type: "pre_workout",  label: "לפני אימון",  emoji: "⚡" },
  { type: "post_workout", label: "לאחר אימון",  emoji: "💪" },
] as const

type MealType = (typeof MEALS)[number]["type"]

// ─────────────────────────────────────────────────────────────
// טבעת מאקרו — SVG
// ─────────────────────────────────────────────────────────────

function MacroRing({
  label,
  current,
  target,
  unit,
  color,
  size = "sm",
  glow = false,
}: {
  label: string
  current: number
  target: number
  unit: string
  color: string
  size?: "sm" | "lg"
  glow?: boolean
}) {
  const R = size === "lg" ? 44 : 30
  const SW = size === "lg" ? 7 : 5
  const dim = (R + SW + 4) * 2
  const CIRCUM = 2 * Math.PI * R
  const pct = Math.min((current / target) * 100, 100)
  const offset = CIRCUM * (1 - pct / 100)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="-rotate-90">
          <circle cx={dim / 2} cy={dim / 2} r={R} fill="none" stroke="#1e293b" strokeWidth={SW} />
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={CIRCUM}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.6s ease",
              filter: glow ? `drop-shadow(0 0 4px ${color})` : "none",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-black tabular-nums leading-none",
              size === "lg" ? "text-xl" : "text-sm"
            )}
          >
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <p className={cn("text-slate-400 font-medium", size === "lg" ? "text-xs" : "text-[10px]")}>
        {label}
      </p>
      <p className={cn("font-bold", size === "lg" ? "text-sm" : "text-[11px]")}>
        {Math.round(current)}
        <span className="text-slate-500 font-normal text-[10px]"> {unit}</span>
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// שורת מזון — עם עריכה ומחיקה
// ─────────────────────────────────────────────────────────────

function FoodItemRow({
  item,
  mealType,
  isEditing,
  isDeleting,
  onEditStart,
  onEditSave,
  onEditCancel,
  onDelete,
}: {
  item: FoodItem
  mealType: string
  isEditing: boolean
  isDeleting: boolean
  onEditStart: () => void
  onEditSave: (qty: number) => void
  onEditCancel: () => void
  onDelete: () => void
}) {
  const [qtyStr, setQtyStr] = useState(String(item.quantity))

  // Keep local input in sync if parent item changes
  useEffect(() => {
    if (!isEditing) setQtyStr(String(item.quantity))
  }, [item.quantity, isEditing])

  const qty = parseFloat(qtyStr) || 0
  const ratio = qty > 0 && item.quantity > 0 ? qty / item.quantity : 0
  const previewCal = Math.round(item.calories * ratio)
  const previewProt = Math.round(item.protein * ratio * 10) / 10

  if (isEditing) {
    return (
      <div className="py-2 space-y-2">
        {/* שם + ביטול */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-200 font-medium truncate flex-1 me-2">
            {item.name}
          </span>
          <button
            onClick={onEditCancel}
            className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            aria-label="ביטול"
          >
            <X size={14} />
          </button>
        </div>

        {/* שדה כמות + שמירה */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={qtyStr}
            min={0.1}
            step={1}
            onChange={(e) => setQtyStr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && qty > 0) onEditSave(qty)
              if (e.key === "Escape") onEditCancel()
            }}
            className="w-20 bg-slate-800 border border-indigo-500/60 rounded-lg px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
            autoFocus
            dir="ltr"
          />
          <span className="text-xs text-slate-500 shrink-0">{item.unit}</span>
          {qty > 0 && (
            <span className="text-xs text-slate-500 flex-1">
              ≈{" "}
              <span className="text-orange-400">{previewCal} קק"ל</span>
              {" · "}
              <span className="text-indigo-400">{previewProt} ח'</span>
            </span>
          )}
          <button
            onClick={() => qty > 0 && onEditSave(qty)}
            disabled={qty <= 0}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors shrink-0"
            aria-label="שמור"
          >
            <Check size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 transition-opacity",
        isDeleting && "opacity-30 pointer-events-none"
      )}
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-300 truncate block">{item.name}</span>
        <span className="text-xs text-slate-600">
          {item.quantity} {item.unit}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-slate-500">{Math.round(item.calories)} קק"ל</span>
        <span className="text-xs text-indigo-400 font-medium">{Math.round(item.protein)} ח'</span>

        <button
          onClick={onEditStart}
          className="p-1 rounded text-slate-600 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
          aria-label="ערוך"
        >
          <Pencil size={12} />
        </button>

        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="מחק"
        >
          {isDeleting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Trash2 size={12} />
          )}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// עמוד תזונה
// ─────────────────────────────────────────────────────────────

export default function NutritionPage() {
  const [todayData, setTodayData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)

  const [nlpText, setNlpText] = useState("")
  const [selectedMeal, setSelectedMeal] = useState<MealType>("snack")
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [lastAdded, setLastAdded] = useState<{ items: FoodItem[]; totals: MacroTotals } | null>(
    null
  )

  const [openMeal, setOpenMeal] = useState<string | null>(null)
  const [dietaryPreference, setDietaryPreference] = useState("vegetarian")

  // Edit / delete state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  // ── שליפת נתוני היום ────────────────────────────────────
  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch("/api/nutrition/today")
      if (res.ok) setTodayData(await res.json())
    } catch (e) {
      console.error("Failed to fetch today's nutrition:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchToday()
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (d.dietaryPreference) setDietaryPreference(d.dietaryPreference) })
      .catch(() => {})
  }, [fetchToday])

  // ── שליחת קלט NLP ───────────────────────────────────────
  const handleParse = async () => {
    if (!nlpText.trim() || parsing) return
    setParsing(true)
    setParseError(null)
    setLastAdded(null)

    try {
      const res = await fetch("/api/nutrition/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlpText, mealType: selectedMeal }),
      })
      const data = await res.json()

      if (!res.ok) {
        setParseError(data.error ?? "שגיאה בעיבוד")
        return
      }

      setLastAdded({ items: data.items, totals: data.totals })
      setNlpText("")
      await fetchToday()
    } catch {
      setParseError("שגיאת חיבור — נסה שוב")
    } finally {
      setParsing(false)
    }
  }

  // ── עריכת פריט ──────────────────────────────────────────
  const handleEditSave = async (item: FoodItem, mealType: string, newQty: number) => {
    const ratio = newQty / item.quantity
    const updated: FoodItem = {
      ...item,
      quantity: newQty,
      calories: Math.round(item.calories * ratio),
      protein:  Math.round(item.protein  * ratio * 10) / 10,
      carbs:    Math.round(item.carbs    * ratio),
      fat:      Math.round(item.fat      * ratio * 10) / 10,
    }

    setEditingId(null)

    // Optimistic update
    setTodayData((prev) => {
      if (!prev) return prev
      const newByMealType = { ...prev.byMealType }
      newByMealType[mealType] = (newByMealType[mealType] ?? []).map((i) =>
        i.id === item.id ? updated : i
      )
      const diff = {
        calories: updated.calories - item.calories,
        protein:  updated.protein  - item.protein,
        carbs:    updated.carbs    - item.carbs,
        fat:      updated.fat      - item.fat,
      }
      return {
        ...prev,
        byMealType: newByMealType,
        totals: {
          calories: Math.round(prev.totals.calories + diff.calories),
          protein:  Math.round((prev.totals.protein + diff.protein) * 10) / 10,
          carbs:    Math.round(prev.totals.carbs + diff.carbs),
          fat:      Math.round((prev.totals.fat + diff.fat) * 10) / 10,
        },
      }
    })

    const res = await fetch(`/api/nutrition/items/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: newQty }),
    })
    if (!res.ok) await fetchToday() // revert on error
  }

  // ── מחיקת פריט ──────────────────────────────────────────
  const handleDelete = async (item: FoodItem, mealType: string) => {
    setDeletingIds((prev) => new Set([...prev, item.id]))

    // Optimistic update
    setTodayData((prev) => {
      if (!prev) return prev
      const newByMealType = { ...prev.byMealType }
      newByMealType[mealType] = (newByMealType[mealType] ?? []).filter((i) => i.id !== item.id)
      return {
        ...prev,
        byMealType: newByMealType,
        totals: {
          calories: Math.round(prev.totals.calories - item.calories),
          protein:  Math.round((prev.totals.protein - item.protein) * 10) / 10,
          carbs:    Math.round(prev.totals.carbs - item.carbs),
          fat:      Math.round((prev.totals.fat - item.fat) * 10) / 10,
        },
      }
    })

    const res = await fetch(`/api/nutrition/items/${item.id}`, { method: "DELETE" })

    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })

    if (!res.ok) await fetchToday() // revert on error
  }

  const targets = todayData?.targets ?? { calories: 2600, protein: 185, carbs: 340, fat: 80 }
  const totals = todayData?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const byMealType = todayData?.byMealType ?? {}

  const calRemain = targets.calories - totals.calories
  const protRemain = targets.protein - totals.protein

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* ── כותרת ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold">תזונה יומית</h1>
        <p className="text-sm text-slate-400 mt-0.5">מעקב מאקרו צמחוני</p>
      </div>

      {/* ╔══════════════════════════════════════════════════╗
          ║            כרטיס סיכום מאקרו יומי               ║
          ╚══════════════════════════════════════════════════╝ */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        {/* סרגל קלוריות */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-200 font-semibold flex items-center gap-1.5">
              <Flame size={13} className="text-orange-400" />
              {totals.calories} קק"ל
            </span>
            <span className={calRemain >= 0 ? "text-slate-400" : "text-red-400"}>
              {calRemain >= 0 ? `נותרו ${calRemain}` : `ביתר ${Math.abs(calRemain)}`} קק"ל
            </span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min((totals.calories / targets.calories) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">יעד: {targets.calories} קק"ל</p>
        </div>

        {/* טבעות מאקרו */}
        <div className="flex items-end justify-around pt-1">
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] text-indigo-400 font-bold mb-0.5">יעד עיקרי</div>
            <MacroRing
              label="חלבון"
              current={totals.protein}
              target={targets.protein}
              unit="גר'"
              color="#6366f1"
              size="lg"
              glow
            />
            <p className="text-[10px] text-indigo-400 mt-0.5">
              {Math.max(0, Math.round(protRemain))} גר' נותרו
            </p>
          </div>
          <div className="flex gap-4">
            <MacroRing
              label="פחמימות"
              current={totals.carbs}
              target={targets.carbs}
              unit="גר'"
              color="#22c55e"
              size="sm"
            />
            <MacroRing
              label="שומן"
              current={totals.fat}
              target={targets.fat}
              unit="גר'"
              color="#f59e0b"
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* ╔══════════════════════════════════════════════════╗
          ║          קלט NLP — רישום מזון חופשי              ║
          ╚══════════════════════════════════════════════════╝ */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">רישום מהיר בעברית חופשית</p>
          <p className="text-xs text-slate-500 mt-0.5">
            לדוגמה:{" "}
            <span className="text-indigo-300 italic">
              "אכלתי 200 גרם טופו עם אורז מלא ואדממה"
            </span>
          </p>
        </div>

        {/* בחירת ארוחה */}
        <div className="flex gap-1.5 flex-wrap">
          {MEALS.map(({ type, label, emoji }) => (
            <button
              key={type}
              onClick={() => setSelectedMeal(type)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                selectedMeal === type
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-transparent border-slate-800 text-slate-500 hover:border-slate-600"
              )}
            >
              <span>{emoji}</span> {label}
            </button>
          ))}
        </div>

        {/* שדה קלט */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-indigo-500 transition-colors">
            <textarea
              rows={2}
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleParse()
                }
              }}
              placeholder="מה אכלת?"
              disabled={parsing}
              className="w-full bg-transparent text-sm focus:outline-none placeholder:text-slate-600 disabled:opacity-50 resize-none"
              dir="rtl"
            />
          </div>
          <button
            onClick={handleParse}
            disabled={!nlpText.trim() || parsing}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl px-4 h-14 flex items-center justify-center transition-colors shrink-0"
            aria-label="שלח"
          >
            {parsing ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>

        {/* שגיאה */}
        {parseError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">
            <AlertCircle size={14} className="shrink-0" />
            {parseError}
          </div>
        )}

        {/* תוצאת ניתוח */}
        {lastAdded && (
          <div className="bg-green-950/40 border border-green-500/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-green-400 font-semibold">
              <CheckCircle2 size={14} />
              נוסף בהצלחה — {lastAdded.items.length} פריטים
            </div>
            <div className="flex gap-3 text-xs text-slate-400">
              <span className="text-orange-400 font-bold">
                {Math.round(lastAdded.totals.calories)} קק"ל
              </span>
              <span className="text-indigo-400 font-bold">
                {Math.round(lastAdded.totals.protein)} גר' חלבון
              </span>
              <span className="text-green-400">{Math.round(lastAdded.totals.carbs)} גר' פחמ'</span>
              <span className="text-amber-400">{Math.round(lastAdded.totals.fat)} גר' שומן</span>
            </div>
            <ul className="space-y-0.5">
              {lastAdded.items.map((item, i) => (
                <li key={i} className="text-xs text-slate-300">
                  · {item.name}{" "}
                  <span className="text-slate-500">
                    ({item.quantity} {item.unit})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── הצעת ארוחה ───────────────────────────────────── */}
      <MealSuggester
        remaining={{
          calories: Math.max(0, targets.calories - totals.calories),
          protein:  Math.max(0, Math.round((targets.protein - totals.protein) * 10) / 10),
          carbs:    Math.max(0, targets.carbs - totals.carbs),
          fats:     Math.max(0, Math.round((targets.fat - totals.fat) * 10) / 10),
        }}
        dietaryPreference={dietaryPreference}
      />

      {/* ── קטעי ארוחות ──────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {MEALS.map(({ type, label, emoji }) => {
            const items = byMealType[type] ?? []
            const mealCal = items.reduce((s, i) => s + i.calories, 0)
            const mealProt = items.reduce((s, i) => s + i.protein, 0)
            const isOpen = openMeal === type

            return (
              <div key={type} className="bg-slate-900 rounded-2xl overflow-hidden">
                {/* כותרת ארוחה */}
                <button
                  onClick={() => setOpenMeal(isOpen ? null : type)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{emoji}</span>
                    <span className="text-sm font-semibold">{label}</span>
                    {items.length > 0 && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 rounded-full px-1.5 py-0.5 font-medium">
                        {items.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {items.length > 0 && (
                      <div className="flex gap-2 text-xs">
                        <span className="text-slate-400">{Math.round(mealCal)} קק"ל</span>
                        <span className="text-indigo-400 font-medium">
                          {Math.round(mealProt)} גר' ח'
                        </span>
                      </div>
                    )}
                    {items.length === 0 && <span className="text-xs text-slate-600">ריק</span>}
                    <ChevronLeft
                      size={16}
                      className={cn(
                        "text-slate-600 transition-transform duration-200",
                        isOpen ? "rotate-90" : "rtl:-rotate-180"
                      )}
                    />
                  </div>
                </button>

                {/* תוכן ארוחה */}
                {isOpen && (
                  <div className="px-4 pb-3 border-t border-slate-800">
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-600 py-2">עדיין לא נרשמו מאכלים.</p>
                    ) : (
                      <div className="divide-y divide-slate-800/60">
                        {items.map((item) => (
                          <FoodItemRow
                            key={item.id}
                            item={item}
                            mealType={type}
                            isEditing={editingId === item.id}
                            isDeleting={deletingIds.has(item.id)}
                            onEditStart={() => setEditingId(item.id)}
                            onEditSave={(qty) => handleEditSave(item, type, qty)}
                            onEditCancel={() => setEditingId(null)}
                            onDelete={() => handleDelete(item, type)}
                          />
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setSelectedMeal(type)
                        document
                          .querySelector<HTMLTextAreaElement>('textarea[placeholder="מה אכלת?"]')
                          ?.focus()
                      }}
                      className="w-full mt-2 flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-indigo-600/50 rounded-xl py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <Plus size={13} /> הוסף ל{label}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="h-2" />
    </div>
  )
}
