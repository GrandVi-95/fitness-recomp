import { NextResponse } from "next/server"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { getWeeklyReport } from "@/lib/weeklyReport"
import type { WeeklyReport, WeeklyReportDay } from "@/lib/weeklyReport"

const DEMO_USER_ID = "demo-user"

// ── Resend client ─────────────────────────────────────────────────────────────
// Set RESEND_API_KEY in your .env.local / Vercel env vars.
// Use your verified sending domain in production; "onboarding@resend.dev" works
// for testing on the free tier (recipient must be the account's email).
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_ADDRESS = process.env.REPORT_FROM_EMAIL ?? "RecompOS <onboarding@resend.dev>"

// ── Coaching insights ─────────────────────────────────────────────────────────

function buildInsights(report: WeeklyReport): string[] {
  const { summary, user } = report
  const insights: string[] = []

  if (summary.workoutDaysCount > 0) {
    const hitRate = summary.proteinGoalHitOnWorkoutDays / summary.workoutDaysCount
    if (hitRate < 0.5) {
      insights.push(
        `חלבון על ימי אימון: פגעת ביעד (${user.targetProtein}גר') רק ${summary.proteinGoalHitOnWorkoutDays}/${summary.workoutDaysCount} ימים. שקול שייק חלבון לפני שינה בימי אימון.`,
      )
    } else if (hitRate === 1) {
      insights.push(
        `מצוין! פגעת ביעד החלבון (${user.targetProtein}גר') בכל ימי האימון השבוע.`,
      )
    } else {
      insights.push(
        `חלבון על ימי אימון: פגעת ביעד ${summary.proteinGoalHitOnWorkoutDays}/${summary.workoutDaysCount} ימים — שמור על עקביות.`,
      )
    }
  }

  if (summary.workoutDaysCount > 0 && summary.avgSugarOnWorkoutDays > summary.sugarLimitG) {
    insights.push(
      `ממוצע סוכר בימי אימון: ${summary.avgSugarOnWorkoutDays}גר' — מעל המגבלה של ${summary.sugarLimitG}גר'. העדף פחמימות מורכבות (שיבולת שועל, אורז מלא, בטטה).`,
    )
  } else if (summary.workoutDaysCount > 0) {
    insights.push(
      `צריכת הסוכר בימי אימון מצוינת — ממוצע ${summary.avgSugarOnWorkoutDays}גר' (מגבלה: ${summary.sugarLimitG}גר').`,
    )
  }

  if (summary.loggedDaysCount < 5) {
    insights.push(
      `תיעדת תזונה ב-${summary.loggedDaysCount}/7 ימים בלבד. תיעוד עקבי הוא הגורם המנבא הטוב ביותר להצלחה.`,
    )
  }

  if (summary.workoutDaysCount < 3) {
    insights.push(
      `השבוע אומנו ${summary.workoutDaysCount} ימים. שגרת AB מטרגטת 3–4 ימים לשבוע לצמיחה מיטבית.`,
    )
  }

  return insights.length > 0 ? insights : ["שבוע מצוין — עקביות מושלמת! המשך כך."]
}

// ── HTML email template ───────────────────────────────────────────────────────

function dayRow(day: WeeklyReportDay): string {
  const dayNames: Record<string, string> = {
    "0": "א", "1": "ב", "2": "ג", "3": "ד", "4": "ה", "5": "ו", "6": "ש",
  }
  const d = new Date(day.date + "T00:00:00")
  const dow = dayNames[String(d.getDay())] ?? ""
  const dateLabel = `${dow}' ${d.getDate()}/${d.getMonth() + 1}`
  const proteinColor = day.calories > 0 ? (day.proteinTargetHit ? "#22c55e" : "#f97316") : "#94a3b8"
  const sugarColor = day.sugarOverLimit ? "#ef4444" : "#22c55e"
  const gymBadge = day.isWorkoutDay
    ? `<span style="background:#4f46e5;color:#e0e7ff;padding:1px 7px;border-radius:9999px;font-size:11px;">💪 ${day.workoutName ?? "אימון"}</span>`
    : `<span style="color:#64748b;font-size:11px;">מנוחה</span>`

  return `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:8px 10px;font-size:13px;color:#cbd5e1;">${dateLabel}</td>
      <td style="padding:8px 10px;font-size:13px;">${gymBadge}</td>
      <td style="padding:8px 10px;font-size:13px;color:#f8fafc;text-align:center;">${day.calories > 0 ? day.calories : "—"}</td>
      <td style="padding:8px 10px;font-size:13px;color:${proteinColor};text-align:center;font-weight:600;">${day.protein > 0 ? day.protein + "גר'" : "—"}</td>
      <td style="padding:8px 10px;font-size:13px;color:${sugarColor};text-align:center;">${day.sugar > 0 ? day.sugar + "גר'" : "—"}</td>
    </tr>`
}

