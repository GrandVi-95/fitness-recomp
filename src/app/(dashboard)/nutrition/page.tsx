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

interface ScanResult {
  ingredients: string
  calories:    number
  protein:     number
  carbs:       number
  fat:         number
}

interface VoiceMeal {
  mealName:    string
  ingredients: string
  calories:    number
  protein:     number
  carbs:       number
  fat:         number
  sugar:       number
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
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)

  // Camera scan state
  const [scanLoading, setScanLoading] = useState(false)
  const [scanResult,  setScanResult]  = useState<ScanResult | null>(null)
  const [scanError,   setScanError]   = useState<string | null>(null)

  // Voice recording state
  const [voiceState,   setVoiceState]   = useState<"idle" | "recording" | "processing">("idle")
  const [voiceTimer,   setVoiceTimer]   = useState(0)
  const [voiceMeals,   setVoiceMeals]   = useState<VoiceMeal[] | null>(null)
  const [voiceError,   setVoiceError]   = useState<string | null>(null)
  const [loggingVoice, setLoggingVoice] = useState(false)
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
      // Auto-fill the NLP text field with detected ingredients
      setNlpText(result.ingredients ?? "")
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
            directItems: [{
              name:     meal.mealName,
              calories: meal.calories,
              protein:  meal.protein,
              carbs:    meal.carbs,
              fat:      meal.fat,
              sugar:    meal.sugar,
            }],
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
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* ── כותרת ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">תזונה יומית</h1>
          <p className="text-sm text-slate-400 mt-0.5">מעקב מאקרו צמחוני</p>
        </div>

        {/* ── Coffee quick-log cluster ─────────────────────── */}
        <div className="relative flex items-center gap-1.5 mt-1">
          <button
            onClick={handleLogCoffee}
            disabled={coffeeLogging}
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200",
              coffeeSuccess
                ? "bg-emerald-600/80 text-white"
                : "bg-slate-800 text-amber-400 hover:bg-slate-700 active:scale-95",
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
              showCoffeeSettings ? "bg-slate-600 text-white" : "text-slate-500 hover:text-slate-300",
            )}
            title="הגדרות קפה"
          >
            <Settings size={13} />
          </button>

          {showCoffeeSettings && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCoffeeSettings(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700/60 rounded-2xl p-3 shadow-xl z-50 space-y-3"
                dir="rtl"
              >
                <p className="text-[11px] font-bold text-slate-300">סוג חלב</p>
                <div className="space-y-1">
                  {Object.values(MILK_PRESETS).map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleSetMilkPreset(preset.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all",
                        preferredMilkPreset === preset.id
                          ? "bg-amber-500/20 text-amber-300 font-semibold"
                          : "text-slate-400 hover:bg-slate-700/50",
                      )}
                    >
                      <span>{preset.name}</span>
                      <span className="text-[10px] opacity-60">{preset.calories} קק&quot;ל/100מ&quot;ל</span>
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-300 mb-1.5">כמות (מ&quot;ל)</p>
                  <div className="flex gap-1.5">
                    {[100, 125, 150, 200].map(vol => (
                      <button
                        key={vol}
                        onClick={() => handleSetMilkVolume(vol)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                          defaultMilkVolumeMl === vol
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-slate-700/50 text-slate-400 hover:bg-slate-700",
                        )}
                      >
                        {vol}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 text-center border-t border-slate-700/40 pt-2">
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
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2" dir="rtl">
          <AlertCircle size={13} className="shrink-0" />
          {coffeeError}
        </div>
      )}

      {/* ── Toggle: יום אימון / יום מנוחה ─────────────────── */}
      <div className="flex items-center gap-2 bg-slate-900/60 rounded-2xl p-1.5" dir="rtl">
        <button
          onClick={() => handleToggleTrainingDay(true)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            isTrainingDay
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
              : "text-slate-400 hover:text-slate-200",
          )}
        >
          <span>🏋️</span> יום אימון
        </button>
        <button
          onClick={() => handleToggleTrainingDay(false)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            !isTrainingDay
              ? "bg-slate-600 text-white shadow-lg shadow-slate-500/20"
              : "text-slate-400 hover:text-slate-200",
          )}
        >
          <span>🛌</span> יום מנוחה
        </button>
      </div>
      {!isTrainingDay && (
        <p className="text-[11px] text-slate-500 text-center -mt-3" dir="rtl">
          יעד קלוריות הופחת ב-15% · פחמימות ושומן מותאמים · חלבון נשמר מלא
        </p>
      )}

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

        {/* סרגל סוכר */}
        <div className="pt-1">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              סוכר יומי
            </span>
            <span className={sugarPct >= 100 ? "text-rose-400 font-semibold" : "text-slate-500"}>
              {Math.round(sugarToday)} / {sugarTarget} גר'
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
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
          <div className="flex gap-2">
            {/* Camera button */}
            <button
              onClick={() => scanInputRef.current?.click()}
              disabled={scanLoading || parsing || voiceState !== "idle"}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-teal-600/50 rounded-xl py-2 text-xs font-medium text-slate-400 hover:text-teal-300 transition-colors"
            >
              {scanLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin text-teal-400" />
                  <span className="text-teal-300">מנתח...</span>
                </>
              ) : (
                <>
                  <Camera size={13} className="text-teal-400" />
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
                  ? "bg-red-900/30 border-red-500/50 text-red-400 hover:bg-red-900/50"
                  : voiceState === "processing"
                  ? "bg-slate-800 border-slate-700 text-teal-300 opacity-100 cursor-not-allowed"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 hover:border-violet-600/50 text-slate-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {voiceState === "recording" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  {formatTimer(voiceTimer)}
                </>
              ) : voiceState === "processing" ? (
                <>
                  <Loader2 size={13} className="animate-spin text-teal-400" />
                  מפענח...
                </>
              ) : (
                <>
                  <Mic size={13} className="text-violet-400" />
                  הקלטת קול
                </>
              )}
            </button>
          </div>

          {scanResult && (
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 space-y-1.5" dir="rtl">
              <p className="text-[11px] text-teal-400 font-semibold flex items-center gap-1.5">
                <ScanLine size={12} /> זוהו מרכיבים — הועברו לשדה הקלט
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">{scanResult.ingredients}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold pt-0.5">
                <span className="text-orange-400">{scanResult.calories} קק"ל</span>
                <span className="text-indigo-400">{scanResult.protein}ג' חלב'</span>
                <span className="text-emerald-400">{scanResult.carbs}ג' פחמ'</span>
                <span className="text-amber-400">{scanResult.fat}ג' שומן</span>
              </div>
            </div>
          )}

          {scanError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">
              <AlertCircle size={13} className="shrink-0" />
              {scanError}
            </div>
          )}

          {voiceError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2" dir="rtl">
              <AlertCircle size={13} className="shrink-0" />
              {voiceError}
            </div>
          )}

          {voiceMeals && voiceMeals.length > 0 && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 space-y-2.5" dir="rtl">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-violet-400 font-semibold flex items-center gap-1.5">
                  <Mic size={12} /> זוהו {voiceMeals.length} ארוחות
                </p>
                <button
                  onClick={() => setVoiceMeals(null)}
                  className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label="סגור"
                >
                  <X size={13} />
                </button>
              </div>
              {voiceMeals.map((meal, i) => (
                <div key={i} className="bg-slate-900/70 rounded-lg p-2.5 space-y-1.5">
                  <input
                    type="text"
                    value={meal.mealName}
                    onChange={e => updateVoiceMeal(i, { mealName: e.target.value })}
                    className="w-full bg-transparent text-xs font-semibold text-violet-300 focus:outline-none border-b border-violet-500/20 focus:border-violet-400/60 pb-0.5 transition-colors"
                    dir="rtl"
                  />
                  <textarea
                    value={meal.ingredients}
                    onChange={e => updateVoiceMeal(i, { ingredients: e.target.value })}
                    rows={2}
                    className="w-full bg-transparent text-xs text-slate-400 leading-relaxed focus:outline-none border-b border-slate-600/20 focus:border-slate-500/40 resize-none transition-colors pb-0.5"
                    dir="rtl"
                  />
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-semibold pt-0.5">
                    <label className="flex items-center gap-0.5 text-orange-400">
                      <input
                        type="number"
                        value={meal.calories}
                        onChange={e => updateVoiceMeal(i, { calories: Number(e.target.value) || 0 })}
                        className="w-10 bg-transparent text-orange-400 text-[11px] font-semibold focus:outline-none text-center border-b border-orange-400/30 focus:border-orange-400/60"
                      />
                      קק&quot;ל
                    </label>
                    <label className="flex items-center gap-0.5 text-indigo-400">
                      <input
                        type="number"
                        value={meal.protein}
                        onChange={e => updateVoiceMeal(i, { protein: Number(e.target.value) || 0 })}
                        className="w-8 bg-transparent text-indigo-400 text-[11px] font-semibold focus:outline-none text-center border-b border-indigo-400/30 focus:border-indigo-400/60"
                      />
                      ג&apos; חלב&apos;
                    </label>
                    <label className="flex items-center gap-0.5 text-emerald-400">
                      <input
                        type="number"
                        value={meal.carbs}
                        onChange={e => updateVoiceMeal(i, { carbs: Number(e.target.value) || 0 })}
                        className="w-8 bg-transparent text-emerald-400 text-[11px] font-semibold focus:outline-none text-center border-b border-emerald-400/30 focus:border-emerald-400/60"
                      />
                      ג&apos; פחמ&apos;
                    </label>
                    <label className="flex items-center gap-0.5 text-amber-400">
                      <input
                        type="number"
                        value={meal.fat}
                        onChange={e => updateVoiceMeal(i, { fat: Number(e.target.value) || 0 })}
                        className="w-8 bg-transparent text-amber-400 text-[11px] font-semibold focus:outline-none text-center border-b border-amber-400/30 focus:border-amber-400/60"
                      />
                      ג&apos; שומן
                    </label>
                    <label className="flex items-center gap-0.5 text-pink-400">
                      <input
                        type="number"
                        value={meal.sugar}
                        onChange={e => updateVoiceMeal(i, { sugar: Number(e.target.value) || 0 })}
                        className="w-8 bg-transparent text-pink-400 text-[11px] font-semibold focus:outline-none text-center border-b border-pink-400/30 focus:border-pink-400/60"
                      />
                      ג&apos; סוכר
                    </label>
                  </div>
                </div>
              ))}
              <button
                onClick={handleLogAllMeals}
                disabled={loggingVoice}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl py-2.5 text-xs font-semibold text-white transition-colors"
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
