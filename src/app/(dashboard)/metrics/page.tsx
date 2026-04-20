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
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "שגיאה בשמירה"); return }
      setWeight("")
      setBodyFat("")
      onSaved(kg)
    } catch {
      setError("שגיאת חיבור — נסה שוב")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-4 space-y-3 border border-indigo-500/20">
      <p className="text-sm font-semibold text-slate-200">רישום משקל חדש</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">משקל (ק"ג) *</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
            placeholder="75.0"
            min={20}
            max={300}
            step={0.1}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-center font-bold focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">שומן גוף % (אופציונלי)</label>
          <input
            type="number"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="18.0"
            min={3}
            max={60}
            step={0.1}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={saving || !weight}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl py-3 text-sm font-semibold transition-colors"
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
      <div className="flex items-center justify-center min-h-64 text-slate-500">
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
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">מדדי גוף</h1>
          <p className="text-sm text-slate-400 mt-0.5">מעקב התקדמות הרכב גוף</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? "ביטול" : "רשום משקל"}
        </button>
      </div>

      {/* טופס רישום משקל */}
      {showForm && <WeightLogForm onSaved={handleSaved} />}

      {/* מצב ריק */}
      {isEmpty && !showForm && (
        <div className="bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <Scale size={40} className="text-slate-700" />
          <div>
            <p className="text-base font-semibold text-slate-300">הזן משקל ראשוני</p>
            <p className="text-sm text-slate-500 mt-1">
              לחץ על "רשום משקל" למעלה כדי להתחיל לעקוב אחר ההתקדמות שלך.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            <Plus size={16} /> רשום משקל ראשוני
          </button>
        </div>
      )}

      {/* גיבור משקל נוכחי */}
      {current && (
        <div className="bg-gradient-to-br from-indigo-900/60 to-slate-900 border border-indigo-500/20 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-1">משקל נוכחי</p>
            <p className="text-4xl font-black text-slate-100">
              {current.weightKg}
              <span className="text-lg font-normal text-slate-400 ms-1">ק"ג</span>
            </p>
            {avg7 && (
              <p className="text-xs text-slate-500 mt-1">
                ממוצע 7 ימים:{" "}
                <span className="text-indigo-300 font-semibold">{avg7} ק"ג</span>
              </p>
            )}
          </div>
          <div className="text-end">
            {weightDelta !== null && weightDelta !== 0 ? (
              <>
                {/* Recomp: gain = green, loss = amber */}
                <div className={cn(
                  "flex items-center justify-end gap-1",
                  weightDelta > 0 ? "text-green-400" : "text-amber-400"
                )}>
                  {weightDelta > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  <span className="text-lg font-bold">
                    {weightDelta > 0 ? "+" : ""}{weightDelta} ק"ג
                  </span>
                </div>
                <p className="text-xs text-slate-500">מתחילת הדרך ({startW} ק"ג)</p>
              </>
            ) : prev ? (
              <div className={cn(
                "flex items-center justify-end gap-1 text-sm font-bold",
                current.weightKg > prev.weightKg ? "text-green-400"
                  : current.weightKg < prev.weightKg ? "text-amber-400"
                  : "text-slate-500"
              )}>
                {current.weightKg >= prev.weightKg
                  ? <TrendingUp size={16} />
                  : <TrendingDown size={16} />}
                {Math.abs(Math.round((current.weightKg - prev.weightKg) * 10) / 10)} ק"ג
              </div>
            ) : null}
            {goalDiff !== null && goalDiff > 0 && (
              <p className="text-xs text-emerald-400 mt-1 font-medium">
                עוד {goalDiff} ק"ג ליעד
              </p>
            )}
          </div>
        </div>
      )}

      {/* התקדמות יעד */}
      {progressPct !== null && (
        <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold">התקדמות יעד הרכב הגוף</h2>
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>ירידת שומן למשקל יעד</span>
              <span className="text-green-400">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-600 mt-1">
              <span>התחלה: {startW} ק"ג</span>
              <span>יעד: {goals?.targetWeight} ק"ג</span>
            </div>
          </div>
        </div>
      )}

      {/* גרף היסטוריה — custom bar chart (no Recharts dependency) */}
      {metrics.length > 1 && (
        <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">היסטוריית משקל</h2>
            <span className="text-xs text-slate-500">{metrics.length} מדידות אחרונות</span>
          </div>

          {/* bars: direct flex children so % height resolves against h-20 parent */}
          <div className="flex items-end gap-1 h-20">
            {chartData.map((m, i) => {
              const heightPct = 20 + ((m.weightKg - minW) / range) * 80
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-indigo-500/60 hover:bg-indigo-400 transition-colors cursor-pointer min-w-0"
                  style={{ height: `${heightPct}%` }}
                  title={`${m.weightKg} ק"ג — ${formatDate(m.date)}`}
                />
              )
            })}
          </div>
          <div className="flex gap-1">
            {chartData.map((m, i) => (
              <span key={i} className="flex-1 text-[9px] text-slate-600 text-center truncate min-w-0">
                {new Date(m.date).getDate()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* יומן שקילות */}
      {metrics.length > 0 && (
        <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Scale size={15} className="text-indigo-400" /> שקילות אחרונות
          </h2>
          {metrics.slice(0, 10).map((m, i) => {
            const nextM = metrics[i + 1]
            // diff > 0 means this entry is heavier than the older one (gained) = green for recomp
            const diff = nextM ? Math.round((m.weightKg - nextM.weightKg) * 10) / 10 : null
            return (
              <div
                key={m.id}
                className="flex items-center justify-between text-sm py-1 border-b border-slate-800 last:border-0"
              >
                <span className="text-slate-400 text-xs w-16">{formatDate(m.date)}</span>
                <span className="font-bold">{m.weightKg} ק"ג</span>
                {diff !== null ? (
                  <span
                    className={cn(
                      "text-xs font-medium flex items-center gap-0.5",
                      diff > 0 ? "text-green-400" : diff < 0 ? "text-amber-400" : "text-slate-500"
                    )}
                  >
                    {diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {diff > 0 ? "+" : ""}{diff}
                  </span>
                ) : (
                  <span className="text-xs text-slate-600 w-10" />
                )}
                <span className="text-xs text-slate-600 w-14 text-end">
                  {m.bodyFatPct != null ? `${m.bodyFatPct}% שומן` : "—"}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* תמונות התקדמות */}
      <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Camera size={15} className="text-indigo-400" /> תמונות התקדמות
        </h2>

        {/* בחירת זווית */}
        <div className="flex gap-2">
          {(["front", "back", "side_left", "side_right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setPhotoAngle(a)}
              className={cn(
                "flex-1 text-[11px] font-medium py-1.5 rounded-lg transition-colors",
                photoAngle === a
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
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
          className="w-full border-2 border-dashed border-slate-700 hover:border-indigo-600/60 rounded-xl py-6 text-sm text-slate-500 hover:text-slate-300 flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {uploadingPhoto
            ? <><Loader2 size={20} className="animate-spin text-indigo-400" /><span>שומר תמונה…</span></>
            : <><Camera size={22} className="text-slate-600" /><span>הוסף תמונה — {ANGLE_LABELS[photoAngle]}</span><span className="text-xs text-slate-600">JPG / PNG · עד 5MB</span></>
          }
        </button>

        {photoError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle size={12} /> {photoError}
          </p>
        )}

        {/* גלריה */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={ANGLE_LABELS[photo.angle] ?? photo.angle}
                  className="w-full h-full object-cover"
                />
                {/* hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                  <p className="text-[10px] text-slate-300 font-medium">{ANGLE_LABELS[photo.angle] ?? photo.angle}</p>
                  <p className="text-[9px] text-slate-400">{formatDate(photo.date)}</p>
                  <button
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="mt-1 p-1.5 bg-red-600/80 hover:bg-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {photos.length === 0 && !uploadingPhoto && (
          <p className="text-center text-xs text-slate-600 pb-1">
            לא נוספו תמונות עדיין. צלם תמונה כל שבועיים כדי לעקוב אחר השינוי.
          </p>
        )}
      </div>
    </div>
  )
}
