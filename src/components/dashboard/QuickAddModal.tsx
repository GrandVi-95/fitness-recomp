"use client"

import { useState } from "react"
import { X, Loader2, Check, AlertCircle, ClipboardPaste, Copy, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { MACRO_PROMPT_LINE, atwaterMismatch, parseMacrosText, type ParsedMeal } from "@/lib/macroParser"

// ─── Quick add: log a meal by name + numbers (e.g. planned in ChatGPT) ─────
// No AI call: the user types the macros, or pastes ChatGPT's answer and the
// pure parser in lib/macroParser.ts fills the form. Sub-nutrients left blank
// are logged as unknown (null), never 0.

const MEAL_OPTIONS = [
  { type: "breakfast",    label: "ארוחת בוקר" },
  { type: "lunch",        label: "צהריים" },
  { type: "dinner",       label: "ארוחת ערב" },
  { type: "snack",        label: "חטיפים" },
  { type: "pre_workout",  label: "לפני אימון" },
  { type: "post_workout", label: "לאחר אימון" },
] as const

type NumField = "calories" | "protein" | "carbs" | "fat" | "sugar" | "fiber" | "saturatedFat"

const REQUIRED: { key: NumField; label: string }[] = [
  { key: "calories", label: 'קלוריות (קק"ל)' },
  { key: "protein",  label: "חלבון (גר')" },
  { key: "carbs",    label: "פחמימות (גר')" },
  { key: "fat",      label: "שומן (גר')" },
]
const OPTIONAL: { key: NumField; label: string }[] = [
  { key: "sugar",        label: "סוכר" },
  { key: "fiber",        label: "סיבים" },
  { key: "saturatedFat", label: "שומן רווי" },
]

interface Entry {
  id: number
  name: string
  mealType: string
  values: Record<NumField, string>
  saveFavorite: boolean
}

let nextId = 1
function toEntry(meal: ParsedMeal | null, mealType: string): Entry {
  const v = (n: number | null | undefined) => (n == null ? "" : String(n))
  return {
    id: nextId++,
    name: meal?.name ?? "",
    mealType,
    values: {
      calories: v(meal?.calories), protein: v(meal?.protein), carbs: v(meal?.carbs), fat: v(meal?.fat),
      sugar: v(meal?.sugar), fiber: v(meal?.fiber), saturatedFat: v(meal?.saturatedFat),
    },
    saveFavorite: false,
  }
}

function num(s: string): number | null {
  if (s.trim() === "") return null
  const n = parseFloat(s.replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function entryErrors(e: Entry): string | null {
  if (!e.name.trim()) return "חסר שם לארוחה"
  for (const f of REQUIRED) {
    if (num(e.values[f.key]) == null) return `חסר ערך: ${f.label}`
  }
  for (const f of OPTIONAL) {
    if (e.values[f.key].trim() !== "" && num(e.values[f.key]) == null) return `ערך לא תקין: ${f.label}`
  }
  return null
}

interface Props {
  mealType: string
  remaining: { calories: number; protein: number }
  onClose: () => void
  onLogged: () => void | Promise<void>
}

export default function QuickAddModal({ mealType, remaining, onClose, onLogged }: Props) {
  const [entries, setEntries]   = useState<Entry[]>(() => [toEntry(null, mealType)])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [notice, setNotice]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [copied, setCopied]     = useState(false)

  const update = (id: number, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const setValue = (id: number, key: NumField, value: string) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, values: { ...e.values, [key]: value } } : e)))

  const handleParse = () => {
    const meals = parseMacrosText(pasteText)
    if (meals.length === 0) {
      setNotice(null)
      setError("לא נמצאו ערכים תזונתיים בטקסט. ודא שיש בו קלוריות/חלבון, או השתמש בהנחיה שלמטה.")
      return
    }
    setError(null)
    // Keep a name the user already typed when a single unnamed meal is parsed.
    const typedName = entries.length === 1 ? entries[0].name : ""
    setEntries(meals.map((m, i) => toEntry({ ...m, name: m.name || (i === 0 ? typedName : "") }, mealType)))
    setNotice(meals.length > 1 ? `נמצאו ${meals.length} ארוחות — בדוק ושמור` : "הערכים מולאו — בדוק ושמור")
    setPasteOpen(false)
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MACRO_PROMPT_LINE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("לא ניתן להעתיק — סמן והעתק את ההנחיה ידנית")
    }
  }

  const totals = entries.reduce(
    (a, e) => ({ calories: a.calories + (num(e.values.calories) ?? 0), protein: a.protein + (num(e.values.protein) ?? 0) }),
    { calories: 0, protein: 0 },
  )

  const handleSave = async () => {
    const firstError = entries.map(entryErrors).find(Boolean)
    if (firstError) {
      setError(firstError)
      return
    }
    setError(null)
    setSaving(true)
    const failed: Entry[] = []
    for (const e of entries) {
      const item = {
        name:     e.name.trim(),
        quantity: 1,
        unit:     "מנה",
        calories: num(e.values.calories)!,
        protein:  num(e.values.protein)!,
        carbs:    num(e.values.carbs)!,
        fat:      num(e.values.fat)!,
        // blank → unknown (null), never 0
        sugar:        num(e.values.sugar),
        fiber:        num(e.values.fiber),
        saturatedFat: num(e.values.saturatedFat),
      }
      try {
        const res = await fetch("/api/nutrition/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealType: e.mealType, directItems: [item] }),
        })
        if (!res.ok) {
          failed.push(e)
          continue
        }
        if (e.saveFavorite) {
          // A favorite = a recipe whose whole batch is one serving.
          await fetch("/api/recipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name:              item.name,
              ingredients:       "נוסף ידנית (תכנון ארוחה)",
              totalCalories:     item.calories,
              totalProtein:      item.protein,
              totalCarbs:        item.carbs,
              totalFat:          item.fat,
              ...(item.sugar != null ? { totalSugar: item.sugar } : {}),
              defaultServingPct: 100,
            }),
          }).catch(() => null)
        }
      } catch {
        failed.push(e)
      }
    }
    setSaving(false)
    await onLogged()
    if (failed.length > 0) {
      setEntries(failed)
      setNotice(null)
      setError(`${failed.length} ארוחות לא נשמרו — נסה שוב`)
    } else {
      onClose()
    }
  }

  const inputCls =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#007AFF]"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white border border-gray-100 rounded-2xl p-4 space-y-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#007AFF] flex items-center gap-1.5">
            <Plus size={15} /> הוספה מהירה
          </p>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="סגור"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Paste from ChatGPT ───────────────────────────── */}
        {pasteOpen ? (
          <div className="space-y-2">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              maxLength={20000}
              rows={6}
              placeholder="הדבק כאן את התשובה מ-ChatGPT…"
              className={cn(inputCls, "resize-none text-xs leading-relaxed")}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleParse}
                disabled={!pasteText.trim()}
                className="flex-1 rounded-full bg-[#007AFF] text-white text-xs font-semibold py-2 disabled:opacity-40"
              >
                מלא את הטופס
              </button>
              <button
                onClick={() => setPasteOpen(false)}
                className="rounded-full bg-gray-100 text-gray-600 text-xs font-semibold px-4 py-2"
              >
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setPasteOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 hover:border-[#007AFF]/50 text-gray-500 text-xs font-medium py-2.5 transition-colors"
          >
            <ClipboardPaste size={13} /> הדבק תשובה מ-ChatGPT
          </button>
        )}

        {notice && (
          <p className="text-xs text-[#34C759] flex items-center gap-1.5">
            <Check size={12} /> {notice}
          </p>
        )}

        {/* ── Entries ──────────────────────────────────────── */}
        {entries.map((e, idx) => {
          const mismatch = atwaterMismatch({
            calories: num(e.values.calories),
            protein:  num(e.values.protein),
            carbs:    num(e.values.carbs),
            fat:      num(e.values.fat),
          })
          return (
            <div key={e.id} className={cn("space-y-2.5", entries.length > 1 && "border border-gray-100 rounded-xl p-3")}>
              {entries.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-400">ארוחה {idx + 1}</span>
                  <button
                    onClick={() => setEntries((prev) => prev.filter((x) => x.id !== e.id))}
                    className="p-1 text-gray-300 hover:text-[#FF3B30]"
                    aria-label="הסר ארוחה"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
              <input
                value={e.name}
                onChange={(ev) => update(e.id, { name: ev.target.value })}
                maxLength={200}
                placeholder="שם הארוחה — למשל: אורז עם בשר צמחי"
                className={inputCls}
              />
              <select
                value={e.mealType}
                onChange={(ev) => update(e.id, { mealType: ev.target.value })}
                className={inputCls}
              >
                {MEAL_OPTIONS.map((m) => (
                  <option key={m.type} value={m.type}>{m.label}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                {REQUIRED.map((f) => (
                  <label key={f.key} className="space-y-1">
                    <span className="text-[11px] text-gray-500">{f.label}</span>
                    <input
                      inputMode="decimal"
                      value={e.values[f.key]}
                      onChange={(ev) => setValue(e.id, f.key, ev.target.value)}
                      className={inputCls}
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {OPTIONAL.map((f) => (
                  <label key={f.key} className="space-y-1">
                    <span className="text-[11px] text-gray-400">{f.label} (רשות)</span>
                    <input
                      inputMode="decimal"
                      value={e.values[f.key]}
                      onChange={(ev) => setValue(e.id, f.key, ev.target.value)}
                      placeholder="?"
                      className={inputCls}
                    />
                  </label>
                ))}
              </div>
              {mismatch != null && (
                <p className="text-[11px] text-[#FF9500] flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  לפי המאקרו יוצא ~{mismatch} קק&quot;ל ולא {e.values.calories}. כדאי לבדוק את המספרים (אפשר לשמור בכל זאת).
                </p>
              )}
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={e.saveFavorite}
                  onChange={(ev) => update(e.id, { saveFavorite: ev.target.checked })}
                />
                שמור כמועדף (יופיע במתכונים לרישום בלחיצה)
              </label>
            </div>
          )
        })}

        <button
          onClick={() => setEntries((prev) => [...prev, toEntry(null, mealType)])}
          className="text-xs font-medium text-[#007AFF] flex items-center gap-1"
        >
          <Plus size={12} /> הוסף ארוחה נוספת
        </button>

        {/* ── Fit against today ─────────────────────────────── */}
        {totals.calories > 0 && (
          <p className="text-[11px] text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
            אחרי הרישום יישארו היום{" "}
            <span className={cn("font-semibold", remaining.calories - totals.calories < 0 ? "text-[#FF9500]" : "text-gray-900")}>
              {Math.round(remaining.calories - totals.calories)} קק&quot;ל
            </span>{" "}
            ו-
            <span className="font-semibold text-gray-900">
              {Math.max(0, Math.round(remaining.protein - totals.protein))} גר&apos; חלבון
            </span>
          </p>
        )}

        {error && (
          <p className="text-xs text-[#FF3B30] flex items-center gap-1.5">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || entries.length === 0}
          className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white bg-[#007AFF] transition active:scale-95 disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? "שומר…" : entries.length > 1 ? `רשום ${entries.length} ארוחות` : "רשום ארוחה"}
        </button>

        {/* ── Prompt helper for ChatGPT ─────────────────────── */}
        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            טיפ: הוסף את המשפט הזה לבקשה ב-ChatGPT, וההדבקה תמולא בדיוק — כולל כמה ארוחות בבת אחת.
          </p>
          <button
            onClick={copyPrompt}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold px-3 py-1.5"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "הועתק" : "העתק הנחיה ל-ChatGPT"}
          </button>
        </div>
      </div>
    </div>
  )
}
