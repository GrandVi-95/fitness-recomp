"use client"

import { createContext, useContext, useCallback, useRef, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToastOptions {
  title:    string
  subtitle?: string
}

interface ToastContextValue {
  showToast: (opts: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Reads the nearest ToastProvider (mounted once in the dashboard layout) to
 *  trigger a transient bottom notification from anywhere in the app. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a ToastProvider")
  return ctx
}

const DISPLAY_MS = 4000

/** Single-slot toast host — a later call replaces whatever is currently
 *  showing rather than queueing, since this app never needs more than one
 *  transient notification on screen at a time. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast]     = useState<ToastOptions | null>(null)
  const [visible, setVisible] = useState(false)
  const hideTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((opts: ToastOptions) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
    setToast(opts)
    requestAnimationFrame(() => setVisible(true))
    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
      removeTimerRef.current = setTimeout(() => setToast(null), 300)
    }, DISPLAY_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          aria-live="polite"
          dir="rtl"
          className={cn(
            // Centering is direction-agnostic — left-1/2 (physical) pairs
            // correctly with -translate-x-1/2 (also physical). Using the
            // RTL-aware `start-1/2` here would resolve to `right: 50%` under
            // dir="rtl" while the transform still shifts left, doubling the
            // offset and pushing the toast almost entirely off-screen.
            "fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm",
            "flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
            "pointer-events-none transition-all duration-300",
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          )}
        >
          <CheckCircle2 size={20} className="text-[#34C759] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-gray-900">{toast.title}</p>
            {toast.subtitle && (
              <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{toast.subtitle}</p>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
