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
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/dashboard",   label: "בית",      icon: LayoutDashboard },
  { href: "/workouts",    label: "אימונים",   icon: Dumbbell        },
  { href: "/gym",         label: "כושר",     icon: Zap             },
  { href: "/nutrition",   label: "תזונה",     icon: UtensilsCrossed },
  { href: "/metrics",     label: "מדדים",     icon: LineChart        },
  { href: "/weekly",      label: "שבועי",     icon: BarChart3       },
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
      {/* Top header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <span className="text-lg font-bold tracking-tight text-indigo-400">
          Recomp<span className="text-slate-100">OS</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium">
            {new Date().toLocaleDateString("he-IL", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          <Link
            href="/settings"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="הגדרות"
          >
            <Settings size={17} strokeWidth={1.8} />
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 start-0 end-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800">
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
                    "flex flex-col items-center justify-center gap-0.5 h-full w-full text-[10px] font-medium transition-colors",
                    active
                      ? "text-indigo-400"
                      : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.5 : 1.8}
                    className={active ? "text-indigo-400" : ""}
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
