"use client"

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react"
import MealSuggester from "@/components/dashboard/MealSuggester"
import RecipePanel   from "@/components/dashboard/RecipePanel"
import {
  SUGAR_TARGET,
  REST_DAY_SUGAR_TARGET,
  MILK_PRESETS,
  DEFAULT_MILK_PRESET_ID,
  DEFAULT_MILK_VOLUME_ML,
  computeRestDayTargets,
} from "@/lib/nutrition"
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
  Camera,
  ScanLine,
  Mic,
  Coffee,
  Settings,
  Lightbulb,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"

// SUGAR_TARGET is imported from @/lib/nutrition (shared with dashboard and weeklyReport)

// ─────────────────────────────────────────────────────────────
// טיפוסים
// ─────────────────────────────────────────────────────────────

interface MacroTotals {
  calories: number
  protein:  number
  carbs:    number
  fat:      number
  sugar?:   number
}

// A single food item as parsed by AI, before it's been logged (no id yet) —
// shared shape for the image-scan and voice-scan review cards, one row per
// distinct food item rather than one aggregated line per meal/photo.
interface DraftFoodItem {
  name:     string
  quantity: number
  unit:     string
  calories: number
  protein:  number
  carbs:    number
  fat:      number
  sugar:    number
}

interface ScanResult {
  items:    DraftFoodItem[]
  insight?: string   // AI nudge — reminder to verify scale-ambiguous weight estimates
}

interface VoiceMeal {
  mealName: string
  items:    DraftFoodItem[]
  insight?: string   // AI nudge — protein density tip or encouragement
}

interface LabelScan {
  productName:     string          // editable by user before saving
  packageWeightG:  string          // editable, kept as string for the input field
  unitWeightG:     string          // from the label's למנה/ליחידה column, if present
  unitsPerPackage: string          // printed on package, or asked from the user
  per100g: {
    calories:      number
    protein:       number
    carbs:         number
    fat:           number
    sugar:         number
    fiber:         number
    saturatedFat:  number
  }
  confidence: "high" | "medium" | "low"
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
  insight?: string   // AI nudge for the meal this item belongs to
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

// Shared "bento box" card treatment — matches the dashboard page / CheckInCard / Metrics page.
const CARD = "bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)]"

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
          <circle cx={dim / 2} cy={dim / 2} r={R} fill="none" stroke="#F3F4F6" strokeWidth={SW} />
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
              "font-black tabular-nums leading-none text-gray-900",
              size === "lg" ? "text-xl" : "text-sm"
            )}
          >
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <p className={cn("text-gray-400 font-medium", size === "lg" ? "text-xs" : "text-[10px]")}>
        {label}
      </p>
      <p className={cn("font-bold text-gray-900", size === "lg" ? "text-sm" : "text-[11px]")}>
        {Math.round(current)}
        <span className="text-gray-400 font-normal text-[10px]"> {unit}</span>
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
  const [showInsight, setShowInsight] = useState(false)

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
          <span className="text-sm text-gray-900 font-medium truncate flex-1 me-2">
            {item.name}
          </span>
          <button
            onClick={onEditCancel}
            className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors shrink-0"
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
            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center font-semibold text-gray-900 focus:outline-none focus:border-[#007AFF] focus:ring-1 focus:ring-[#007AFF]/20"
            autoFocus
            dir="ltr"
          />
          <span className="text-xs text-gray-400 shrink-0">{item.unit}</span>
          {qty > 0 && (
            <span className="text-xs text-gray-400 flex-1">
              ≈{" "}
              <span className="text-orange-500">{previewCal} קק"ל</span>
              {" · "}
              <span className="text-[#007AFF]">{previewProt} ח'</span>
            </span>
          )}
          <button
            onClick={() => qty > 0 && onEditSave(qty)}
            disabled={qty <= 0}
            className="p-1.5 rounded-lg bg-[#007AFF] hover:bg-[#007AFF]/90 disabled:opacity-40 text-white transition-colors shrink-0"
            aria-label="שמור"
          >
            <Check size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("py-1.5 transition-opacity", isDeleting && "opacity-30 pointer-events-none")}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-900 truncate flex items-center gap-1">
            {item.name}
            {item.insight && (
              <button
                onClick={() => setShowInsight((v) => !v)}
                className={cn(
                  "shrink-0 transition-colors",
                  showInsight ? "text-[#FF9500]" : "text-[#FF9500]/60 hover:text-[#FF9500]/80",
                )}
                aria-label="טיפ תזונתי מה-AI"
                title={item.insight}
              >
                <Lightbulb size={12} />
              </button>
            )}
          </span>
          <span className="text-xs text-gray-400">
            {item.quantity} {item.unit}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-400">{Math.round(item.calories)} קק"ל</span>
          <span className="text-xs text-[#007AFF] font-medium">{Math.round(item.protein)} ח'</span>

          <button
            onClick={onEditStart}
            className="p-1 rounded text-gray-300 hover:text-[#007AFF] hover:bg-blue-50 transition-colors"
            aria-label="ערוך"
          >
            <Pencil size={12} />
          </button>

          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="p-1 rounded text-gray-300 hover:text-[#FF3B30] hover:bg-red-50 transition-colors"
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

      {showInsight && item.insight && (
        <p className="text-[11px] text-[#FF9500] bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mt-1.5" dir="rtl">
          💡 {item.insight}
        </p>
      )}
    </div>
  )
}

