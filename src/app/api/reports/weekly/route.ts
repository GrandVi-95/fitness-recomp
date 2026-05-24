import { NextResponse } from "next/server"
import { getWeeklyReport } from "@/lib/weeklyReport"

// Re-export the shared types so existing imports of this path keep working.
export type { WeeklyReport, WeeklyReportDay, WeeklyReportSummary } from "@/lib/weeklyReport"

const DEMO_USER_ID = "demo-user"

/** GET /api/reports/weekly?weeksAgo=0 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const weeksAgo = Math.max(0, parseInt(searchParams.get("weeksAgo") ?? "0", 10) || 0)
    const report   = await getWeeklyReport(DEMO_USER_ID, weeksAgo)
    return NextResponse.json(report)
  } catch (err) {
    console.error("[GET /api/reports/weekly]", err)
    return NextResponse.json({ error: "שגיאה בייצור הדוח השבועי" }, { status: 500 })
  }
}
