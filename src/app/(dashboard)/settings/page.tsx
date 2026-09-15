"use client"

import { useEffect, useMemo, useState } from "react"
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
  Bell,
  Lock,
  LogOut,
  Dumbbell,
  Flame,
  Zap,
  Mail,
  Send,
  XCircle,
  Palmtree,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  calculateBMR,
  calculateTDEE,
  calculateCurrentTarget,
  calculateAutoProtein,
  calculateTargetFats,
  calculateTargetCarbs,
} from "@/utils/nutrition-math"
import { useRouter } from "next/navigation"

// ── Constants ────────────────────────────────────────────────────────────────

const AI_PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai",    label: "OpenAI (GPT-4o)" },
  { value: "gemini",    label: "Google Gemini" },
]

const ACTIVITY_LEVELS = [
  { value: 1.2,   label: "בעיקר יושב (×1.2)" },
  { value: 1.375, label: "קל — 1-2 ימי כושר/שבוע (×1.375)" },
  { value: 1.45,  label: "בינוני — 3 ימי כושר/שבוע (×1.45)" },
  { value: 1.55,  label: "פעיל — 4-5 ימי כושר/שבוע (×1.55)" },
  { value: 1.725, label: "מאוד פעיל — 6-7 ימים (×1.725)" },
  { value: 1.9,   label: "ספורטאי מקצועי (×1.9)" },
]

// Shared "bento box" card treatment — matches the dashboard page / other pages.
const CARD = "bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)]"

// ── Types ────────────────────────────────────────────────────────────────────

interface SettingsData {
  name: string
  targetCalories: number
  targetProtein: number
  targetFats: number
  targetCarbs: number
  latestWeight: number | null
  calculatedProtein: number | null
  calculatedCalories: number | null
  aiProvider: string
  aiApiKeySet: boolean
  autoProteinGoal: boolean
  autoCalorieGoal: boolean
  smartAlertsEnabled: boolean
  showWeeklySummary: boolean
  height: number
  age: number
  gender: string
  activityMultiplier: number
  dietaryPreference: string
  reportEnabled: boolean
  reportEmail: string
  calorieAdjustmentOffset: number
  vacationMode: boolean
}

// ── Small shared components ──────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors",
        enabled ? "bg-[#007AFF]" : "bg-gray-200",
      )}
      aria-pressed={enabled}
    >
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
          enabled ? "end-0.5 start-auto" : "start-0.5 end-auto",
        )}
      />
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-gray-400">{children}</label>
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 text-center font-semibold focus:outline-none focus:border-[#007AFF]"
      />
      {unit && (
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
          {unit}
        </span>
      )}
    </div>
  )
}