function buildEmailHtml(report: WeeklyReport, insights: string[]): string {
  const { summary, user } = report
  const insightRows = insights
    .map(
      (i) =>
        `<li style="margin-bottom:8px;color:#cbd5e1;font-size:14px;line-height:1.5;">${i}</li>`,
    )
    .join("")

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px 16px 0 0;padding:28px 28px 24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#c4b5fd;letter-spacing:2px;text-transform:uppercase;">RECOMPOS</p>
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#fff;">דוח שבועי</h1>
          <p style="margin:8px 0 0;font-size:13px;color:#ddd6fe;">${report.weekStart} — ${report.weekEnd}</p>
        </td>
      </tr>

      <!-- Stats row -->
      <tr>
        <td style="background:#1e293b;padding:20px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center;padding:0 8px;">
                <p style="margin:0;font-size:28px;font-weight:800;color:#818cf8;">${summary.workoutDaysCount}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">ימי אימון</p>
              </td>
              <td style="text-align:center;padding:0 8px;border-right:1px solid #334155;border-left:1px solid #334155;">
                <p style="margin:0;font-size:28px;font-weight:800;color:#34d399;">${summary.avgCalories > 0 ? summary.avgCalories.toLocaleString() : "—"}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">קק&quot;ל ממוצע</p>
              </td>
              <td style="text-align:center;padding:0 8px;">
                <p style="margin:0;font-size:28px;font-weight:800;color:#a78bfa;">${summary.avgProtein > 0 ? summary.avgProtein + "גר'" : "—"}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">חלבון ממוצע</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Day-by-day table -->
      <tr>
        <td style="background:#1e293b;padding:0 28px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #334155;border-radius:10px;overflow:hidden;">
            <thead>
              <tr style="background:#0f172a;">
                <th style="padding:8px 10px;font-size:11px;color:#475569;font-weight:600;text-align:right;">יום</th>
                <th style="padding:8px 10px;font-size:11px;color:#475569;font-weight:600;text-align:right;">אימון</th>
                <th style="padding:8px 10px;font-size:11px;color:#475569;font-weight:600;text-align:center;">קק&quot;ל</th>
                <th style="padding:8px 10px;font-size:11px;color:#475569;font-weight:600;text-align:center;">חלבון</th>
                <th style="padding:8px 10px;font-size:11px;color:#475569;font-weight:600;text-align:center;">סוכר</th>
              </tr>
            </thead>
            <tbody>${report.days.map(dayRow).join("")}</tbody>
          </table>
          <p style="margin:6px 0 0;font-size:10px;color:#475569;text-align:center;">
            יעד חלבון: ${user.targetProtein}גר' · ירוק = בסדר · כתום/אדום = מתחת ליעד / מעל גבול
          </p>
        </td>
      </tr>

      <!-- Insights -->
      <tr>
        <td style="background:#1e293b;padding:0 28px 28px;">
          <div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:20px;">
            <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#e2e8f0;">💡 תובנות השבוע</p>
            <ul style="margin:0;padding-right:18px;">${insightRows}</ul>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#0f172a;border-radius:0 0 16px 16px;padding:16px 28px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#334155;">
            RecompOS · דוח שבועי אוטומטי · לשינוי הגדרות הדוח פתח את
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/settings" style="color:#818cf8;text-decoration:none;">ההגדרות</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Parse body — may be empty (Vercel Cron sends no body)
  let isTestTrigger = false
  try {
    const body = await request.json()
    isTestTrigger = body?.test === true
  } catch {
    // Empty body from Vercel Cron — that's fine
  }

  // Auth:
  //  • Vercel Cron → must carry "Authorization: Bearer $CRON_SECRET"
  //  • Manual test → no secret required (single-user demo app)
  if (!isTestTrigger && process.env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    // Load per-user report settings
    const settings = await db.userSettings.findUnique({
      where: { userId: DEMO_USER_ID },
      select: { reportEnabled: true, reportEmail: true },
    })

    // Respect the user's opt-out, but never skip a manual test send
    if (!isTestTrigger && settings?.reportEnabled === false) {
      return NextResponse.json({ skipped: true, reason: "reports disabled by user" })
    }

    // Recipient: DB setting → env var fallback
    const recipientEmail = settings?.reportEmail?.trim() || process.env.REPORT_EMAIL
    if (!recipientEmail) {
      return NextResponse.json(
        { error: "אין כתובת אימייל מוגדרת — הגדר reportEmail בהגדרות או REPORT_EMAIL ב-.env.local" },
        { status: 400 },
      )
    }

    // Build the report: test = current week, cron = previous week
    const weeksAgo = isTestTrigger ? 0 : 1
    const report   = await getWeeklyReport(DEMO_USER_ID, weeksAgo)
    const insights = buildInsights(report)
    const subject  = isTestTrigger
      ? `[בדיקה] דוח שבועי — ${report.weekStart} עד ${report.weekEnd}`
      : `דוח שבועי — ${report.weekStart} עד ${report.weekEnd}`

    const { data, error } = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      recipientEmail,
      subject,
      html:    buildEmailHtml(report, insights),
    })

    if (error) {
      console.error("[weekly-report] Resend error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      sent:       true,
      messageId:  data?.id,
      recipient:  recipientEmail,
      period:     { start: report.weekStart, end: report.weekEnd },
      isTest:     isTestTrigger,
      insights,
    })
  } catch (err) {
    console.error("[POST /api/cron/weekly-report]", err)
    return NextResponse.json(
      { error: "שגיאה בשליחת הדוח השבועי" },
      { status: 500 },
    )
  }
}
