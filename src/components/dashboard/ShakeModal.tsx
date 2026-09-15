"use client"

import { useState, useEffect, useMemo } from "react"
import { X, Loader2, Check, AlertCircle, ScanLine } from "lucide-react"
import { LIQUID_PRESETS, DEFAULT_LIQUID_ID } from "@/lib/nutrition"

interface SavedProtein {
  id:               string
  name:             string
  caloriesPerScoop: number
  proteinPerScoop:  number
  carbsPerScoop:    number
  fatPerScoop:      number
}

interface Props {
  mealType: string
  onClose: () => void
  onLogged: () => void
  // Lets the user jump straight into the Label Scanner when they have no
  // saved powders yet, rather than dead-ending on an empty dropdown.
  onScanLabel?: () => void
}

export default function ShakeModal({ mealType, onClose, onLogged, onScanLabel }: Props) {
  const [proteins, setProteins]     = useState<SavedProtein[] | null>(null)
  const [proteinId, setProteinId]   = useState<string>("")
  const [liquidId, setLiquidId]     = useState<string>(DEFAULT_LIQUID_ID)
  const [scoops, setScoops]         = useState("1")
  const [logging, setLogging]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/proteins")
      .then((r) => r.json())
      .then((d) => {
        const list: SavedProtein[] = d.proteins ?? []
        setProteins(list)
        if (list.length > 0) setProteinId(list[0].id)
      })
      .catch(() => setProteins([]))
  }, [])

  const powder = proteins?.find((p) => p.id === proteinId) ?? null
  const liquid = LIQUID_PRESETS[liquidId]
  const scoopsNum = parseFloat(scoops) || 0

  const combined = useMemo(() => {
    if (!powder) return null
    return {
      calories: Math.round((powder.caloriesPerScoop * scoopsNum + liquid.calories) * 10) / 10,
      protein:  Math.round((powder.proteinPerScoop  * scoopsNum + liquid.protein)  * 10) / 10,
      carbs:    Math.round((powder.carbsPerScoop    * scoopsNum + liquid.carbs)    * 10) / 10,
      fat:      Math.round((powder.fatPerScoop      * scoopsNum + liquid.fat)      * 10) / 10,
    }
  }, [powder, liquid, scoopsNum])

  const handleLog = async () => {
    if (!powder || !combined || scoopsNum <= 0 || logging) return
    setLogging(true)
    setError(null)
    try {
      const res = await fetch("/api/nutrition/log", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          mealType,
          directItems: [{
            name:     `שייק — ${powder.name} + ${liquid.name}`,
            quantity: 1,
            unit:     "shake",
            calories: combined.calories,
            protein:  combined.protein,
            carbs:    combined.carbs,
            fat:      combined.fat,
            sugar:    0,
          }],
        }),
      })
      if (!res.ok) {
        setError("הרישום נכשל — נסה שוב")
        return
      }
      onLogged()
    } catch {
      setError("שגיאת חיבור — נסה שוב")
    } finally {
      setLogging(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white border border-gray-100 rounded-2xl p-4 space-y-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-violet-600 flex items-center gap-1.5">
            🥤 שייק מהיר
          </p>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="סגור"
          >
            <X size={15} />
          </button>
        </div>

        {proteins === null ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-gray-300" />
          </div>
        ) : proteins.length === 0 ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              עדיין אין אבקות חלבון שמורות. סרוק תווית של אבקת חלבון ולחץ
              &quot;שמור לאבקות שלי&quot; כדי להוסיף אחת.
            </p>
            {onScanLabel && (
              <button
                onClick={() => { onClose(); onScanLabel() }}
                className="inline-flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
              >
                <ScanLine size={13} /> סרוק תווית
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Powder select */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">אבקת חלבון</label>
              <select
                value={proteinId}
                onChange={(e) => setProteinId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-400 transition-colors"
              >
                {proteins.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Liquid select */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">בסיס נוזלי (250 מ&quot;ל)</label>
              <select
                value={liquidId}
                onChange={(e) => setLiquidId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-400 transition-colors"
              >
                {Object.values(LIQUID_PRESETS).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Scoops */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">כמות מנות (סקופים)</label>
              <input
                type="number"
                value={scoops}
                onChange={(e) => setScoops(e.target.value)}
                min={0.5}
                max={5}
                step={0.5}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-center font-bold text-gray-900 focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>

            {/* Combined macro preview */}
            {combined && (
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
                <p className="text-[11px] font-semibold text-gray-700 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="text-[#FF9500]">{combined.calories} קק&quot;ל</span>
                  <span className="text-[#007AFF]">{combined.protein}ג&apos; חלב&apos;</span>
                  <span className="text-[#34C759]">{combined.carbs}ג&apos; פחמ&apos;</span>
                  <span className="text-amber-600">{combined.fat}ג&apos; שומן</span>
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-[#FF3B30] bg-red-50 rounded-xl px-3 py-2">
                <AlertCircle size={12} className="shrink-0" /> {error}
              </div>
            )}

            <button
              onClick={handleLog}
              disabled={logging || !powder || scoopsNum <= 0}
              className="w-full flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 rounded-full py-3 text-sm font-semibold text-white active:scale-95 transition"
            >
              {logging ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {logging ? "רושם..." : "רשום שייק"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
