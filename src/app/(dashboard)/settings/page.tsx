"use client"

import { useEffect, useState } from "react"
import {
  Settings,
  Bot,
  Target,
  Key,
  ChevronDown,
  Save,
  CheckCircle2,
  AlertCircle,
  Calculator,
  Trash2,
  ShieldAlert,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"

const AI_PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai",    label: "OpenAI (GPT-4o)"   },
  { value: "gemini",    label: "Google Gemini"      },
]

interface SettingsData {
  name: string
  targetCalories: number
  targetProtein: number
  latestWeight: number | null
  calculatedProtein: number | null
  aiProvider: string
  aiApiKeySet: boolean
  autoProteinGoal: boolean
}

export default function SettingsPage() {
  const [data, setData]           = useState<SettingsData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [caloriesError, setCaloriesError] = useState<string | null>(null)

  // Danger Zone state
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState("")
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  // form fields
  const [displayName, setDisplayName]         = useState("")
  const [aiProvider, setAiProvider]           = useState("anthropic")
  const [apiKey, setApiKey]                   = useState("")
  const [autoProtein, setAutoProtein]         = useState(true)
  const [manualProtein, setManualProtein]     = useState(185)
  const [manualCalories, setManualCalories]   = useState(2600)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: SettingsData) => {
        setData(d)
        setDisplayName(d.name ?? "")
        setAiProvider(d.aiProvider)
        setAutoProtein(d.autoProteinGoal)
        setManualProtein(d.targetProtein)
        setManualCalories(d.targetCalories)
      })
      .catch(() => setError("שגיאה בטעינת ההגדרות"))
      .finally(() => setLoading(false))
  }, [])

  const effectiveProtein = autoProtein
    ? (data?.calculatedProtein ?? manualProtein)
    : manualProtein

  const handleSave = async () => {
    // Front-end calories validation
    if (manualCalories < 1000 || manualCalories > 10000 || !manualCalories) {
      setCaloriesError('יעד קלוריות חייב להיות בין 1,000 ל-10,000 קק"ל')
      return
    }
    setCaloriesError(null)

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name: displayName.trim(),
        aiProvider,
        autoProteinGoal: autoProtein,
        targetCalories: manualCalories,
        targetProtein: autoProtein ? effectiveProtein : manualProtein,
      }
      if (apiKey.trim()) body.aiApiKey = apiKey.trim()

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? "server error")
      }
      setSaved(true)
      setApiKey("")
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירה נכשלה — אנא נסה שוב.")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (resetConfirmText !== "איפוס") return
    setResetting(true)
    try {
      const res = await fetch("/api/settings/reset", { method: "POST" })
      if (!res.ok) throw new Error()
      setResetDone(true)
      setShowResetModal(false)
      setResetConfirmText("")
    } catch {
      alert("שגיאה באיפוס — אנא נסה שוב")
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-slate-500">
        טוען הגדרות…
      </div>
    )
  }

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* כותרת */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-slate-800 text-indigo-400">
          <Settings size={20} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-bold">הגדרות</h1>
          <p className="text-xs text-slate-500">פרופיל · בינה מלאכותית · יעדי תזונה</p>
        </div>
      </div>

      {/* ───── פרופיל אישי ───── */}
      <section className="bg-slate-900 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
          <User size={15} className="text-indigo-400" /> פרופיל אישי
        </h2>
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">שם</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="הזן את שמך..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
          />
          <p className="text-[11px] text-slate-500">
            מוצג בדשבורד:{" "}
            <span className="text-indigo-300">שלום, {displayName.trim() || "ספורטאי"} 👋</span>
          </p>
        </div>
      </section>

      {/* ───── ספק AI ───── */}
      <section className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
          <Bot size={15} className="text-indigo-400" /> ספק בינה מלאכותית
        </h2>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">ספק NLP לרישום תזונה</label>
          <div className="relative">
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 flex items-center gap-1.5">
            <Key size={11} />
            {data?.aiApiKeySet ? "החלפת מפתח API" : "מפתח API"}{" "}
            <span className="text-slate-600">(יישמר באופן מקומי)</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={data?.aiApiKeySet ? "••••••••  (שמור)" : "sk-..."}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
          />
          {aiProvider === "anthropic" && !data?.aiApiKeySet && (
            <p className="text-[11px] text-slate-500">
              ברירת המחדל: מפתח ה-ANTHROPIC_API_KEY מקובץ .env
            </p>
          )}
        </div>
      </section>

      {/* ───── יעדי חלבון ───── */}
      <section className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
          <Target size={15} className="text-indigo-400" /> יעד חלבון יומי
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">חישוב אוטומטי</p>
            <p className="text-[11px] text-slate-500">
              משקל × 2.1{" "}
              {data?.latestWeight
                ? `(${data.latestWeight} ק"ג → ${data.calculatedProtein} גר')`
                : "(אין משקל מדווח)"}
            </p>
          </div>
          <button
            onClick={() => setAutoProtein((v) => !v)}
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors",
              autoProtein ? "bg-indigo-600" : "bg-slate-700"
            )}
            aria-pressed={autoProtein}
          >
            <span
              className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                autoProtein ? "end-0.5 start-auto" : "start-0.5 end-auto"
              )}
            />
          </button>
        </div>

        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border",
            autoProtein
              ? "border-indigo-500/30 bg-indigo-500/10"
              : "border-slate-700 bg-slate-800"
          )}
        >
          <Calculator size={16} className={autoProtein ? "text-indigo-400" : "text-slate-400"} />
          <div>
            <p className="text-[11px] text-slate-500">
              {autoProtein ? "יעד חלבון מחושב" : "יעד חלבון ידני"}
            </p>
            <p className="text-lg font-black text-indigo-300">
              {effectiveProtein} <span className="text-sm font-normal text-slate-400">גר' / יום</span>
            </p>
          </div>
        </div>

        {!autoProtein && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">חלבון (גר')</label>
              <input
                type="number"
                value={manualProtein}
                min={100}
                max={350}
                onChange={(e) => setManualProtein(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 text-center font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">קלוריות (קק"ל)</label>
              <input
                type="number"
                value={manualCalories}
                min={1000}
                max={10000}
                step={50}
                onChange={(e) => { setManualCalories(Number(e.target.value)); setCaloriesError(null) }}
                className={cn(
                  "w-full bg-slate-800 border rounded-xl px-3 py-2.5 text-sm text-slate-100 text-center font-semibold focus:outline-none focus:border-indigo-500",
                  caloriesError ? "border-red-500" : "border-slate-700"
                )}
              />
            </div>
          </div>
        )}

        {autoProtein && (
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">יעד קלוריות (קק"ל)</label>
            <input
              type="number"
              value={manualCalories}
              min={1000}
              max={10000}
              step={50}
              onChange={(e) => { setManualCalories(Number(e.target.value)); setCaloriesError(null) }}
              className={cn(
                "w-full bg-slate-800 border rounded-xl px-3 py-2.5 text-sm text-slate-100 text-center font-semibold focus:outline-none focus:border-indigo-500",
                caloriesError ? "border-red-500" : "border-slate-700"
              )}
            />
          </div>
        )}

        {/* Inline calories validation error */}
        {caloriesError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">
            <AlertCircle size={13} className="shrink-0" /> {caloriesError}
          </div>
        )}
      </section>

      {/* ───── שגיאה כללית ───── */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ───── Success Toast ───── */}
      {saved && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl px-4 py-3 text-sm">
          <CheckCircle2 size={16} /> ההגדרות נשמרו בהצלחה ✓
        </div>
      )}

      {/* ───── כפתור שמירה ───── */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-colors",
          saved
            ? "bg-green-600 hover:bg-green-500"
            : "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
        )}
      >
        {saving ? (
          <><span className="animate-spin">◌</span> שומר…</>
        ) : saved ? (
          <><CheckCircle2 size={20} /> נשמר בהצלחה!</>
        ) : (
          <><Save size={20} /> שמור הגדרות</>
        )}
      </button>

      {/* ───── אזור מסוכן ───── */}
      <section className="border border-red-500/30 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-red-400">
          <ShieldAlert size={15} /> אזור מסוכן
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-red-400/80">נמחק:</span> סשנים, סטים, יומני תזונה, מדדי גוף ותמונות.
          {" "}<span className="text-green-400/80">נשמר:</span> תוכניות אימון, ספריית תרגילים, מסד מזון והגדרות AI.
        </p>
        {resetDone && (
          <p className="text-xs text-green-400 flex items-center gap-1.5">
            <CheckCircle2 size={13} /> הנתונים אופסו בהצלחה.
          </p>
        )}
        <button
          onClick={() => { setShowResetModal(true); setResetConfirmText("") }}
          className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          <Trash2 size={15} /> איפוס נתוני מערכת
        </button>
      </section>

      {/* ───── מודל אישור איפוס (redesigned) ───── */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="bg-slate-900 border border-red-500/40 rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-red-400">
              <ShieldAlert size={20} />
              <h3 className="text-base font-bold">אישור איפוס</h3>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              פעולה זו תמחק לצמיתות את כל נתוני האימון, התזונה, ומדדי הגוף שלך.
            </p>

            {/* Confirmation input — styled as a clear text field */}
            <div className="space-y-2">
              <label className="text-xs text-slate-400">
                הקלד <span className="font-bold text-red-400">איפוס</span> לאישור:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="הקלד 'איפוס' לאישור..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                autoFocus
                dir="rtl"
              />
            </div>

            {/* Reset button — full-width, below input, disabled until text matches */}
            <button
              onClick={handleReset}
              disabled={resetConfirmText !== "איפוס" || resetting}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 text-sm font-bold text-white transition-colors"
            >
              {resetting
                ? <><span className="animate-spin">◌</span> מאפס…</>
                : <><Trash2 size={14} /> אפס נתונים</>}
            </button>

            {/* Cancel */}
            <button
              onClick={() => setShowResetModal(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl py-2.5 text-sm font-semibold text-slate-300 transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