// Parses a positive number from a text input, or null if empty/invalid/zero —
// shared by the page and the unit-definition sub-component below.
function posNum(s: string): number | null {
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ─────────────────────────────────────────────────────────────
// הגדרת "יחידה" לתווית סרוקה — לפי מספר יחידות באריזה, או לפי שקילה ישירה
// של יחידה אחת על מאזני מטבח (למשל פרוסת גבינה ~28 גרם).
//
// Local draft state stays fully inside this component and only reaches the
// parent's labelScan on explicit confirm (button click or Enter) — never on
// every keystroke, which previously caused the input to vanish mid-typing
// (typing "1" of "15" already satisfied the parent's "has a unit weight"
// condition and unmounted this block instantly).
// ─────────────────────────────────────────────────────────────

function UnitDefinitionInput({
  hasPackageWeight,
  onConfirmCount,
  onConfirmWeight,
}: {
  hasPackageWeight: boolean
  onConfirmCount: (units: string) => void
  onConfirmWeight: (grams: string) => void
}) {
  const [mode, setMode] = useState<"count" | "weight">(hasPackageWeight ? "count" : "weight")
  const [draft, setDraft] = useState("")

  const confirm = () => {
    if (!posNum(draft)) return
    if (mode === "count") onConfirmCount(draft)
    else onConfirmWeight(draft)
    setDraft("")
  }

  return (
    <div className="space-y-2 bg-white border border-cyan-100 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => { setMode("count"); setDraft("") }}
          className={cn(
            "px-2 py-1 rounded-md text-[10px] font-semibold transition-colors",
            mode === "count" ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-500",
          )}
        >
          לפי מספר יחידות באריזה
        </button>
        <button
          type="button"
          onClick={() => { setMode("weight"); setDraft("") }}
          className={cn(
            "px-2 py-1 rounded-md text-[10px] font-semibold transition-colors",
            mode === "weight" ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-500",
          )}
        >
          לפי שקילה של יחידה אחת (גרם)
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#FF9500] shrink-0">
          {mode === "count"
            ? "כמה יחידות יש באריזה כולה?"
            : "מה משקל יחידה אחת? — שקול על מאזני מטבח"}
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); confirm() }
          }}
          placeholder={mode === "count" ? "4" : "28"}
          className="w-16 bg-gray-50 rounded-lg px-2 py-1 text-xs text-gray-900 placeholder:text-gray-300 focus:outline-none border border-gray-200 focus:border-cyan-400 text-center transition-colors"
        />
        <button
          type="button"
          onClick={confirm}
          disabled={!posNum(draft)}
          className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-600/90 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
        >
          <Check size={11} /> אישור
        </button>
      </div>
      {mode === "count" && !hasPackageWeight && (
        <p className="text-[10px] text-gray-400">(נדרש גם משקל אריזה כדי לחשב לפי מספר יחידות)</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// LabelScannerModal — an intermediary surface between clicking "סרוק תווית"
// and actually picking a file. Clicking the native file input directly steals
// browser focus to the OS picker, leaving nowhere for the user to Ctrl+V a
// screenshot onto — this modal is that missing UI surface: a dropzone the
// user can click (opens the file picker), drag an image onto, or paste into.
// ─────────────────────────────────────────────────────────────

function LabelScannerModal({
  onClose,
  onDropzoneClick,
  onDropFile,
}: {
  onClose: () => void
  onDropzoneClick: () => void
  onDropFile: (e: React.DragEvent) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white border border-gray-100 rounded-2xl p-4 space-y-3 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#007AFF] flex items-center gap-1.5">
            <ScanLine size={14} /> סריקת תווית תזונה
          </p>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="סגור"
          >
            <X size={15} />
          </button>
        </div>

        {/* Whole area is tappable (a massive touch target on mobile) — a
            plain <div> rather than a <button> so the explicit CTA button
            below can be nested inside it without invalid button-in-button
            markup. */}
        <div
          role="button"
          tabIndex={0}
          onClick={onDropzoneClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDropzoneClick() }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { setDragOver(false); onDropFile(e) }}
          className={cn(
            "w-full flex flex-col items-center gap-3 rounded-xl border-2 border-dashed py-8 px-4 transition-colors cursor-pointer",
            dragOver
              ? "border-[#007AFF] bg-blue-50"
              : "border-gray-200 hover:border-[#007AFF]/50 hover:bg-gray-50",
          )}
        >
          <Upload size={26} className={dragOver ? "text-[#007AFF]" : "text-gray-300"} />
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            לחץ לבחירת תמונה, או פשוט הדבק (Ctrl+V) / גרור לכאן
          </p>

          {/* Explicit, prominent CTA — mobile has no Ctrl+V / drag-and-drop,
              so this is the primary action there (opens the native
              camera-or-gallery chooser via the underlying file input). */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDropzoneClick() }}
            className="w-full flex items-center justify-center gap-2 bg-[#007AFF] hover:bg-[#007AFF]/90 active:scale-95 rounded-full py-3.5 text-sm font-bold text-white transition shadow-lg shadow-blue-500/20"
          >
            📸 צלם או בחר תמונה מגלריה
          </button>
        </div>
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
  const [lastAdded, setLastAdded] = useState<{ items: FoodItem[]; totals: MacroTotals; insight?: string } | null>(
    null
  )

  const [openMeal, setOpenMeal] = useState<string | null>(null)
  const [dietaryPreference, setDietaryPreference] = useState("vegetarian")
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)

  // Camera scan state
  const [scanLoading, setScanLoading] = useState(false)
  const [scanResult,  setScanResult]  = useState<ScanResult | null>(null)
  const [scanError,   setScanError]   = useState<string | null>(null)

  // Nutrition label scanner state
  const labelInputRef = useRef<HTMLInputElement>(null)
  const [labelModalOpen,   setLabelModalOpen]   = useState(false)
  const [labelLoading,     setLabelLoading]     = useState(false)
  const [labelScan,        setLabelScan]        = useState<LabelScan | null>(null)
  const [labelError,       setLabelError]       = useState<string | null>(null)
  const [labelPortionMode, setLabelPortionMode] = useState<"units" | "grams" | "percent">("grams")
  const [labelPortion,     setLabelPortion]     = useState("50")
  const [labelSaveProduct, setLabelSaveProduct] = useState(true)
  const [labelLogging,     setLabelLogging]     = useState(false)

  // Voice recording state
  const [voiceState,   setVoiceState]   = useState<"idle" | "recording" | "processing">("idle")
  const [voiceTimer,   setVoiceTimer]   = useState(0)
  const [voiceMeals,   setVoiceMeals]   = useState<VoiceMeal[] | null>(null)
  const [voiceError,   setVoiceError]   = useState<string | null>(null)
  const [loggingVoice, setLoggingVoice] = useState(false)
  const [expandedVoiceInsight, setExpandedVoiceInsight] = useState<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaStreamRef   = useRef<MediaStream | null>(null)

  // Edit / delete state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  // Training day / rest day cycling toggle — persisted per calendar day (Israel UTC+3)
  const [isTrainingDay, setIsTrainingDay] = useState(true)

  // Coffee quick-log — preset and volume persisted in localStorage
  const [preferredMilkPreset, setPreferredMilkPreset] = useState(DEFAULT_MILK_PRESET_ID)
  const [defaultMilkVolumeMl, setDefaultMilkVolumeMl] = useState(DEFAULT_MILK_VOLUME_ML)
  const [coffeeLogging,       setCoffeeLogging]       = useState(false)
  const [coffeeSuccess,       setCoffeeSuccess]       = useState(false)
  const [coffeeError,         setCoffeeError]         = useState<string | null>(null)
  const [showCoffeeSettings,  setShowCoffeeSettings]  = useState(false)

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

  // Sync training-day toggle with localStorage (Israel UTC+3 date key).
  // useLayoutEffect (not useEffect) so the saved value applies BEFORE first
  // paint — a rest-day user never sees a flash of full training targets —
  // while keeping server/client initial markup identical (no hydration mismatch).
  useLayoutEffect(() => {
    const israelDate = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)
    const saved = localStorage.getItem(`training-day-${israelDate}`)
    if (saved !== null) setIsTrainingDay(saved === "true")
  }, [])

  const handleToggleTrainingDay = (val: boolean) => {
    const israelDate = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)
    localStorage.setItem(`training-day-${israelDate}`, String(val))
    setIsTrainingDay(val)
  }

  // Restore coffee preferences from localStorage before first paint
  useLayoutEffect(() => {
    const preset = localStorage.getItem("coffee-milk-preset")
    const volume = localStorage.getItem("coffee-milk-volume")
    if (preset && MILK_PRESETS[preset]) setPreferredMilkPreset(preset)
    if (volume) setDefaultMilkVolumeMl(Number(volume) || DEFAULT_MILK_VOLUME_ML)
  }, [])

  const handleLogCoffee = async () => {
    if (coffeeLogging) return
    const preset = MILK_PRESETS[preferredMilkPreset]
    if (!preset) return
    setCoffeeLogging(true)
    setCoffeeSuccess(false)
    setCoffeeError(null)
    const factor = defaultMilkVolumeMl / 100
    try {
      const res = await fetch("/api/nutrition/log", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          mealType:    "snack",
          directItems: [{
            name:     `קפה + ${preset.name} (${defaultMilkVolumeMl}מ"ל)`,
            calories: Math.round(preset.calories * factor * 10) / 10,
            protein:  Math.round(preset.protein  * factor * 10) / 10,
            carbs:    Math.round(preset.carbs    * factor * 10) / 10,
            fat:      Math.round(preset.fat      * factor * 10) / 10,
            sugar:    Math.round(preset.sugar    * factor * 10) / 10,
          }],
        }),
      })
      if (res.ok) {
        setCoffeeSuccess(true)
        await fetchToday()
        setTimeout(() => setCoffeeSuccess(false), 2500)
      } else {
        setCoffeeError("הקפה לא נרשם — נסה שוב")
      }
    } catch {
      setCoffeeError("שגיאת חיבור — הקפה לא נרשם")
    } finally {
      setCoffeeLogging(false)
    }
  }

  const handleSetMilkPreset = (id: string) => {
    setPreferredMilkPreset(id)
    localStorage.setItem("coffee-milk-preset", id)
  }

  const handleSetMilkVolume = (vol: number) => {
    setDefaultMilkVolumeMl(vol)
    localStorage.setItem("coffee-milk-volume", String(vol))
  }

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

      setLastAdded({ items: data.items, totals: data.totals, insight: data.insight })
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

  const handleUseSuggestion = useCallback((ingredientsText: string) => {
    setNlpText(ingredientsText)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [])

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanLoading(true)
    setScanResult(null)
    setScanError(null)
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader   = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res  = await fetch("/api/ai/analyze-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ imageBase64 }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScanError(data.error ?? "שגיאה בניתוח התמונה")
        return
      }
      const result = data as ScanResult
      setScanResult(result)
      // Auto-fill the NLP text field with the detected items so the user can
      // review/edit before the normal text pipeline re-parses & logs them.
      setNlpText(
        (result.items ?? []).map((it) => `${it.name} ${it.quantity}${it.unit}`).join(", "),
      )
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
      })
    } catch {
      setScanError("שגיאה בניתוח התמונה — נסה שוב")
    } finally {
      setScanLoading(false)
      if (scanInputRef.current) scanInputRef.current.value = ""
    }
  }

  // ── סריקת תווית תזונה ────────────────────────────────────────
  // Core label-scan logic, shared by the file-picker input and clipboard paste.
  const processLabelImageFile = async (file: File) => {
    setLabelLoading(true)
    setLabelScan(null)
    setLabelError(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader   = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const base64 = dataUrl.split(",")[1] ?? ""
      const res = await fetch("/api/ai/scan-label", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ image: base64, mimeType: file.type || "image/jpeg" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLabelError(data.error ?? "שגיאה בסריקת התווית")
        return
      }
      setLabelScan({
        productName:     data.productName ?? "",
        packageWeightG:  data.packageWeightG  ? String(data.packageWeightG)  : "",
        unitWeightG:     data.unitWeightG     ? String(data.unitWeightG)     : "",
        unitsPerPackage: data.unitsPerPackage ? String(data.unitsPerPackage) : "",
        per100g:         data.per100g,
        confidence:      data.confidence,
      })
      // Pre-packaged items are eaten by the piece — default to unit mode when
      // the label gave us (or lets us derive) a unit weight.
      const hasUnit = !!data.unitWeightG || (!!data.packageWeightG && !!data.unitsPerPackage)
      setLabelPortionMode(hasUnit ? "units" : "grams")
      setLabelPortion(hasUnit ? "1" : "50")
    } catch {
      setLabelError("שגיאה בסריקת התווית — נסה שוב")
    } finally {
      setLabelLoading(false)
    }
  }

  const handleLabelScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLabelModalOpen(false)
    await processLabelImageFile(file)
    if (labelInputRef.current) labelInputRef.current.value = ""
  }

  // Drag-and-drop straight onto the modal's dropzone.
  const handleLabelDropFile = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setLabelModalOpen(false)
    await processLabelImageFile(file)
  }

  // Clipboard paste (Ctrl+V / Cmd+V) — lets the user paste a screenshot of a
  // nutrition label directly instead of picking a file. Only wired up while
  // the scanner modal is open (see the effect below), so it never interferes
  // with pasting elsewhere on the page (e.g. the product-name field).
  const handleLabelPasteImage = async (e: ClipboardEvent) => {
    if (labelLoading) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          setLabelModalOpen(false)
          await processLabelImageFile(file)
        }
        return
      }
    }
  }

  useEffect(() => {
    if (!labelModalOpen) return
    window.addEventListener("paste", handleLabelPasteImage)
    return () => window.removeEventListener("paste", handleLabelPasteImage)
  }, [labelModalOpen, labelLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Weight of one unit: from the label's per-unit column, or derived as
  // packageWeight / unitsPerPackage when the user tells us the piece count.
  const labelUnitWeightG = (): number | null => {
    if (!labelScan) return null
    const direct = posNum(labelScan.unitWeightG)
    if (direct) return direct
    const pkg   = posNum(labelScan.packageWeightG)
    const units = posNum(labelScan.unitsPerPackage)
    return pkg && units ? pkg / units : null
  }

  // Whole-package weight: printed on the label, or unitWeight × unitsPerPackage
  const labelPackageGrams = (): number | null => {
    if (!labelScan) return null
    const pkg = posNum(labelScan.packageWeightG)
    if (pkg) return pkg
    const unit  = posNum(labelScan.unitWeightG)
    const units = posNum(labelScan.unitsPerPackage)
    return unit && units ? unit * units : null
  }

  // Resolve the portion input to grams for the selected mode
  const labelPortionGrams = (): number | null => {
    if (!labelScan) return null
    const val = parseFloat(labelPortion)
    if (!Number.isFinite(val) || val <= 0) return null
    if (labelPortionMode === "grams") return val
    if (labelPortionMode === "units") {
      const unit = labelUnitWeightG()
      return unit ? unit * val : null
    }
    const pkg = labelPackageGrams()
    return pkg ? (pkg * val) / 100 : null
  }

  const handleLogLabelPortion = async () => {
    if (!labelScan || labelLogging) return
    const grams = labelPortionGrams()
    if (!grams) return
    const name = labelScan.productName.trim() || "מוצר סרוק"
    setLabelLogging(true)
    setLabelError(null)
    const factor = grams / 100
    try {
      // Save as a zero-prep recipe (shared store with Saved Recipes) so the
      // product shows up in the recipes menu for one-tap future portions.
      // Requires whole-package totals — hence the labelPackageGrams() guard.
      const pkgGrams = labelPackageGrams()
      if (labelSaveProduct && pkgGrams) {
        const pf = pkgGrams / 100
        const unitW = labelUnitWeightG()
        await fetch("/api/recipes", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            name,
            ingredients:   `מוצר סרוק מתווית · אריזה ${Math.round(pkgGrams)} גרם · ל-100 גרם: ${labelScan.per100g.calories} קק"ל, ${labelScan.per100g.protein}ג' חלבון`,
            totalCalories: Math.round(labelScan.per100g.calories * pf),
            totalProtein:  Math.round(labelScan.per100g.protein  * pf * 10) / 10,
            totalCarbs:    Math.round(labelScan.per100g.carbs    * pf),
            totalFat:      Math.round(labelScan.per100g.fat      * pf * 10) / 10,
            totalSugar:    Math.round(labelScan.per100g.sugar    * pf * 10) / 10,
            // One unit as the default serving when known, else the standard 25%
            defaultServingPct: unitW
              ? Math.round((unitW / pkgGrams) * 1000) / 10
              : 25,
          }),
        }).catch(() => {})
      }
      const res = await fetch("/api/nutrition/log", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          mealType:    selectedMeal,
          directItems: [{
            name,
            quantity: Math.round(grams),
            unit:     "g",
            calories: Math.round(labelScan.per100g.calories * factor * 10) / 10,
            protein:  Math.round(labelScan.per100g.protein  * factor * 10) / 10,
            carbs:    Math.round(labelScan.per100g.carbs    * factor * 10) / 10,
            fat:      Math.round(labelScan.per100g.fat      * factor * 10) / 10,
            sugar:    Math.round(labelScan.per100g.sugar    * factor * 10) / 10,
          }],
        }),
      })
      if (!res.ok) {
        setLabelError("הרישום נכשל — נסה שוב")
        return
      }
      setLabelScan(null)
      await fetchToday()
    } catch {
      setLabelError("שגיאת חיבור — נסה שוב")
    } finally {
      setLabelLogging(false)
    }
  }

  // ── Voice recording ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const formatTimer = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

  const getSupportedMimeType = (): string => {
    const types = ["audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
    for (const t of types) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t
    }
    return "audio/webm"
  }

  const processVoiceRecording = async (mimeType: string) => {
    setVoiceError(null)
    try {
      const baseMime    = mimeType.split(";")[0] || "audio/webm"
      const blob        = new Blob(audioChunksRef.current, { type: baseMime })
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader   = new FileReader()
        reader.onload  = () => resolve((reader.result as string).split(",")[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const res  = await fetch("/api/ai/analyze-voice", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ audioBase64, mimeType: baseMime }),
      })
      const data = await res.json()
      if (!res.ok) {
        setVoiceError(data.error ?? "שגיאה בניתוח ההקלטה")
        return
      }
      setVoiceMeals(data.meals ?? [])
    } catch {
      setVoiceError("שגיאה בניתוח ההקלטה — נסה שוב")
    } finally {
      setVoiceState("idle")
    }
  }

  const handleVoiceClick = async () => {
    if (voiceState === "recording") {
      mediaRecorderRef.current?.stop()
      setVoiceState("processing")
      return
    }
    if (voiceState !== "idle") return
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("הדפדפן אינו תומך בהקלטת שמע — נסה ב-Chrome או Safari")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
        if (timerRef.current) clearInterval(timerRef.current)
        processVoiceRecording(mimeType).catch(console.error)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setVoiceState("recording")
      setVoiceTimer(0)
      timerRef.current = setInterval(() => setVoiceTimer((t) => t + 1), 1000)
    } catch {
      setVoiceError("לא ניתן לגשת למיקרופון — בדוק הרשאות")
    }
  }

  const mapMealNameToType = (mealName: string): MealType => {
    if (mealName.includes("בוקר")) return "breakfast"
    if (mealName.includes("צהריים")) return "lunch"
    if (mealName.includes("ערב")) return "dinner"
    return "snack"
  }

  const updateVoiceMeal = (index: number, updates: Partial<VoiceMeal>) => {
    setVoiceMeals(prev =>
      prev ? prev.map((m, i) => (i === index ? { ...m, ...updates } : m)) : null,
    )
  }

  const updateVoiceMealItem = (mealIndex: number, itemIndex: number, updates: Partial<DraftFoodItem>) => {
    setVoiceMeals(prev =>
      prev ? prev.map((m, i) => i !== mealIndex ? m : {
        ...m,
        items: m.items.map((it, ii) => ii === itemIndex ? { ...it, ...updates } : it),
      }) : null,
    )
  }

  const handleLogAllMeals = async () => {
    if (!voiceMeals?.length) return
    setLoggingVoice(true)
    setVoiceError(null)
    // Track failures per meal: committed meals leave the review set immediately,
    // so a retry after a partial failure never double-logs what already saved.
    const failed: VoiceMeal[] = []
    for (const meal of voiceMeals) {
      try {
        const res = await fetch("/api/nutrition/log", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            mealType:    mapMealNameToType(meal.mealName),
            insight:     meal.insight,
            // One directItems entry per distinct food item, not one aggregated
            // entry per meal — keeps each ingredient independently editable/deletable.
            directItems: meal.items.map((it) => ({
              name:     it.name,
              quantity: it.quantity,
              unit:     it.unit,
              calories: it.calories,
              protein:  it.protein,
              carbs:    it.carbs,
              fat:      it.fat,
              sugar:    it.sugar,
            })),
          }),
        })
        if (!res.ok) failed.push(meal)
      } catch {
        failed.push(meal)
      }
    }
    if (failed.length > 0) {
      setVoiceMeals(failed)
      setVoiceError(
        failed.length === voiceMeals.length
          ? "שגיאה ברישום הארוחות — נסה שוב"
          : `${failed.length} מתוך ${voiceMeals.length} ארוחות לא נרשמו — נסה שוב`,
      )
    } else {
      setVoiceMeals(null)
    }
    await fetchToday()
    setLoggingVoice(false)
  }

  const baseTargets = todayData?.targets ?? { calories: 2600, protein: 185, carbs: 340, fat: 80 }
  const targets = isTrainingDay ? baseTargets : computeRestDayTargets(baseTargets)
  const totals   = todayData?.totals  ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const byMealType = todayData?.byMealType ?? {}

  const calRemain  = targets.calories - totals.calories
  const protRemain = targets.protein  - totals.protein
  const sugarToday  = totals.sugar ?? 0
  const sugarTarget = isTrainingDay ? SUGAR_TARGET : REST_DAY_SUGAR_TARGET
  const sugarPct    = Math.min((sugarToday / sugarTarget) * 100, 100)

  return (
    <div className="bg-[#F9FAFB] px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* ── כותרת ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">תזונה יומית</h1>
          <p className="text-sm text-gray-500 mt-0.5">מעקב מאקרו צמחוני</p>
        </div>

        {/* ── Coffee quick-log cluster ─────────────────────── */}
        <div className="relative flex items-center gap-1.5 mt-1">
          <button
            onClick={handleLogCoffee}
            disabled={coffeeLogging}
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200",
              coffeeSuccess
                ? "bg-[#34C759] text-white"
                : "bg-gray-100 text-[#FF9500] hover:bg-gray-200 active:scale-95",
            )}
            title="רשום קפה עם חלב"
          >
            {coffeeLogging ? (
              <Loader2 size={16} className="animate-spin" />
            ) : coffeeSuccess ? (
              <Check size={16} />
            ) : (
              <Coffee size={16} />
            )}
          </button>
          <button
            onClick={() => setShowCoffeeSettings(v => !v)}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-lg transition-all",
              showCoffeeSettings ? "bg-black text-white" : "text-gray-400 hover:text-gray-600",
            )}
            title="הגדרות קפה"
          >
            <Settings size={13} />
          </button>

          {showCoffeeSettings && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCoffeeSettings(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-100 rounded-2xl p-3 shadow-[0_8px_30px_rgb(0,0,0,0.08)] z-50 space-y-3"
                dir="rtl"
              >
                <p className="text-[11px] font-bold text-gray-500">סוג חלב</p>
                <div className="space-y-1">
                  {Object.values(MILK_PRESETS).map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleSetMilkPreset(preset.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all",
                        preferredMilkPreset === preset.id
                          ? "bg-orange-50 text-[#FF9500] font-semibold"
                          : "text-gray-500 hover:bg-gray-50",
                      )}
                    >
                      <span>{preset.name}</span>
                      <span className="text-[10px] text-gray-400">{preset.calories} קק&quot;ל/100מ&quot;ל</span>
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-500 mb-1.5">כמות (מ&quot;ל)</p>
                  <div className="flex gap-1.5">
                    {[100, 125, 150, 200].map(vol => (
                      <button
                        key={vol}
                        onClick={() => handleSetMilkVolume(vol)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                          defaultMilkVolumeMl === vol
                            ? "bg-orange-50 text-[#FF9500]"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200",
                        )}
                      >
                        {vol}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 text-center border-t border-gray-100 pt-2">
                  {(() => {
                    const p = MILK_PRESETS[preferredMilkPreset]
                    const f = defaultMilkVolumeMl / 100
                    return `${Math.round(p.calories * f)} קק"ל · ${Math.round(p.carbs * f * 10) / 10}ג' פחמ' · ${Math.round(p.protein * f * 10) / 10}ג' חלב'`
                  })()}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {coffeeError && (
        <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2" dir="rtl">
          <AlertCircle size={13} className="shrink-0" />
          {coffeeError}
        </div>
      )}

      {/* ── Toggle: יום אימון / יום מנוחה ─────────────────── */}
      <div className="flex items-center gap-2 bg-gray-100 rounded-2xl p-1.5" dir="rtl">
        <button
          onClick={() => handleToggleTrainingDay(true)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            isTrainingDay
              ? "bg-[#007AFF] text-white shadow-lg shadow-blue-500/25"
              : "text-gray-400 hover:text-gray-600",
          )}
        >
          <span>🏋️</span> יום אימון
        </button>
        <button
          onClick={() => handleToggleTrainingDay(false)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            !isTrainingDay
              ? "bg-black text-white shadow-lg shadow-black/10"
              : "text-gray-400 hover:text-gray-600",
          )}
        >
          <span>🛌</span> יום מנוחה
        </button>
      </div>
      {!isTrainingDay && (
        <p className="text-[11px] text-gray-400 text-center -mt-3" dir="rtl">
          יעד קלוריות הופחת ב-15% · פחמימות ושומן מותאמים · חלבון נשמר מלא
        </p>
      )}

      {/* ╔══════════════════════════════════════════════════╗
          ║            כרטיס סיכום מאקרו יומי               ║
          ╚══════════════════════════════════════════════════╝ */}
      <div className={cn(CARD, "p-6 space-y-4")}>
        {/* סרגל קלוריות */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-900 font-semibold flex items-center gap-1.5">
              <Flame size={13} className="text-orange-500" />
              {totals.calories} קק"ל
            </span>
            <span className={calRemain >= 0 ? "text-gray-400" : "text-[#FF3B30]"}>
              {calRemain >= 0 ? `נותרו ${calRemain}` : `ביתר ${Math.abs(calRemain)}`} קק"ל
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min((totals.calories / targets.calories) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-300 mt-1">יעד: {targets.calories} קק"ל</p>
        </div>

        {/* טבעות מאקרו */}
        <div className="flex items-end justify-around pt-1">
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] text-[#007AFF] font-bold mb-0.5">יעד עיקרי</div>
            <MacroRing
              label="חלבון"
              current={totals.protein}
              target={targets.protein}
              unit="גר'"
              color="#007AFF"
              size="lg"
              glow
            />
            <p className="text-[10px] text-[#007AFF] mt-0.5">
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

        {/* סרגל סוכר */}
        <div className="pt-1">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              סוכר יומי
            </span>
            <span className={sugarPct >= 100 ? "text-rose-500 font-semibold" : "text-gray-400"}>
              {Math.round(sugarToday)} / {sugarTarget} גר'
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                sugarPct >= 100 ? "bg-rose-500" : "bg-rose-400"
              )}
              style={{ width: `${sugarPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ╔══════════════════════════════════════════════════╗
          ║          קלט NLP — רישום מזון חופשי              ║
          ╚══════════════════════════════════════════════════╝ */}
      <div className={cn(CARD, "p-6 space-y-3")}>
        <div>
          <p className="text-sm font-semibold text-gray-900">רישום מהיר בעברית חופשית</p>
          <p className="text-xs text-gray-500 mt-0.5">
            לדוגמה:{" "}
            <span className="text-[#007AFF] italic">
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
                  ? "bg-[#007AFF] border-[#007AFF] text-white"
                  : "bg-transparent border-gray-200 text-gray-500 hover:border-gray-300"
              )}
            >
              <span>{emoji}</span> {label}
            </button>
          ))}
        </div>

        {/* שדה קלט */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-[#007AFF] transition-colors">
            <textarea
              ref={textareaRef}
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
              className="w-full bg-transparent text-sm text-gray-900 focus:outline-none placeholder:text-gray-300 disabled:opacity-50 resize-none"
              dir="rtl"
            />
          </div>
          <button
            onClick={handleParse}
            disabled={!nlpText.trim() || parsing}
            className="bg-[#007AFF] hover:bg-[#007AFF]/90 disabled:opacity-40 rounded-xl px-4 h-14 flex items-center justify-center transition-colors shrink-0"
            aria-label="שלח"
          >
            {parsing ? <Loader2 size={18} className="animate-spin text-white" /> : <Send size={18} className="text-white" />}
          </button>
        </div>

        {/* סריקת ארוחה — מצלמה + הקלטת קול */}
        <div className="space-y-2">
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleScan}
          />
          <input
            ref={labelInputRef}
            type="file"
            accept="image/*"
            // No `capture` attribute here (unlike scanInputRef above) — that
            // attribute forces the camera open directly on mobile, skipping
            // the native "Camera or Photo Library" chooser we want to offer.
            className="hidden"
            onChange={handleLabelScan}
          />
          <div className="flex gap-2">
            {/* Camera button */}
            <button
              onClick={() => scanInputRef.current?.click()}
              disabled={scanLoading || parsing || voiceState !== "idle"}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200 hover:border-emerald-300 rounded-xl py-2 text-xs font-medium text-gray-500 hover:text-emerald-600 transition-colors"
            >
              {scanLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin text-emerald-500" />
                  <span className="text-emerald-600">מנתח...</span>
                </>
              ) : (
                <>
                  <Camera size={13} className="text-emerald-500" />
                  מצלמה
                </>
              )}
            </button>
            {/* Mic button */}
            <button
              onClick={handleVoiceClick}
              disabled={parsing || scanLoading}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium transition-colors border",
                voiceState === "recording"
                  ? "bg-red-50 border-red-200 text-[#FF3B30] hover:bg-red-100"
                  : voiceState === "processing"
                  ? "bg-gray-50 border-gray-200 text-emerald-600 opacity-100 cursor-not-allowed"
                  : "bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-violet-300 text-gray-500 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {voiceState === "recording" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  {formatTimer(voiceTimer)}
                </>
              ) : voiceState === "processing" ? (
                <>
                  <Loader2 size={13} className="animate-spin text-emerald-500" />
                  מפענח...
                </>
              ) : (
                <>
                  <Mic size={13} className="text-violet-500" />
                  הקלטת קול
                </>
              )}
            </button>
            {/* Label-scan button — opens the intermediary dropzone modal
                rather than the native file picker directly, so there's a UI
                surface to Ctrl+V a screenshot onto before a file is chosen. */}
            <button
              onClick={() => setLabelModalOpen(true)}
              disabled={labelLoading || parsing || scanLoading || voiceState !== "idle"}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-200 hover:border-cyan-300 rounded-xl py-2 text-xs font-medium text-gray-500 hover:text-cyan-600 transition-colors"
            >
              {labelLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin text-cyan-500" />
                  <span className="text-cyan-600">סורק...</span>
                </>
              ) : (
                <>
                  <ScanLine size={13} className="text-cyan-500" />
                  סרוק תווית
                </>
              )}
            </button>
          </div>

          {labelModalOpen && (
            <LabelScannerModal
              onClose={() => setLabelModalOpen(false)}
              onDropzoneClick={() => labelInputRef.current?.click()}
              onDropFile={handleLabelDropFile}
            />
          )}

          {/* ── כרטיס מנה ממוצר סרוק ─────────────────────────── */}
          {labelScan && (
            <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 space-y-2.5" dir="rtl">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-cyan-600 font-semibold flex items-center gap-1.5">
                  <ScanLine size={12} /> תווית נסרקה
                  {labelScan.confidence !== "high" && (
                    <span className="text-[#FF9500] font-normal">· ודא ערכים — סריקה חלקית</span>
                  )}
                </p>
                <button
                  onClick={() => setLabelScan(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="סגור"
                >
                  <X size={13} />
                </button>
              </div>

              <input
                type="text"
                value={labelScan.productName}
                onChange={e => setLabelScan({ ...labelScan, productName: e.target.value })}
                placeholder="שם המוצר"
                className="w-full bg-white rounded-lg px-3 py-2 text-xs text-gray-900 placeholder:text-gray-300 focus:outline-none border border-gray-200 focus:border-cyan-400 transition-colors"
              />

              <p className="text-[10px] text-gray-500">
                ל-100 גרם: {labelScan.per100g.calories} קק"ל · {labelScan.per100g.protein}ג' חלבון · {labelScan.per100g.carbs}ג' פחמ' · {labelScan.per100g.fat}ג' שומן · {labelScan.per100g.sugar}ג' סוכר
              </p>

              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500 shrink-0">משקל אריזה (אופציונלי)</label>
                <input
                  type="number"
                  value={labelScan.packageWeightG}
                  onChange={e => setLabelScan({ ...labelScan, packageWeightG: e.target.value })}
                  placeholder="גרם"
                  className="w-20 bg-white rounded-lg px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-300 focus:outline-none border border-gray-200 focus:border-cyan-400 text-center transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => { setLabelPortionMode("units"); setLabelPortion("1") }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                      labelPortionMode === "units" ? "bg-cyan-600 text-white" : "text-gray-500",
                    )}
                  >
                    יחידות
                  </button>
                  <button
                    onClick={() => { setLabelPortionMode("grams"); setLabelPortion("50") }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                      labelPortionMode === "grams" ? "bg-cyan-600 text-white" : "text-gray-500",
                    )}
                  >
                    גרם
                  </button>
                  <button
                    onClick={() => { setLabelPortionMode("percent"); setLabelPortion("25") }}
                    disabled={!labelPackageGrams()}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all disabled:opacity-30",
                      labelPortionMode === "percent" ? "bg-cyan-600 text-white" : "text-gray-500",
                    )}
                  >
                    % מהאריזה
                  </button>
                </div>
                <input
                  type="number"
                  value={labelPortion}
                  onChange={e => setLabelPortion(e.target.value)}
                  className="w-16 bg-white rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none border border-gray-200 focus:border-cyan-400 text-center transition-colors"
                />
                <span className="text-[11px] text-gray-500">
                  {labelPortionMode === "units" ? "יח'" : labelPortionMode === "grams" ? "גרם" : "%"}
                </span>
              </div>

              {/* Unit weight unknown → let the user define it either by piece
                  count (needs package weight too) or by weighing one unit
                  directly on a kitchen scale (needs nothing else). */}
              {labelPortionMode === "units" && !labelUnitWeightG() && (
                <UnitDefinitionInput
                  hasPackageWeight={!!posNum(labelScan.packageWeightG)}
                  onConfirmCount={(units) =>
                    setLabelScan((prev) => (prev ? { ...prev, unitsPerPackage: units } : prev))
                  }
                  onConfirmWeight={(grams) =>
                    setLabelScan((prev) => (prev ? { ...prev, unitWeightG: grams } : prev))
                  }
                />
              )}

              {(() => {
                const grams = labelPortionGrams()
                if (!grams) return (
                  <p className="text-[10px] text-[#FF9500]/80">
                    {labelPortionMode === "units"
                      ? "הזן משקל אריזה ומספר יחידות כדי לחשב משקל יחידה"
                      : labelPortionMode === "percent" && !labelPackageGrams()
                      ? "הזן משקל אריזה כדי להשתמש באחוזים"
                      : "הזן כמות תקינה"}
                  </p>
                )
                const f = grams / 100
                const prefix = labelPortionMode === "units"
                  ? `${labelPortion} יח' (${Math.round(grams)} גרם)`
                  : `${Math.round(grams)} גרם`
                return (
                  <p className="text-[11px] font-semibold text-gray-700">
                    {prefix} = <span className="text-orange-500">{Math.round(labelScan.per100g.calories * f)} קק"ל</span> · <span className="text-[#007AFF]">{Math.round(labelScan.per100g.protein * f * 10) / 10}ג' חלב'</span> · <span className="text-emerald-600">{Math.round(labelScan.per100g.carbs * f * 10) / 10}ג' פחמ'</span> · <span className="text-amber-600">{Math.round(labelScan.per100g.fat * f * 10) / 10}ג' שומן</span>
                  </p>
                )
              })()}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLabelSaveProduct(v => !v)}
                  disabled={!labelPackageGrams()}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] transition-colors disabled:opacity-40",
                    labelSaveProduct && labelPackageGrams() ? "text-cyan-600" : "text-gray-400",
                  )}
                >
                  <span className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors",
                    labelSaveProduct && labelPackageGrams() ? "bg-cyan-600 border-cyan-500" : "border-gray-300",
                  )}>
                    {labelSaveProduct && !!labelPackageGrams() && <Check size={10} className="text-white" />}
                  </span>
                  שמור למתכונים שלי
                </button>
                {!labelPackageGrams() && (
                  <span className="text-[10px] text-gray-400">(נדרש משקל אריזה לשמירה)</span>
                )}
              </div>

              <button
                onClick={handleLogLabelPortion}
                disabled={labelLogging || !labelPortionGrams()}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-600/90 disabled:opacity-40 rounded-xl py-2.5 text-xs font-semibold text-white transition-colors"
              >
                {labelLogging ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {labelLogging ? "רושם..." : "רשום מנה"}
              </button>
            </div>
          )}

          {labelError && (
            <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2" dir="rtl">
              <AlertCircle size={13} className="shrink-0" />
              {labelError}
            </div>
          )}

          {scanResult && (() => {
            const t = scanResult.items.reduce(
              (acc, it) => ({
                calories: acc.calories + it.calories,
                protein:  acc.protein  + it.protein,
                carbs:    acc.carbs    + it.carbs,
                fat:      acc.fat      + it.fat,
              }),
              { calories: 0, protein: 0, carbs: 0, fat: 0 },
            )
            return (
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 space-y-1.5" dir="rtl">
                <p className="text-[11px] text-teal-600 font-semibold flex items-center gap-1.5">
                  <ScanLine size={12} /> זוהו {scanResult.items.length} פריטים — הועברו לשדה הקלט
                </p>
                <ul className="space-y-0.5">
                  {scanResult.items.map((item, i) => (
                    <li key={i} className="text-xs text-gray-500">
                      · {item.name}{" "}
                      <span className="text-gray-400">({item.quantity}{item.unit})</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold pt-0.5">
                  <span className="text-orange-500">{Math.round(t.calories)} קק&quot;ל</span>
                  <span className="text-[#007AFF]">{Math.round(t.protein)}ג&apos; חלב&apos;</span>
                  <span className="text-emerald-600">{Math.round(t.carbs)}ג&apos; פחמ&apos;</span>
                  <span className="text-amber-600">{Math.round(t.fat)}ג&apos; שומן</span>
                </div>
                {scanResult.insight && (
                  <p className="flex items-start gap-1.5 text-[11px] text-[#FF9500] bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mt-1">
                    <Lightbulb size={12} className="shrink-0 mt-0.5 text-[#FF9500]" />
                    {scanResult.insight}
                  </p>
                )}
              </div>
            )
          })()}

          {scanError && (
            <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle size={13} className="shrink-0" />
              {scanError}
            </div>
          )}

          {voiceError && (
            <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2" dir="rtl">
              <AlertCircle size={13} className="shrink-0" />
              {voiceError}
            </div>
          )}

          {voiceMeals && voiceMeals.length > 0 && (
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-2.5" dir="rtl">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-violet-600 font-semibold flex items-center gap-1.5">
                  <Mic size={12} /> זוהו {voiceMeals.length} ארוחות
                </p>
                <button
                  onClick={() => setVoiceMeals(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="סגור"
                >
                  <X size={13} />
                </button>
              </div>
              {voiceMeals.map((meal, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-[0_4px_16px_rgb(0,0,0,0.04)] p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={meal.mealName}
                      onChange={e => updateVoiceMeal(i, { mealName: e.target.value })}
                      className="flex-1 bg-transparent text-xs font-semibold text-violet-600 focus:outline-none border-b border-violet-100 focus:border-violet-400 pb-0.5 transition-colors"
                      dir="rtl"
                    />
                    {meal.insight && (
                      <button
                        onClick={() => setExpandedVoiceInsight(v => (v === i ? null : i))}
                        className={cn(
                          "shrink-0 transition-colors",
                          expandedVoiceInsight === i ? "text-[#FF9500]" : "text-[#FF9500]/60 hover:text-[#FF9500]/80",
                        )}
                        aria-label="טיפ תזונתי מה-AI"
                        title={meal.insight}
                      >
                        <Lightbulb size={13} />
                      </button>
                    )}
                  </div>
                  {expandedVoiceInsight === i && meal.insight && (
                    <p className="text-[11px] text-[#FF9500] bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5" dir="rtl">
                      💡 {meal.insight}
                    </p>
                  )}
                  {/* פריטים נפרדים — לא שורה אחת מסוכמת לכל הארוחה */}
                  <div className="space-y-1.5">
                    {meal.items.map((item, ii) => (
                      <div key={ii} className="bg-gray-50 rounded-lg p-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => updateVoiceMealItem(i, ii, { name: e.target.value })}
                            className="flex-1 bg-transparent text-xs font-medium text-gray-900 focus:outline-none border-b border-gray-200 focus:border-violet-400 pb-0.5 transition-colors"
                            dir="rtl"
                          />
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {item.quantity}{item.unit}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-semibold">
                          <label className="flex items-center gap-0.5 text-orange-600">
                            <input
                              type="number"
                              value={item.calories}
                              onChange={e => updateVoiceMealItem(i, ii, { calories: Number(e.target.value) || 0 })}
                              className="w-9 bg-transparent text-orange-600 text-[10px] font-semibold focus:outline-none text-center border-b border-orange-300 focus:border-orange-500"
                            />
                            קק&quot;ל
                          </label>
                          <label className="flex items-center gap-0.5 text-[#007AFF]">
                            <input
                              type="number"
                              value={item.protein}
                              onChange={e => updateVoiceMealItem(i, ii, { protein: Number(e.target.value) || 0 })}
                              className="w-7 bg-transparent text-[#007AFF] text-[10px] font-semibold focus:outline-none text-center border-b border-blue-200 focus:border-[#007AFF]"
                            />
                            ג&apos; חלב&apos;
                          </label>
                          <label className="flex items-center gap-0.5 text-emerald-600">
                            <input
                              type="number"
                              value={item.carbs}
                              onChange={e => updateVoiceMealItem(i, ii, { carbs: Number(e.target.value) || 0 })}
                              className="w-7 bg-transparent text-emerald-600 text-[10px] font-semibold focus:outline-none text-center border-b border-emerald-200 focus:border-emerald-500"
                            />
                            ג&apos; פחמ&apos;
                          </label>
                          <label className="flex items-center gap-0.5 text-amber-600">
                            <input
                              type="number"
                              value={item.fat}
                              onChange={e => updateVoiceMealItem(i, ii, { fat: Number(e.target.value) || 0 })}
                              className="w-7 bg-transparent text-amber-600 text-[10px] font-semibold focus:outline-none text-center border-b border-amber-200 focus:border-amber-500"
                            />
                            ג&apos; שומן
                          </label>
                          <label className="flex items-center gap-0.5 text-pink-600">
                            <input
                              type="number"
                              value={item.sugar}
                              onChange={e => updateVoiceMealItem(i, ii, { sugar: Number(e.target.value) || 0 })}
                              className="w-7 bg-transparent text-pink-600 text-[10px] font-semibold focus:outline-none text-center border-b border-pink-200 focus:border-pink-500"
                            />
                            ג&apos; סוכר
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={handleLogAllMeals}
                disabled={loggingVoice}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-600/90 disabled:opacity-40 rounded-xl py-2.5 text-xs font-semibold text-white transition-colors"
              >
                {loggingVoice ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                {loggingVoice
                  ? "רושם ארוחות..."
                  : `רשום את כל הארוחות (${voiceMeals.length})`}
              </button>
            </div>
          )}
        </div>

        {/* שגיאה */}
        {parseError && (
          <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2">
            <AlertCircle size={14} className="shrink-0" />
            {parseError}
          </div>
        )}

        {/* תוצאת ניתוח */}
        {lastAdded && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#34C759] font-semibold">
              <CheckCircle2 size={14} />
              נוסף בהצלחה — {lastAdded.items.length} פריטים
            </div>
            <div className="flex gap-3 text-xs text-gray-500">
              <span className="text-orange-500 font-bold">
                {Math.round(lastAdded.totals.calories)} קק"ל
              </span>
              <span className="text-[#007AFF] font-bold">
                {Math.round(lastAdded.totals.protein)} גר' חלבון
              </span>
              <span className="text-emerald-600">{Math.round(lastAdded.totals.carbs)} גר' פחמ'</span>
              <span className="text-amber-600">{Math.round(lastAdded.totals.fat)} גר' שומן</span>
            </div>
            <ul className="space-y-0.5">
              {lastAdded.items.map((item, i) => (
                <li key={i} className="text-xs text-gray-700">
                  · {item.name}{" "}
                  <span className="text-gray-400">
                    ({item.quantity} {item.unit})
                  </span>
                </li>
              ))}
            </ul>
            {lastAdded.insight && (
              <p className="flex items-start gap-1.5 text-[11px] text-[#FF9500] bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5" dir="rtl">
                <Lightbulb size={12} className="shrink-0 mt-0.5 text-[#FF9500]" />
                {lastAdded.insight}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── מתכונים שמורים ───────────────────────────────── */}
      <RecipePanel selectedMeal={selectedMeal} onLogSuccess={fetchToday} />

      {/* ── הצעת ארוחה ───────────────────────────────────── */}
      <MealSuggester
        remaining={{
          calories: Math.max(0, targets.calories - totals.calories),
          protein:  Math.max(0, Math.round((targets.protein - totals.protein) * 10) / 10),
          carbs:    Math.max(0, targets.carbs - totals.carbs),
          fats:     Math.max(0, Math.round((targets.fat - totals.fat) * 10) / 10),
        }}
        dietaryPreference={dietaryPreference}
        onUseSuggestion={handleUseSuggestion}
      />

      {/* ── קטעי ארוחות ──────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {MEALS.map(({ type, label, emoji }) => {
            const items = byMealType[type] ?? []
            const mealCal = items.reduce((s, i) => s + i.calories, 0)
            const mealProt = items.reduce((s, i) => s + i.protein, 0)
            const isOpen = openMeal === type

            return (
              <div key={type} className="bg-white rounded-2xl shadow-[0_4px_16px_rgb(0,0,0,0.04)] overflow-hidden">
                {/* כותרת ארוחה */}
                <button
                  onClick={() => setOpenMeal(isOpen ? null : type)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{emoji}</span>
                    <span className="text-sm font-semibold text-gray-900">{label}</span>
                    {items.length > 0 && (
                      <span className="text-[10px] bg-blue-50 text-[#007AFF] rounded-full px-1.5 py-0.5 font-medium">
                        {items.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {items.length > 0 && (
                      <div className="flex gap-2 text-xs">
                        <span className="text-gray-500">{Math.round(mealCal)} קק"ל</span>
                        <span className="text-[#007AFF] font-medium">
                          {Math.round(mealProt)} גר' ח'
                        </span>
                      </div>
                    )}
                    {items.length === 0 && <span className="text-xs text-gray-300">ריק</span>}
                    <ChevronLeft
                      size={16}
                      className={cn(
                        "text-gray-300 transition-transform duration-200",
                        isOpen ? "rotate-90" : "rtl:-rotate-180"
                      )}
                    />
                  </div>
                </button>

                {/* תוכן ארוחה */}
                {isOpen && (
                  <div className="px-4 pb-3 border-t border-gray-100">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-300 py-2">עדיין לא נרשמו מאכלים.</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
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
                      className="w-full mt-2 flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 hover:border-[#007AFF]/50 rounded-xl py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
