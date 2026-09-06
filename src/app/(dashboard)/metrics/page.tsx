"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  TrendingDown, TrendingUp, Scale, Camera, Plus, Loader2,
  CheckCircle2, AlertCircle, X, Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────
interface BodyMetric {
  id: string
  date: string
  weightKg: number
  bodyFatPct: number | null
  muscleMassKg: number | null
  waistCm: number | null
}

interface Goals {
  startWeight: number | null
  targetWeight: number | null
  startMuscleMass: number | null
  muscleMassGoal: number
}

interface MetricsData {
  metrics: BodyMetric[]
  goals: Goals
}

interface ProgressPhoto {
  id: string
  date: string
  url: string
  angle: string
  notes: string | null
}

// Shared "bento box" card treatment — matches the dashboard page / CheckInCard.
const CARD = "bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)]"

// ── תצוגת תאריך מקומית ───────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
  })
}

const ANGLE_LABELS: Record<string, string> = {
  front: "חזית",
  back: "גב",
  side_left: "צד שמאל",
  side_right: "צד ימין",
}

// ── טופס הוספת משקל ──────────────────────────────────────────
function WeightLogForm({ onSaved }: { onSaved: (weightKg: number) => void }) {
  const [weight, setWeight] = useState("")
  const [bodyFat, setBodyFat] = useState("")
  const [waist, setWaist] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const kg = parseFloat(weight)
    if (!kg || kg < 20 || kg > 300) {
      setError("הזן משקל תקין בין 20 ל-300 ק\"ג")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg: kg,
          bodyFatPct: bodyFat ? parseFloat(bodyFat) : undefined,
          waistCm: waist ? parseFloat(waist) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "שגיאה בשמירה"); return }
      setWeight("")
      setBodyFat("")
      setWaist("")
      onSaved(kg)
    } catch {
      setError("שגיאת חיבור — נסה שוב")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn(CARD, "p-6 space-y-3")}>
      <p className="text-sm font-semibold text-gray-900">רישום משקל חדש</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">משקל (ק&quot;ג) *</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
            placeholder="75.0"
            min={20}
            max={300}
            step={0.1}
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-center font-bold text-gray-900 focus:outline-none focus:border-[#007AFF]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">שומן גוף % (אופציונלי)</label>
          <input
            type="number"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="18.0"
            min={3}
            max={60}
            step={0.1}
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-center text-gray-900 focus:outline-none focus:border-[#007AFF]"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-400">היקף מותניים (ס&quot;מ, אופציונלי)</label>
        <input
          type="number"
          value={waist}
          onChange={(e) => setWaist(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
          placeholder="85.0"
          min={40}
          max={200}
          step={0.1}
          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-center text-gray-900 focus:outline-none focus:border-[#007AFF]"
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={saving || !weight}
        className="w-full flex items-center justify-center gap-2 bg-[#007AFF] disabled:opacity-40 rounded-full py-3.5 text-sm font-semibold text-white active:scale-95 transition"
      >
        {saving ? <><Loader2 size={15} className="animate-spin" /> שומר…</> : <><CheckCircle2 size={15} /> שמור משקל</>}
      </button>
    </div>
  )
}

// ── עמוד ──────────────────────────────────────────────────────
export default function MetricsPage() {
  const [data, setData]       = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Photos state
  const [photos, setPhotos]             = useState<ProgressPhoto[]>([])
  const [photoAngle, setPhotoAngle]     = useState<"front" | "back" | "side_left" | "side_right">("front")
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError]     = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics")
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch("/api/photos")
      if (res.ok) {
        const d = await res.json()
        setPhotos(d.photos ?? [])
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchMetrics()
    fetchPhotos()
  }, [fetchMetrics, fetchPhotos])

  const handleSaved = (weightKg: number) => {
    setShowForm(false)
    fetchMetrics()
    void weightKg
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("התמונה גדולה מדי — מקסימום 5MB")
      return
    }
    setPhotoError(null)
    setUploadingPhoto(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const base64 = ev.target?.result as string
        const res = await fetch("/api/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, angle: photoAngle }),
        })
        if (!res.ok) { setPhotoError("שגיאה בשמירת התמונה"); return }
        await fetchPhotos()
      } catch {
        setPhotoError("שגיאת חיבור")
      } finally {
        setUploadingPhoto(false)
        // Reset file input so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDeletePhoto = async (id: string) => {
    await fetch(`/api/photos/${id}`, { method: "DELETE" })
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-gray-400">
        <Loader2 size={20} className="animate-spin me-2" /> טוען מדדים…
      </div>
    )
  }

  const metrics  = data?.metrics ?? []
  const goals    = data?.goals
  const isEmpty  = metrics.length === 0

  const current  = metrics[0]
  const prev     = metrics[1]

  const last7    = metrics.slice(0, 7)
  const avg7     = last7.length
    ? Math.round((last7.reduce((s, m) => s + m.weightKg, 0) / last7.length) * 10) / 10
    : null

  const startW    = goals?.startWeight ?? current?.weightKg ?? null
  const targetW   = goals?.targetWeight
  // For recomp: weightDelta > 0 = gained weight (positive/green)
  const weightDelta = (startW && current) ? Math.round((current.weightKg - startW) * 10) / 10 : null
  const goalDiff  = (targetW && current) ? Math.round((current.weightKg - targetW) * 10) / 10 : null
  const progressPct = (startW && targetW && current && startW !== targetW)
    ? Math.min(Math.max(((startW - current.weightKg) / (startW - targetW)) * 100, 0), 100)
    : null

  const maxW  = metrics.length ? Math.max(...metrics.map((m) => m.weightKg)) : 0
  const minW  = metrics.length ? Math.min(...metrics.map((m) => m.weightKg)) : 0
  const range = maxW - minW || 1

  // Chart bars: newest first in DB, reverse to show chronologically left→right
  const chartData = metrics.slice(0, 14).reverse()

  return (
    <div className="bg-[#F9FAFB] px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">מדדי גוף</h1>
          <p className="text-sm text-gray-500 mt-0.5">מעקב התקדמות הרכב גוף</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-[#007AFF] text-white px-4 py-2.5 text-sm font-semibold active:scale-95 transition"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? "ביטול" : "רשום משקל"}
        </button>
      </div>

      {/* טופס רישום משקל */}
      {showForm && <WeightLogForm onSaved={handleSaved} />}

      {/* מצב ריק */}
      {isEmpty && !showForm && (
        <div className={cn(CARD, "p-8 flex flex-col items-center gap-4 text-center")}>
          <Scale size={40} className="text-gray-300" />
          <div>
            <p className="text-base font-semibold text-gray-900">הזן משקל ראשוני</p>
            <p className="text-sm text-gray-500 mt-1">
              לחץ על &quot;רשום משקל&quot; למעלה כדי להתחיל לעקוב אחר ההתקדמות שלך.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-full bg-[#007AFF] text-white px-5 py-3 text-sm font-semibold active:scale-95 transition"
          >
            <Plus size={16} /> רשום משקל ראשוני
          </button>
        </div>
      )}

      {/* גיבור משקל נוכחי */}
      {current && (
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">משקל נוכחי</p>
            <p className="text-4xl font-black text-gray-900">
              {current.weightKg}
              <span className="text-lg font-normal text-gray-400 ms-1">ק&quot;ג</span>
            </p>
            {avg7 && (
              <p className="text-xs text-gray-500 mt-1">
                ממוצע 7 ימים:{" "}
                <span className="text-[#007AFF] font-semibold">{avg7} ק&quot;ג</span>
              </p>
            )}
          </div>
          <div className="text-end">
            {weightDelta !== null && weightDelta !== 0 ? (
              <>
                {/* Recomp: gain = green, loss = amber */}
                <div className={cn(
                  "flex items-center justify-end gap-1",
                  weightDelta > 0 ? "text-[#34C759]" : "text-[#FF9500]"
                )}>
                  {weightDelta > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  <span className="text-lg font-bold">
                    {weightDelta > 0 ? "+" : ""}{weightDelta} ק&quot;ג
                  </span>
                </div>
                <p className="text-xs text-gray-500">מתחילת הדרך ({startW} ק&quot;ג)</p>
              </>
            ) : prev ? (
              <div className={cn(
                "flex items-center justify-end gap-1 text-sm font-bold",
                current.weightKg > prev.weightKg ? "text-[#34C759]"
                  : current.weightKg < prev.weightKg ? "text-[#FF9500]"
                  : "text-gray-400"
              )}>
                {current.weightKg >= prev.weightKg
                  ? <TrendingUp size={16} />
                  : <TrendingDown size={16} />}
                {Math.abs(Math.round((current.weightKg - prev.weightKg) * 10) / 10)} ק&quot;ג
              </div>
            ) : null}
            {goalDiff !== null && goalDiff > 0 && (
              <p className="text-xs text-[#34C759] mt-1 font-medium">
                עוד {goalDiff} ק&quot;ג ליעד
              </p>
            )}
          </div>
        </div>
      )}

      {/* התקדמות יעד */}
      {progressPct !== null && (
        <div className={cn(CARD, "p-6 space-y-3")}>
          <h2 className="text-sm font-semibold text-gray-900">התקדמות יעד הרכב הגוף</h2>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>ירידת שומן למשקל יעד</span>
              <span className="text-[#34C759]">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-gray-400 mt-1">
              <span>התחלה: {startW} ק&quot;ג</span>
              <span>יעד: {goals?.targetWeight} ק&quot;ג</span>
            </div>
          </div>
        </div>
      )}

      {/* גרף היסטוריה — custom bar chart (no Recharts dependency) */}
      {metrics.length > 1 && (
        <div className={cn(CARD, "p-6 space-y-3")}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">היסטוריית משקל</h2>
            <span className="text-xs text-gray-400">{metrics.length} מדידות אחרונות</span>
          </div>

          {/* bars: direct flex children so % height resolves against h-20 parent */}
          <div className="flex items-end gap-1 h-20">
            {chartData.map((m, i) => {
              const heightPct = 20 + ((m.weightKg - minW) / range) * 80
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-[#007AFF]/50 hover:bg-[#007AFF] transition-colors cursor-pointer min-w-0"
                  style={{ height: `${heightPct}%` }}
                  title={`${m.weightKg} ק"ג — ${formatDate(m.date)}`}
                />
              )
            })}
          </div>
          <div className="flex gap-1">
            {chartData.map((m, i) => (
              <span key={i} className="flex-1 text-[9px] text-gray-300 text-center truncate min-w-0">
                {new Date(m.date).getDate()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* יומן שקילות */}
      {metrics.length > 0 && (
        <div className={cn(CARD, "p-6 space-y-2")}>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Scale size={15} className="text-[#007AFF]" /> שקילות אחרונות
          </h2>
          {metrics.slice(0, 10).map((m, i) => {
            const nextM = metrics[i + 1]
            // diff > 0 means this entry is heavier than the older one (gained) = green for recomp
            const diff = nextM ? Math.round((m.weightKg - nextM.weightKg) * 10) / 10 : null
            return (
              <div
                key={m.id}
                className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0"
              >
                <span className="text-gray-400 text-xs w-16">{formatDate(m.date)}</span>
                <span className="font-bold text-gray-900">{m.weightKg} ק&quot;ג</span>
                {diff !== null ? (
                  <span
                    className={cn(
                      "text-xs font-medium flex items-center gap-0.5",
                      diff > 0 ? "text-[#34C759]" : diff < 0 ? "text-[#FF9500]" : "text-gray-400"
                    )}
                  >
                    {diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {diff > 0 ? "+" : ""}{diff}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 w-10" />
                )}
                <span className="text-xs text-gray-400 w-20 text-end">
                  {[
                    m.bodyFatPct != null ? `${m.bodyFatPct}% שומן` : null,
                    m.waistCm != null ? `${m.waistCm} ס"מ מותן` : null,
                  ].filter(Boolean).join(" · ") || "—"}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* תמונות התקדמות */}
      <div className={cn(CARD, "p-6 space-y-4")}>
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Camera size={15} className="text-[#007AFF]" /> תמונות התקדמות
        </h2>

        {/* בחירת זווית */}
        <div className="flex gap-2">
          {(["front", "back", "side_left", "side_right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setPhotoAngle(a)}
              className={cn(
                "flex-1 text-[11px] font-medium py-1.5 rounded-full transition-colors",
                photoAngle === a
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              )}
            >
              {ANGLE_LABELS[a]}
            </button>
          ))}
        </div>

        {/* כפתור העלאה */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto}
          className="w-full border-2 border-dashed border-gray-200 hover:border-[#007AFF]/50 rounded-2xl py-6 text-sm text-gray-400 hover:text-gray-600 flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {uploadingPhoto
            ? <><Loader2 size={20} className="animate-spin text-[#007AFF]" /><span>שומר תמונה…</span></>
            : <><Camera size={22} className="text-gray-300" /><span>הוסף תמונה — {ANGLE_LABELS[photoAngle]}</span><span className="text-xs text-gray-300">JPG / PNG · עד 5MB</span></>
          }
        </button>

        {photoError && (
          <p className="text-xs text-[#FF3B30] flex items-center gap-1.5">
            <AlertCircle size={12} /> {photoError}
          </p>
        )}

        {/* גלריה */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={ANGLE_LABELS[photo.angle] ?? photo.angle}
                  className="w-full h-full object-cover"
                />
                {/* hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                  <p className="text-[10px] text-white font-medium">{ANGLE_LABELS[photo.angle] ?? photo.angle}</p>
                  <p className="text-[9px] text-white/70">{formatDate(photo.date)}</p>
                  <button
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="mt-1 p-1.5 bg-[#FF3B30]/90 hover:bg-[#FF3B30] rounded-lg transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {photos.length === 0 && !uploadingPhoto && (
          <p className="text-center text-xs text-gray-300 pb-1">
            לא נוספו תמונות עדיין. צלם תמונה כל שבועיים כדי לעקוב אחר השינוי.
          </p>
        )}
      </div>
    </div>
  )
}
