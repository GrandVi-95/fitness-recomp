"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Dumbbell,
  UtensilsCrossed,
  LineChart,
  Zap,
  HeartPulse,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/dashboard",   label: "בית",      icon: LayoutDashboard },
  { href: "/workouts",    label: "אימונים",   icon: Dumbbell        },
  { href: "/gym",         label: "כושר",     icon: Zap             },
  { href: "/nutrition",   label: "תזונה",     icon: UtensilsCrossed },
  { href: "/metrics",     label: "מדדים",     icon: LineChart        },
  { href: "/recovery",    label: "התאוששות", icon: HeartPulse      },
] as const

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top header — true Apple chrome: white/70 + blur, hairline border */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white/70 backdrop-blur-lg">
        <span className="text-lg font-semibold tracking-tight text-gray-900">
          Recomp<span className="text-black">OS</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-medium">
            {new Date().toLocaleDateString("he-IL", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          <Link
            href="/settings"
            className="p-1.5 rounded-full text-gray-400 hover:text-black hover:bg-gray-100 transition-colors"
            aria-label="הגדרות"
          >
            <Settings size={17} strokeWidth={1.8} />
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>

      {/* Mobile bottom navigation — true Apple chrome: white/80 + blur, hairline border */}
      <nav className="fixed bottom-0 start-0 end-0 z-40 bg-white/80 backdrop-blur-lg border-t border-gray-100">
        <ul className="flex items-stretch h-16">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href)
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 h-full w-full text-[10px] font-medium transition-colors",
                    active
                      ? "text-black"
                      : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.5 : 1.8}
                    className={active ? "text-black" : ""}
                  />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
