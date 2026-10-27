"use client"

import { useState, useSyncExternalStore } from "react"
import { ChevronDown, Eye } from "lucide-react"
import ExerciseFigure from "@/components/gym/ExerciseFigure"
import { getExerciseDemo } from "@/lib/exerciseDemos"
import { cn } from "@/lib/utils"

const OPEN_KEY = "exercise-demo-open"

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb)
  return () => window.removeEventListener("storage", cb)
}

/** "How to perform" pictogram(s) for the current exercise — one per superset
 *  member. Renders nothing for custom exercises without a demo. Open/closed
 *  is remembered so it stays out of the way once the user knows the moves. */
export default function ExerciseDemoCard({ names }: { names: string[] }) {
  const stored = useSyncExternalStore(subscribe, () => localStorage.getItem(OPEN_KEY), () => null)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? stored !== "0"

  const demos = names
    .map((name) => ({ name, demo: getExerciseDemo(name) }))
    .filter((d) => d.demo !== null)
  if (demos.length === 0) return null

  const toggle = () => {
    localStorage.setItem(OPEN_KEY, open ? "0" : "1")
    setToggled(!open)
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_4px_16px_rgb(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-600"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <Eye size={14} className="text-[#FF6A2B]" />
          איך מבצעים
        </span>
        <ChevronDown size={16} className={cn("text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-2 pb-3 space-y-3">
          {demos.map(({ name, demo }) => (
            <div key={name}>
              {demos.length > 1 && (
                <p className="text-[11px] font-bold text-gray-500 px-2 mb-1 truncate">{name}</p>
              )}
              <ExerciseFigure demo={demo!} title={name} className="w-full h-auto text-gray-800" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
