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
      if (data.ingredients) {
        setIngredients((prev) => (prev ? `${prev}, ${data.ingredients}` : data.ingredients))
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
      // Concatenate all meal ingredients from voice response into the ingredients field
      const all = (data.meals ?? [])
        .map((m: { ingredients: string }) => m.ingredients)
        .filter(Boolean)
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
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 space-y-3">
      <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
        <ChefHat size={13} /> מתכון חדש
      </p>

      {/* Recipe name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="שם המתכון (לדוגמה: פאי טופו גדול)"
        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 placeholder:text-slate-600 transition-colors"
        dir="rtl"
      />

      {/* Ingredients textarea */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-amber-500/60 transition-colors">
        <textarea
          rows={3}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder="רכיבים וכמויות לכל המתכון (400 גרם טופו, 2 כפות שמן זית, 100 גרם תרד...)"
          className="w-full bg-transparent text-sm focus:outline-none placeholder:text-slate-600 resize-none"
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
          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 hover:border-teal-600/50 rounded-xl py-1.5 text-xs text-slate-400 hover:text-teal-300 transition-colors"
        >
          {scanLoading ? (
            <><Loader2 size={12} className="animate-spin text-teal-400" /> מנתח...</>
          ) : (
            <><Camera size={12} className="text-teal-400" /> תמונה</>
          )}
        </button>
        <button
          onClick={handleVoiceClick}
          disabled={scanLoading}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs transition-colors border",
            voiceState === "recording"
              ? "bg-red-900/30 border-red-500/50 text-red-400"
              : voiceState === "processing"
              ? "bg-slate-900 border-slate-700 text-teal-300 cursor-not-allowed"
              : "bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-violet-600/50 text-slate-400 hover:text-violet-300 disabled:opacity-40"
          )}
        >
          {voiceState === "recording" ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{formatTimer(voiceTimer)}</>
          ) : voiceState === "processing" ? (
            <><Loader2 size={12} className="animate-spin text-teal-400" /> מפענח...</>
          ) : (
            <><Mic size={12} className="text-violet-400" /> הקלטה</>
          )}
        </button>
      </div>

      {/* Scan / voice errors */}
      {(scanError ?? voiceError) && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2" dir="rtl">
          <AlertCircle size={12} className="shrink-0" />
          {scanError ?? voiceError}
        </div>
      )}

      {/* Analyze button */}
      {ingredients.trim() && !analyzed && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full flex items-center justify-center gap-1.5 bg-amber-600/15 hover:bg-amber-600/25 disabled:opacity-40 border border-amber-600/30 rounded-xl py-2 text-xs font-medium text-amber-300 transition-colors"
        >
          {analyzing ? (
            <><Loader2 size={12} className="animate-spin" /> מחשב מאקרו...</>
          ) : (
            "✦ חשב מאקרו כולל למתכון"
          )}
        </button>
      )}

      {analyzeError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2" dir="rtl">
          <AlertCircle size={12} className="shrink-0" />
          {analyzeError}
        </div>
      )}

      {/* Macros preview + save */}
      {analyzed && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 space-y-2.5" dir="rtl">
          <p className="text-[11px] text-amber-400 font-semibold">מאקרו עבור המתכון כולו:</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold">
            <span className="text-orange-400">{analyzed.totalCalories} קק"ל</span>
            <span className="text-indigo-400">{analyzed.totalProtein}ג' חלב'</span>
            <span className="text-emerald-400">{analyzed.totalCarbs}ג' פחמ'</span>
            <span className="text-amber-400">{analyzed.totalFat}ג' שומן</span>
          </div>

          {/* Default serving % */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">מנה סטנדרטית:</span>
            <input
              type="number"
              value={defaultPct}
              min={1}
              max={100}
              step={1}
              onChange={(e) => setDefaultPct(Math.max(1, Math.min(100, Number(e.target.value) || 25)))}
              className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-amber-500/60"
              dir="ltr"
            />
            <span className="text-xs text-slate-500">%</span>
            <span className="text-xs text-slate-600 ms-auto">
              ≈ {Math.round(analyzed.totalCalories * defaultPct / 100)} קק"ל
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-xl py-2.5 text-xs font-semibold text-white transition-colors"
          >
            {saving ? (
              <><Loader2 size={12} className="animate-spin" /> שומר...</>
            ) : (
              <><Save size={12} /> שמור מתכון</>
            )}
          </button>

          {saveError && (
            <div className="flex items-center gap-2 text-xs text-red-400" dir="rtl">
              <AlertCircle size={11} /> {saveError}
            </div>
          )}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 rounded-xl px-3 py-2" dir="rtl">
          <CheckCircle2 size={12} className="shrink-0" />
          המתכון נשמר בהצלחה!
        </div>
      )}
    </div>
  )
}
