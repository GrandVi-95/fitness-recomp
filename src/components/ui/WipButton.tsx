"use client"

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"

interface WipButtonProps {
  children: React.ReactNode
  className?: string
  /** Override the toast message (default: "בפיתוח") */
  message?: string
  /** Render as a different element (default: button) */
  as?: "button" | "div"
}

/**
 * WipButton — wraps any button-like element to show a "בפיתוח" toast
 * when clicked, instead of doing anything.
 */
export function WipButton({
  children,
  className,
  message = "בפיתוח",
  as: Tag = "button",
}: WipButtonProps) {
  const [visible, setVisible] = useState(false)

  const handleClick = useCallback(() => {
    setVisible(true)
    setTimeout(() => setVisible(false), 2000)
  }, [])

  return (
    <>
      <Tag onClick={handleClick} className={cn("cursor-pointer relative", className)}>
        {children}
        {/* "בקרוב" badge — always visible so WIP items are clearly marked */}
        <span className="absolute top-1.5 end-1.5 bg-gray-200 text-gray-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none pointer-events-none">
          בקרוב
        </span>
      </Tag>

      {/* Toast */}
      <div
        aria-live="polite"
        className={cn(
          // left-1/2 (physical), not start-1/2 (logical) — centering has no
          // direction, and pairing a logical inset with a physical transform
          // doubles the offset under dir="rtl", pushing this almost entirely
          // off-screen.
          "fixed bottom-24 left-1/2 -translate-x-1/2 z-[100]",
          "px-4 py-2 rounded-xl bg-white border border-gray-100 text-sm font-medium text-gray-900 shadow-[0_8px_30px_rgb(0,0,0,0.08)]",
          "pointer-events-none transition-all duration-300",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        )}
      >
        {message}
      </div>
    </>
  )
}
