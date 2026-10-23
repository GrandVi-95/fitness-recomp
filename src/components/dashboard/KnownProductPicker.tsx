"use client"

import { useMemo, useState } from "react"
import { X, Search, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  makeChip,
  portionModes,
  type KnownChip,
  type PortionMode,
  type SavedProduct,
} from "@/lib/knownProducts"

// ─── Pick a saved product + portion → an exact "known" chip ────────────────

const MODE_LABELS: Record<PortionMode, string> = {
  servings: "מנות/יחידות",
  grams:    "גרם",
  percent:  "% מהאריזה",
  scoops:   "סקופים",
}

const DEFAULT_AMOUNT: Record<PortionMode, string> = {
  servings: "1",
  grams:    "100",
  percent:  "25",
  scoops:   "1",
}

interface Props {
  products: SavedProduct[] | null     // null = still loading
  initialProductKey?: string
  onClose: () => void
  onAdd: (chip: KnownChip, product: SavedProduct) => void
}

export default function KnownProductPicker({ products, initialProductKey, onClose, onAdd }: Props) {
  const [query, setQuery]     = useState("")
  const [selected, setSelected] = useState<SavedProduct | null>(
    () => products?.find((p) => p.key === initialProductKey) ?? null,
  )
  const [mode, setMode]       = useState<PortionMode>(() => (selected ? portionModes(selected)[0] : "servings"))
  const [amount, setAmount]   = useState(() => DEFAULT_AMOUNT[mode])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [products, query])

  const choose = (p: SavedProduct) => {
    const m = portionModes(p)[0]
    setSelected(p)
    setMode(m)
    setAmount(DEFAULT_AMOUNT[m])
  }

  const amountNum = parseFloat(amount.replace(",", "."))
  const valid = Number.isFinite(amountNum) && amountNum > 0 && (mode !== "percent" || amountNum <= 100)
  const preview = selected && valid ? makeChip(selected, amountNum, mode) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[85vh] overflow-y-auto bg-white border border-gray-100 rounded-2xl p-4 space-y-3 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">📦 מהמוצרים שלי</p>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="סגור">
            <X size={15} />
          </button>
        </div>

        {!selected ? (
          <>
            <div className="relative">
              <Search size={13} className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש מוצר שמור…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl ps-8 pe-3 py-2 text-sm focus:outline-none focus:border-[#007AFF]"
                autoFocus
              />
            </div>
            {products === null ? (
              <p className="text-xs text-gray-400 text-center py-4">טוען…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4 leading-relaxed">
                {products.length === 0
                  ? "אין עדיין מוצרים שמורים. סרוק תווית ושמור את המוצר, או שמור ארוחה כמועדפת בהוספה מהירה."
                  : "לא נמצא מוצר בשם הזה."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => choose(p)}
                    className="w-full text-start bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2"
                  >
                    <p className="text-sm text-gray-900 truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {p.kind === "powder"
                        ? `לסקופ: ${Math.round(p.calories)} קק"ל · ${p.protein} גר' חלבון`
                        : p.packageGrams
                          ? `אריזה ${p.packageGrams} גר': ${Math.round(p.calories)} קק"ל · ${p.protein} גר' חלבון`
                          : `כל המתכון: ${Math.round(p.calories)} קק"ל · ${p.protein} גר' חלבון`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-sm font-medium text-gray-900 truncate">{selected.name}</p>
              <button onClick={() => setSelected(null)} className="text-[11px] text-[#007AFF] shrink-0 ms-2">
                החלף
              </button>
            </div>
            <div className="flex gap-1.5">
              {portionModes(selected).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setAmount(DEFAULT_AMOUNT[m]) }}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[11px] font-semibold",
                    mode === m ? "bg-black text-white" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF]"
              aria-label="כמות"
            />
            {mode === "servings" && selected.kind === "recipe" && (
              <p className="text-[10px] text-gray-400">מנה אחת = {selected.servingPct}% מהאריזה/המתכון</p>
            )}
            {preview && (
              <p className="text-xs text-gray-700 bg-blue-50 rounded-xl px-3 py-2">
                {preview.calories} קק&quot;ל · {preview.protein} גר&apos; חלבון · {preview.carbs} גר&apos; פחמ&apos; · {preview.fat} גר&apos; שומן
                <span className="block text-[10px] text-[#007AFF] mt-0.5">ערכים מדויקים מהתווית השמורה</span>
              </p>
            )}
            <button
              onClick={() => preview && onAdd(preview, selected)}
              disabled={!preview}
              className="w-full flex items-center justify-center gap-1.5 rounded-full bg-[#007AFF] text-white text-sm font-semibold py-2.5 disabled:opacity-40"
            >
              <Check size={14} /> הוסף לארוחה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
