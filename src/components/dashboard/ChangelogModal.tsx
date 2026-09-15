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
        className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors font-mono"
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
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-sm bg-white border border-gray-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <BookOpen size={16} className="text-[#007AFF]" />
                יומן שינויים
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="סגור"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5 max-h-80 overflow-y-auto">
              {CHANGELOG.map((entry, i) => (
                <div key={entry.version} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#007AFF] font-mono">
                      {entry.version}
                    </span>
                    {i === 0 && (
                      <span className="text-[10px] bg-blue-50 text-[#007AFF] px-1.5 py-0.5 rounded-full font-medium">
                        עכשווי
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed" dir="rtl">
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
