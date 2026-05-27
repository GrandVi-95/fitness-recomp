"use client"

import { useState } from "react"
import { X, BookOpen } from "lucide-react"
import { CHANGELOG, APP_VERSION } from "@/lib/changelog"

export default function VersionBadge() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors font-mono"
      >
        {APP_VERSION}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <BookOpen size={16} className="text-indigo-400" />
                יומן שינויים
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                aria-label="סגור"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5 max-h-80 overflow-y-auto">
              {CHANGELOG.map((entry, i) => (
                <div key={entry.version} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-400 font-mono">
                      {entry.version}
                    </span>
                    {i === 0 && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-medium">
                        עכשווי
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed" dir="rtl">
                    {entry.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
