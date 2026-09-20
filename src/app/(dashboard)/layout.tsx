"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Dumbbell,
  UtensilsCrossed,
  LineChart,
  Zap,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ToastProvider } from "@/components/ui/Toast"

const NAV_ITEMS = [
  { href: "/dashboard",   label: "בית",      icon: LayoutDashboard },
  { href: "/workouts",    label: "אימונים",   icon: Dumbbell        },
  { href: "/gym",         label: "כושר",     icon: Zap             },
  { href: "/nutrition",   label: "תזונה",     icon: UtensilsCrossed },
  { href: "/metrics",     label: "מדדים",     icon: LineChart        },
] as const

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <ToastProvider>
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

      {/* Page content — bottom padding clears the fixed nav's own height
          (h-16) plus whatever safe-area inset it added on top of that. */}
      <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)]">{children}</main>

      {/* Mobile bottom navigation — true Apple chrome: white/80 + blur, hairline border.
          z-[45] sits above ordinary page content but below full-screen modals
          (z-50, e.g. WorkoutEditor/LabelScannerModal/ShakeModal) so an open
          modal still correctly covers it. pb-safe-area pushes the touch
          targets up out of iOS's home-indicator gesture band — without it
          (and without viewport-fit=cover in the root layout) the two outer
          buttons sit inside that dead zone and never receive taps.
          The bar's own background still spans full width (visual chrome),
          but px-4 on the row below insets the actual tap targets from the
          physical bezel — on a real device, iOS's edge-swipe/palm-rejection
          zones can eat touches within a few px of the true screen edge even
          when nothing in our own DOM is technically blocking them, which is
          invisible to any in-browser hit-testing (elementFromPoint, etc.). */}
      <nav className="fixed bottom-0 start-0 end-0 z-[45] bg-white/80 backdrop-blur-lg border-t border-gray-100 pointer-events-auto pb-[env(safe-area-inset-bottom)]">
        <ul className="flex items-stretch h-16 px-4">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href)
            return (
              <li key={href} className="flex-1 flex">
                {/* flex-1 + min-h-[4rem]: the whole column is the tap target,
                    not just the icon/label glyphs inside it. */}
                <Link
                  href={href}
                  prefetch={true}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 h-full min-h-[4rem] gap-1 text-[10px] font-medium transition-colors pointer-events-auto",
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
    </ToastProvider>
  )
}