function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#007AFF] bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
      <Zap size={9} /> מחושב אוטומטית
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const [data, setData]       = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Danger Zone
  const [showResetModal, setShowResetModal]   = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState("")
  const [resetting, setResetting]             = useState(false)
  const [resetDone, setResetDone]             = useState(false)

  // ── Form state ──────────────────────────────────────────────────────────────

  // Profile
  const [displayName, setDisplayName] = useState("")

  // Body profile
  const [weight, setWeight]                     = useState<number>(70)
  const [height, setHeight]                     = useState(183)
  const [age, setAge]                           = useState(31)
  const [gender, setGender]                     = useState("male")
  const [activityMultiplier, setActivityMultiplier] = useState(1.45)
  // Persistent, cumulative bi-weekly check-in correction — read-only here
  // (only the check-in engine changes it), shown so the formula breakdown
  // below is fully transparent.
  const [calorieAdjustmentOffset, setCalorieAdjustmentOffset] = useState(0)

  // Nutrition auto toggles
  const [autoCalorieGoal, setAutoCalorieGoal] = useState(true)
  const [autoProtein, setAutoProtein]         = useState(true)

  // Manual overrides (only active when the corresponding auto toggle is off)
  const [manualCalories, setManualCalories] = useState(2600)
  const [manualProtein, setManualProtein]   = useState(185)

  // AI
  const [aiProvider, setAiProvider] = useState("anthropic")
  const [apiKey, setApiKey]         = useState("")

  // Dietary preference
  const [dietaryPreference, setDietaryPreference] = useState("vegetarian")

  // Display
  const [smartAlertsEnabled, setSmartAlertsEnabled] = useState(true)
  const [showWeeklySummary, setShowWeeklySummary]   = useState(true)

  // Vacation Mode — pauses the Lean Gain check-in engine entirely
  const [vacationMode, setVacationMode] = useState(false)

  // Weekly report
  const [reportEnabled, setReportEnabled] = useState(true)
  const [reportEmail, setReportEmail]     = useState("")
  const [sendingTest, setSendingTest]     = useState(false)
  const [testResult, setTestResult]       = useState<"success" | "error" | null>(null)
  const [testError, setTestError]         = useState<string | null>(null)

  // ── Load from server ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: SettingsData) => {
        setData(d)
        setDisplayName(d.name ?? "")
        setWeight(d.latestWeight ?? 70)
        setHeight(d.height)
        setAge(d.age)
        setGender(d.gender)
        setActivityMultiplier(d.activityMultiplier)
        setAutoCalorieGoal(d.autoCalorieGoal)
        setAutoProtein(d.autoProteinGoal)
        setManualCalories(d.targetCalories)
        setManualProtein(d.targetProtein)
        setAiProvider(d.aiProvider)
        setSmartAlertsEnabled(d.smartAlertsEnabled ?? true)
        setShowWeeklySummary(d.showWeeklySummary ?? true)
        setDietaryPreference(d.dietaryPreference ?? "vegetarian")
        setReportEnabled(d.reportEnabled ?? true)
        setReportEmail(d.reportEmail ?? "")
        setCalorieAdjustmentOffset(d.calorieAdjustmentOffset ?? 0)
        setVacationMode(d.vacationMode ?? false)
      })
      .catch(() => setError("שגיאה בטעינת ההגדרות"))
      .finally(() => setLoading(false))
  }, [])

  // ── Live-calculated targets (instant preview as body-profile fields change) ──

  const { bmr, tdee, currentTarget, autoProteinG, autoFatsG } = useMemo(() => {
    const w = weight > 0 ? weight : 0
    const bmr  = w > 0 ? calculateBMR(w, height, age, gender) : 0
    const tdee = bmr  > 0 ? calculateTDEE(bmr, activityMultiplier) : 0
    const currentTarget = tdee > 0 ? calculateCurrentTarget(tdee, calorieAdjustmentOffset) : 0
    return {
      bmr,
      tdee,
      currentTarget,
      autoProteinG: w > 0 ? calculateAutoProtein(w) : 0,
      autoFatsG:    w > 0 ? calculateTargetFats(w) : 0,
    }
  }, [weight, height, age, gender, activityMultiplier, calorieAdjustmentOffset])

  // Controlled Lean Gain: auto calories = (TDEE × 1.05) + the persistent
  // check-in offset — never raw TDEE. Fat is always weight-based (g/kg) —
  // there's no manual-fat override in this UI, only manual calories/protein.
  const effectiveCalories = autoCalorieGoal ? currentTarget : manualCalories
  const effectiveProtein  = autoProtein     ? autoProteinG  : manualProtein
  const effectiveFats     = autoFatsG
  const effectiveCarbs    = effectiveCalories > 0 && effectiveFats > 0
    ? calculateTargetCarbs(effectiveCalories, effectiveProtein, effectiveFats)
    : 0

  // Vacation Mode toggles immediately (not batched into the main save button)
  // — it's a mode switch, not a form field, so it should take effect the
  // instant it's flipped.
  const handleToggleVacation = async (value: boolean) => {
    setVacationMode(value)
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacationMode: value }),
      })
    } catch {
      // Best-effort — the next full form save will still pick this up.
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name: displayName.trim(),
        aiProvider,
        autoCalorieGoal,
        autoProteinGoal: autoProtein,
        smartAlertsEnabled,
        showWeeklySummary,
        vacationMode,
        dietaryPreference,
        reportEnabled,
        reportEmail: reportEmail.trim(),
        // Body profile — always sent so targets stay in sync
        weight,
        height,
        age,
        gender,
        activityMultiplier,
        // Manual overrides (ignored by server when auto flags are on)
        targetCalories: manualCalories,
        targetProtein:  manualProtein,
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

  const handleSendTestEmail = async () => {
    setSendingTest(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await fetch("/api/cron/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTestResult("error")
        setTestError(data.error ?? "שגיאה בשליחה")
      } else {
        setTestResult("success")
        setTimeout(() => setTestResult(null), 5000)
      }
    } catch {
      setTestResult("error")
      setTestError("שגיאת רשת — בדוק את החיבור שלך")
    } finally {
      setSendingTest(false)
    }
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/login")
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-gray-400">
        טוען הגדרות…
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#F9FAFB] px-4 py-5 space-y-5 max-w-lg mx-auto">

      {/* ── כותרת ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-50 text-[#007AFF]">
          <Settings size={20} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">הגדרות</h1>
          <p className="text-xs text-gray-500">פרופיל · גוף · תזונה · AI</p>
        </div>
      </div>

      {/* ── פרופיל אישי ───────────────────────────────────── */}
      <section className={cn(CARD, "p-4 space-y-3")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <User size={15} className="text-[#007AFF]" /> פרופיל אישי
        </h2>
        <div className="space-y-1.5">
          <FieldLabel>שם</FieldLabel>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="הזן את שמך..."
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#007AFF]"
          />
          <p className="text-[11px] text-gray-500">
            מוצג בדשבורד:{" "}
            <span className="text-[#007AFF]">שלום, {displayName.trim() || "ספורטאי"} 👋</span>
          </p>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>העדפה תזונתית</FieldLabel>
          <div className="relative">
            <select
              value={dietaryPreference}
              onChange={(e) => setDietaryPreference(e.target.value)}
              className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#007AFF]"
            >
              <option value="vegetarian">צמחוני</option>
              <option value="vegan">טבעוני</option>
              <option value="pescatarian">פסקטריאני</option>
              <option value="omnivore">כל-אוכל</option>
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <p className="text-[11px] text-gray-500">משמש להצעות ארוחה חכמות בדשבורד</p>
        </div>
      </section>

      {/* ── פרופיל גוף ────────────────────────────────────── */}
      <section className={cn(CARD, "p-4 space-y-4")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <Dumbbell size={15} className="text-teal-500" /> פרופיל גוף
        </h2>
        <p className="text-[11px] text-gray-500 -mt-1">
          ערכים אלו מחשבים את יעדי הקלוריות והחלבון שלך אוטומטית.
        </p>

        {/* Weight + Height row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel>משקל (ק&quot;ג)</FieldLabel>
            <NumberInput
              value={weight}
              onChange={setWeight}
              min={30}
              max={300}
              step={0.1}
              unit='ק"ג'
            />
            <p className="text-[10px] text-gray-300">
              {data?.latestWeight ? `נמדד לאחרונה: ${data.latestWeight}` : "לא נמדד עדיין"}
            </p>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>גובה (ס&quot;מ)</FieldLabel>
            <NumberInput value={height} onChange={setHeight} min={100} max={250} unit='ס"מ' />
          </div>
        </div>

        {/* Age + Gender row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel>גיל</FieldLabel>
            <NumberInput value={age} onChange={setAge} min={10} max={100} unit="שנה" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>מין</FieldLabel>
            <div className="relative">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#007AFF]"
              >
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Activity multiplier */}
        <div className="space-y-1.5">
          <FieldLabel>רמת פעילות</FieldLabel>
          <div className="relative">
            <select
              value={activityMultiplier}
              onChange={(e) => setActivityMultiplier(Number(e.target.value))}
              className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#007AFF]"
            >
              {ACTIVITY_LEVELS.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      </section>

      {/* ── מצב חופשה — משהה את מנוע ה-Check-In לגמרי ──────── */}
      <section
        className={cn(
          CARD,
          "p-4 space-y-1 border transition-colors",
          vacationMode
            ? "bg-gradient-to-br from-orange-50 to-blue-50 border-[#FF9500]/30"
            : "border-transparent",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palmtree size={17} className={vacationMode ? "text-[#FF9500]" : "text-gray-400"} />
            <div>
              <p className="text-sm font-semibold text-gray-900">מצב חופשה</p>
              <p className="text-[11px] text-gray-500">
                משהה את הצ&apos;ק-אין הדו-שבועי, לא מבקש מדידות משקל/מותן, ומקפיא
                את תיקון הקלוריות במקומו — מעקב ה-AI גם הופך לגס ורגוע יותר.
              </p>
            </div>
          </div>
          <Toggle enabled={vacationMode} onChange={handleToggleVacation} />
        </div>
      </section>

      {/* ── יעדי תזונה ────────────────────────────────────── */}
      <section className={cn(CARD, "p-4 space-y-5")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <Target size={15} className="text-[#007AFF]" /> יעדי תזונה יומיים
        </h2>

        {/* ─── Calories ───────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">קלוריות — חישוב אוטומטי</p>
              <p className="text-[11px] text-gray-500">Mifflin-St Jeor TDEE מהפרופיל שלמעלה</p>
            </div>
            <Toggle enabled={autoCalorieGoal} onChange={setAutoCalorieGoal} />
          </div>

          {autoCalorieGoal ? (
            <div className="rounded-xl border border-[#007AFF]/30 bg-blue-50 p-3 space-y-2">
              {/* Main value */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame size={16} className="text-[#FF9500]" />
                  <div>
                    <p className="text-[11px] text-gray-500">יעד קלוריות מחושב (Lean Gain)</p>
                    <p className="text-2xl font-black text-[#FF9500] leading-none">
                      {currentTarget > 0 ? currentTarget.toLocaleString() : "—"}
                      <span className="text-sm font-normal text-gray-400"> קק&quot;ל</span>
                    </p>
                  </div>
                </div>
                <AutoBadge />
              </div>

              {/* Formula breakdown */}
              {bmr > 0 && (
                <div className="border-t border-blue-100 pt-2 space-y-1">
                  <p className="text-[10px] text-gray-300 font-mono">
                    BMR = (10×{weight}) + (6.25×{height}) − (5×{age}) {gender === "female" ? "− 161" : "+ 5"} = <span className="text-gray-400">{bmr.toLocaleString()}</span>
                  </p>
                  <p className="text-[10px] text-gray-300 font-mono">
                    TDEE = {bmr.toLocaleString()} × {activityMultiplier} = <span className="text-gray-400">{tdee.toLocaleString()}</span>
                  </p>
                  <p className="text-[10px] text-gray-300 font-mono">
                    יעד = TDEE × 1.05{" "}
                    {calorieAdjustmentOffset !== 0
                      ? `${calorieAdjustmentOffset > 0 ? "+" : "−"} ${Math.abs(calorieAdjustmentOffset)} (תיקון בדיקה)`
                      : ""}
                    {" "}= <span className="text-[#FF9500] font-semibold">{currentTarget.toLocaleString()}</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <FieldLabel>קלוריות יומיות (קק&quot;ל)</FieldLabel>
              <NumberInput
                value={manualCalories}
                onChange={setManualCalories}
                min={1000}
                max={10000}
                step={50}
                unit='קק"ל'
              />
            </div>
          )}
        </div>

        <div className="h-px bg-gray-100" />

        {/* ─── Protein ────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">חלבון — חישוב אוטומטי</p>
              <p className="text-[11px] text-gray-500">
                משקל × 2.2{" "}
                {weight > 0 ? `(${weight} ק"ג → ${autoProteinG} גר')` : "(הזן משקל)"}
              </p>
            </div>
            <Toggle enabled={autoProtein} onChange={setAutoProtein} />
          </div>

          <div
            className={cn(
              "flex items-center justify-between px-4 py-3 rounded-xl border",
              autoProtein
                ? "border-violet-200 bg-violet-50"
                : "border-gray-200 bg-gray-50",
            )}
          >
            <div className="flex items-center gap-2">
              <Calculator size={16} className={autoProtein ? "text-violet-500" : "text-gray-400"} />
              <div>
                <p className="text-[11px] text-gray-500">
                  {autoProtein ? "יעד חלבון מחושב" : "יעד חלבון ידני"}
                </p>
                <p className="text-2xl font-black text-violet-600 leading-none">
                  {effectiveProtein}
                  <span className="text-sm font-normal text-gray-400"> גר&apos;</span>
                </p>
              </div>
            </div>
            {autoProtein && <AutoBadge />}
          </div>

          {!autoProtein && (
            <div className="space-y-1.5">
              <FieldLabel>חלבון יומי (גר&apos;)</FieldLabel>
              <NumberInput
                value={manualProtein}
                onChange={setManualProtein}
                min={30}
                max={500}
                unit="גר'"
              />
            </div>
          )}
        </div>

        {/* ─── Combined summary ────────────────────────────── */}
        <div className="rounded-xl bg-gray-50 px-3 py-2.5 flex items-center justify-between text-xs">
          <span className="text-gray-400">יעד פעיל</span>
          <span className="font-semibold text-gray-900">
            {effectiveCalories > 0 ? `${effectiveCalories.toLocaleString()} קק"ל` : "—"}
            {" · "}
            {effectiveProtein > 0 ? `${effectiveProtein} גר' חלבון` : "—"}
          </span>
        </div>

        {/* ─── Macro breakdown ─────────────────────────────── */}
        {effectiveCalories > 0 && (
          <div className="rounded-xl bg-gray-50 px-3 py-3 space-y-2.5">
            <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
              <Flame size={11} className="text-[#FF9500]" /> פירוט מאקרו יומי
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg py-2">
                <p className="text-[10px] text-gray-400 mb-0.5">חלבון</p>
                <p className="text-sm font-bold text-violet-600">
                  {effectiveProtein}
                  <span className="text-[10px] font-normal text-gray-400"> גר&apos;</span>
                </p>
                <p className="text-[10px] text-gray-300">{effectiveProtein * 4} קק&quot;ל</p>
              </div>
              <div className="bg-white rounded-lg py-2">
                <p className="text-[10px] text-gray-400 mb-0.5">פחמימות</p>
                <p className="text-sm font-bold text-[#34C759]">
                  {effectiveCarbs}
                  <span className="text-[10px] font-normal text-gray-400"> גר&apos;</span>
                </p>
                <p className="text-[10px] text-gray-300">{effectiveCarbs * 4} קק&quot;ל</p>
              </div>
              <div className="bg-white rounded-lg py-2">
                <p className="text-[10px] text-gray-400 mb-0.5">שומן</p>
                <p className="text-sm font-bold text-[#FF9500]">
                  {effectiveFats}
                  <span className="text-[10px] font-normal text-gray-400"> גר&apos;</span>
                </p>
                <p className="text-[10px] text-gray-300">{effectiveFats * 9} קק&quot;ל</p>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-2 text-center">
              <p className="text-[10px] text-gray-300">
                סה&quot;כ: {effectiveProtein * 4 + effectiveCarbs * 4 + effectiveFats * 9} קק&quot;ל מתוך {effectiveCalories.toLocaleString()} יעד
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── ספק AI ────────────────────────────────────────── */}
      <section className={cn(CARD, "p-4 space-y-4")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <Bot size={15} className="text-[#007AFF]" /> ספק בינה מלאכותית
        </h2>

        <div className="space-y-1.5">
          <FieldLabel>ספק NLP לרישום תזונה</FieldLabel>
          <div className="relative">
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#007AFF]"
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>
            <span className="flex items-center gap-1.5">
              <Key size={11} />
              {data?.aiApiKeySet ? "החלפת מפתח API" : "מפתח API"}
              <span className="text-gray-300">(יישמר באופן מקומי)</span>
            </span>
          </FieldLabel>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={data?.aiApiKeySet ? "••••••••  (שמור)" : "sk-..."}
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#007AFF]"
          />
          {aiProvider === "anthropic" && !data?.aiApiKeySet && (
            <p className="text-[11px] text-gray-500">
              ברירת המחדל: מפתח ה-ANTHROPIC_API_KEY מקובץ .env
            </p>
          )}
        </div>
      </section>

      {/* ── תצוגה והתראות ─────────────────────────────────── */}
      <section className={cn(CARD, "p-4 space-y-4")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <Bell size={15} className="text-[#007AFF]" /> תצוגה והתראות
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">הצג סיכום שבועי</p>
            <p className="text-[11px] text-gray-500">כרטיס סיכום אימונים ותזונה בדשבורד</p>
          </div>
          <Toggle enabled={showWeeklySummary} onChange={setShowWeeklySummary} />
        </div>

        <div className="h-px bg-gray-100" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">אפשר התראות חכמות</p>
            <p className="text-[11px] text-gray-500">
              התראה אם התזונה נמוכה ביותר מ-20% ביומיים רצופים
            </p>
          </div>
          <Toggle enabled={smartAlertsEnabled} onChange={setSmartAlertsEnabled} />
        </div>
      </section>

      {/* ── דוחות שבועיים ─────────────────────────────────── */}
      <section className={cn(CARD, "p-4 space-y-4")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <Mail size={15} className="text-teal-500" /> דוחות שבועיים
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">שלח דוח אימייל שבועי</p>
            <p className="text-[11px] text-gray-500">כל יום ראשון — ניתוח חלבון, סוכר וימי אימון</p>
          </div>
          <Toggle enabled={reportEnabled} onChange={setReportEnabled} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">כתובת אימייל לדוח</label>
          <input
            type="email"
            value={reportEmail}
            onChange={(e) => setReportEmail(e.target.value)}
            placeholder="your@email.com"
            dir="ltr"
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-teal-500"
          />
          <p className="text-[11px] text-gray-300">
            ריק = יוצא מה-REPORT_EMAIL ב-.env.local
          </p>
        </div>

        {/* Send Test Email button */}
        <button
          onClick={handleSendTestEmail}
          disabled={sendingTest}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold active:scale-95 transition",
            testResult === "success"
              ? "bg-teal-50 border border-teal-200 text-teal-600"
              : testResult === "error"
              ? "bg-red-50 border border-red-100 text-[#FF3B30]"
              : "bg-gray-100 hover:bg-gray-200 text-gray-500 disabled:opacity-50",
          )}
        >
          {sendingTest ? (
            <><span className="animate-spin text-base leading-none">◌</span> שולח…</>
          ) : testResult === "success" ? (
            <><CheckCircle2 size={15} /> נשלח בהצלחה!</>
          ) : testResult === "error" ? (
            <><XCircle size={15} /> {testError ?? "שגיאה בשליחה"}</>
          ) : (
            <><Send size={14} /> שלח אימייל בדיקה עכשיו</>
          )}
        </button>
        <p className="text-[11px] text-gray-300 text-center -mt-1">
          שולח את ניתוח השבוע הנוכחי מיידית
        </p>
      </section>

      {/* ── אבטחה ─────────────────────────────────────────── */}
      <section className={cn(CARD, "p-4 space-y-3")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
          <Lock size={15} className="text-[#007AFF]" /> אבטחה
        </h2>

        <div className="bg-gray-50 rounded-2xl px-4 py-3 space-y-1.5">
          <p className="text-sm font-medium text-gray-900">שינוי סיסמת כניסה</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            הסיסמה מנוהלת דרך משתנה הסביבה{" "}
            <code className="bg-gray-100 text-[#007AFF] px-1 py-0.5 rounded text-[11px]">
              APP_MASTER_PASSWORD
            </code>{" "}
            בהגדרות Vercel. לשינוי — עדכן את הערך שם ופרוס מחדש.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-gray-400 hover:text-gray-900 text-sm transition-colors py-1"
        >
          <LogOut size={15} /> התנתק
        </button>
      </section>

      {/* ── Error ─────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 text-[#FF3B30] bg-red-50 rounded-2xl px-4 py-3 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── Success toast ──────────────────────────────────── */}
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 text-[#34C759] rounded-2xl px-4 py-3 text-sm">
          <CheckCircle2 size={16} /> ההגדרות נשמרו בהצלחה ✓
        </div>
      )}

      {/* ── שמור ──────────────────────────────────────────── */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-full py-4 text-base font-bold text-white active:scale-95 transition",
          saved
            ? "bg-[#34C759]"
            : "bg-[#007AFF] disabled:opacity-50",
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

      {/* ── אזור מסוכן ────────────────────────────────────── */}
      <section className={cn(CARD, "border border-red-100 p-4 space-y-3")}>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-[#FF3B30]">
          <ShieldAlert size={15} /> אזור מסוכן
        </h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-[#FF3B30]/80">נמחק:</span> סשנים, סטים, יומני תזונה, מדדי גוף ותמונות.{" "}
          <span className="text-[#34C759]/80">נשמר:</span> תוכניות אימון, ספריית תרגילים, מסד מזון והגדרות AI.
        </p>
        {resetDone && (
          <p className="text-xs text-[#34C759] flex items-center gap-1.5">
            <CheckCircle2 size={13} /> הנתונים אופסו בהצלחה.
          </p>
        )}
        <button
          onClick={() => { setShowResetModal(true); setResetConfirmText("") }}
          className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-[#FF3B30] rounded-full px-4 py-2.5 text-sm font-semibold active:scale-95 transition"
        >
          <Trash2 size={15} /> איפוס נתוני מערכת
        </button>
      </section>

      {/* ── מודל איפוס ────────────────────────────────────── */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className={cn(CARD, "border border-red-100 p-6 w-full max-w-sm space-y-4")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[#FF3B30]">
              <ShieldAlert size={20} />
              <h3 className="text-base font-bold">אישור איפוס</h3>
            </div>
            <p className="text-sm text-gray-900 leading-relaxed">
              פעולה זו תמחק לצמיתות את כל נתוני האימון, התזונה, ומדדי הגוף שלך.
            </p>
            <div className="space-y-2">
              <label className="text-xs text-gray-400">
                הקלד <span className="font-bold text-[#FF3B30]">איפוס</span> לאישור:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="הקלד 'איפוס' לאישור..."
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#FF3B30]"
                autoFocus
                dir="rtl"
              />
            </div>
            <button
              onClick={handleReset}
              disabled={resetConfirmText !== "איפוס" || resetting}
              className="w-full flex items-center justify-center gap-2 bg-[#FF3B30] disabled:opacity-40 rounded-full py-3 text-sm font-bold text-white active:scale-95 transition"
            >
              {resetting ? (
                <><span className="animate-spin">◌</span> מאפס…</>
              ) : (
                <><Trash2 size={14} /> אפס נתונים</>
              )}
            </button>
            <button
              onClick={() => setShowResetModal(false)}
              className="w-full bg-gray-100 hover:bg-gray-200 rounded-full py-2.5 text-sm font-semibold text-gray-500 active:scale-95 transition"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
