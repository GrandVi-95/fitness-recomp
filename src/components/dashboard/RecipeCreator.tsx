"use client"

import { useState, useRef, useEffect } from "react"
import {
  Camera,
  Mic,
  Loader2,
  ChefHat,
  Save,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface RecipeMacros {
  totalCalories: number
  totalProtein:  number
  totalCarbs:    number
  totalFat:      number
  totalSugar:    number
}

interface Props {
  onSaved?: () => void
}

export default function RecipeCreator({ onSaved }: Props) {
  const [name,        setName]        = useState("")
  const [ingredients, setIngredients] = useState("")
  const [defaultPct,  setDefaultPct]  = useState(25)

  const [analyzing,    setAnalyzing]    = useState(false)
  const [analyzed,     setAnalyzed]     = useState<RecipeMacros | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Camera
  const scanInputRef               = useRef<HTMLInputElement>(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError,   setScanError]   = useState<string | null>(null)

  // Voice
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle")
  const [voiceTimer, setVoiceTimer] = useState(0)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaStreamRef   = useRef<MediaStream | null>(null)

  // Reset analysis when ingredients change
  useEffect(() => { setAnalyzed(null) }, [ingredients])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const formatTimer = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

  // ── Camera scan ─────────────────────────────────────────────
  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanLoading(true)
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
      if (!res.ok) { setScanError(data.error ?? "שגיאה בניתוח התמונה"); return }
      // /api/ai/analyze-image now returns one entry per distinct food item —
      // rebuild a comma-separated ingredients string from them.
      const items = (data.items ?? []) as Array<{ name: string; quantity: number; unit: string }>
      const detected = items.map((it) => `${it.name} ${it.quantity}${it.unit}`).join(", ")
      if (detected) {
        setIngredients((prev) => (prev ? `${prev}, ${detected}` : detected))
      }
    } catch {
      setScanError("שגיאה בניתוח התמונה — נסה שוב")
    } finally {
      setScanLoading(false)
      if (scanInputRef.current) scanInputRef.current.value = ""
    }
  }

  // ── Voice recording ─────────────────────────────────────────
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
      if (!res.ok) { setVoiceError(data.error ?? "שגיאה בניתוח ההקלטה"); return }
      // /api/ai/analyze-voice now returns one item per distinct food item per
      // meal — flatten every meal's items into one ingredients string.
      type VoiceItem = { name: string; quantity: number; unit: string }
      const meals = (data.meals ?? []) as Array<{ items?: VoiceItem[] }>
      const all = meals
        .flatMap((m) => m.items ?? [])
        .map((it) => `${it.name} ${it.quantity}${it.unit}`)
        .join(", ")
      if (all) setIngredients((prev) => (prev ? `${prev}, ${all}` : all))
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
      setVoiceError("הדפדפן אינו תומך בהקלטת שמע")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
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

  // ── Analyze total batch macros ───────────────────────────────
  const handleAnalyze = async () => {
    if (!ingredients.trim()) return
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const res  = await fetch("/api/ai/analyze-recipe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ingredientsText: ingredients }),
      })
      const data = await res.json()
      if (!res.ok) { setAnalyzeError(data.error ?? "שגיאה בניתוח"); return }
      setAnalyzed(data as RecipeMacros)
    } catch {
      setAnalyzeError("שגיאה בניתוח — נסה שוב")
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Save recipe ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim() || !analyzed) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/recipes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:              name.trim(),
          ingredients:       ingredients.trim(),
          defaultServingPct: defaultPct,
          ...analyzed,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error ?? "שגיאה בשמירה"); return }
      setSaved(true)
      setName("")
      setIngredients("")
      setAnalyzed(null)
      setDefaultPct(25)
      onSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setSaveError("שגיאה בשמירה — נסה שוב")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3.5 space-y-3">
      <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
        <ChefHat size={13} /> מתכון חדש
      </p>

      {/* Recipe name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="שם המתכון (לדוגמה: פאי טופו גדול)"
        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-amber-400 placeholder:text-gray-300 transition-colors"
        dir="rtl"
      />

      {/* Ingredients textarea */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400 transition-colors">
        <textarea
          rows={3}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder="רכיבים וכמויות לכל המתכון (400 גרם טופו, 2 כפות שמן זית, 100 גרם תרד...)"
          className="w-full bg-transparent text-sm text-gray-900 focus:outline-none placeholder:text-gray-300 resize-none"
          dir="rtl"
        />
      </div>

      {/* Camera + mic shortcuts */}
      <div className="flex gap-2">
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleScan}
        />
        <button
          onClick={() => scanInputRef.current?.click()}
          disabled={scanLoading || voiceState !== "idle"}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 border border-gray-200 hover:border-teal-400/60 rounded-xl py-1.5 text-xs text-gray-500 hover:text-teal-600 transition-colors"
        >
          {scanLoading ? (
            <><Loader2 size={12} className="animate-spin text-teal-500" /> מנתח...</>
          ) : (
            <><Camera size={12} className="text-teal-500" /> תמונה</>
          )}
        </button>
        <button
          onClick={handleVoiceClick}
          disabled={scanLoading}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs transition-colors border",
            voiceState === "recording"
              ? "bg-red-50 border-red-200 text-[#FF3B30]"
              : voiceState === "processing"
              ? "bg-white border-gray-200 text-teal-600 cursor-not-allowed"
              : "bg-white hover:bg-gray-50 border-gray-200 hover:border-violet-400/60 text-gray-500 hover:text-violet-600 disabled:opacity-40"
          )}
        >
          {voiceState === "recording" ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{formatTimer(voiceTimer)}</>
          ) : voiceState === "processing" ? (
            <><Loader2 size={12} className="animate-spin text-teal-500" /> מפענח...</>
          ) : (
            <><Mic size={12} className="text-violet-500" /> הקלטה</>
          )}
        </button>
      </div>

      {/* Scan / voice errors */}
      {(scanError ?? voiceError) && (
        <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2" dir="rtl">
          <AlertCircle size={12} className="shrink-0" />
          {scanError ?? voiceError}
        </div>
      )}

      {/* Analyze button */}
      {ingredients.trim() && !analyzed && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 border border-amber-200 rounded-xl py-2 text-xs font-medium text-amber-700 transition-colors"
        >
          {analyzing ? (
            <><Loader2 size={12} className="animate-spin" /> מחשב מאקרו...</>
          ) : (
            "✦ חשב מאקרו כולל למתכון"
          )}
        </button>
      )}

      {analyzeError && (
        <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2" dir="rtl">
          <AlertCircle size={12} className="shrink-0" />
          {analyzeError}
        </div>
      )}

      {/* Macros preview + save */}
      {analyzed && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2.5" dir="rtl">
          <p className="text-[11px] text-amber-700 font-semibold">מאקרו עבור המתכון כולו:</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold">
            <span className="text-[#FF9500]">{analyzed.totalCalories} קק"ל</span>
            <span className="text-[#007AFF]">{analyzed.totalProtein}ג' חלב'</span>
            <span className="text-[#34C759]">{analyzed.totalCarbs}ג' פחמ'</span>
            <span className="text-amber-600">{analyzed.totalFat}ג' שומן</span>
          </div>

          {/* Default serving % */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">מנה סטנדרטית:</span>
            <input
              type="number"
              value={defaultPct}
              min={1}
              max={100}
              step={1}
              onChange={(e) => setDefaultPct(Math.max(1, Math.min(100, Number(e.target.value) || 25)))}
              className="w-14 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-center text-gray-900 focus:outline-none focus:border-amber-400"
              dir="ltr"
            />
            <span className="text-xs text-gray-400">%</span>
            <span className="text-xs text-gray-400 ms-auto">
              ≈ {Math.round(analyzed.totalCalories * defaultPct / 100)} קק"ל
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 rounded-full py-2.5 text-xs font-semibold text-white active:scale-95 transition"
          >
            {saving ? (
              <><Loader2 size={12} className="animate-spin" /> שומר...</>
            ) : (
              <><Save size={12} /> שמור מתכון</>
            )}
          </button>

          {saveError && (
            <div className="flex items-center gap-2 text-xs text-[#FF3B30]" dir="rtl">
              <AlertCircle size={11} /> {saveError}
            </div>
          )}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 text-xs text-[#34C759] bg-green-50 rounded-xl px-3 py-2" dir="rtl">
          <CheckCircle2 size={12} className="shrink-0" />
          המתכון נשמר בהצלחה!
        </div>
      )}
    </div>
  )
}
