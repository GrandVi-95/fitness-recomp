import { NextResponse } from "next/server"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { getWeeklyReport } from "@/lib/weeklyReport"
import type { WeeklyReport, WeeklyReportDay } from "@/lib/weeklyReport"
import { isValidCronRequest } from "@/lib/auth"
import { takeRateLimit } from "@/lib/rateLimit"
import { dayOfWeekStr } from "@/lib/time"

const DEMO_USER_ID = "demo-user"

// ── Resend client ─────────────────────────────────────────────────────────────
// Set RESEND_API_KEY in your .env.local / Vercel env vars.
// Use your verified sending domain in production; "onboarding@resend.dev" works
// for testing on the free tier (recipient must be the account's email).
// Created lazily: constructing it at module load throws when RESEND_API_KEY
// is unset, which breaks the build and every cold start of this route.
let resendClient: Resend | null = null
function getResend(): Resend {
  resendClient ??= new Resend(process.env.RESEND_API_KEY)
  return resendClient
}
const FROM_ADDRESS = process.env.REPORT_FROM_EMAIL ?? "RecompOS <onboarding@resend.dev>"

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

// ── Coaching insights ─────────────────────────────────────────────────────────

function buildInsights(report: WeeklyReport): string[] {
  const { summary, user } = report
  const insights: string[] = []

  // Protein is judged with the same Green-Zone rule as the dashboard
  // (>= 1.6 g/kg), and only on days that were actually logged.
  if (summary.loggedWorkoutDaysCount > 0) {
    const hitRate = summary.proteinGoalHitOnWorkoutDays / summary.loggedWorkoutDaysCount
    if (hitRate < 0.5) {
      insights.push(
        `חלבון בימי אימון: הגעת לאזור הירוק (≥1.6 גר' לק"ג) רק ב-${summary.proteinGoalHitOnWorkoutDays}/${summary.loggedWorkoutDaysCount} ימים מתועדים. ארוחה עם 25–40 גר' חלבון אחרי האימון תעזור.`,
      )
    } else if (hitRate === 1) {
      insights.push(
        `מצוין! הגעת לאזור החלבון הירוק בכל ימי האימון המתועדים (יעד מלא: ${user.targetProtein}גר').`,
      )
    } else {
      insights.push(
        `חלבון בימי אימון: אזור ירוק ב-${summary.proteinGoalHitOnWorkoutDays}/${summary.loggedWorkoutDaysCount} ימים מתועדים — שמור על עקביות.`,
      )
    }
  }

  // Total sugar (natural + added) vs a calorie-scaled reference — informative,
  // not a hard limit: fruit and dairy sugars are not a problem in themselves.
  if (summary.loggedWorkoutDaysCount > 0 && summary.avgSugarOnWorkoutDays > summary.sugarLimitG) {
    insights.push(
      `סוכר כולל בימי אימון: ממוצע ${summary.avgSugarOnWorkoutDays}גר' — מעל הייחוס (~${summary.sugarLimitG}גר'). אם רובו ממשקאות/ממתקים, כדאי להחליף חלק בפחמימות מורכבות; סוכר מפירות ומוצרי חלב פחות מדאיג.`,
    )
  }

  if (summary.loggedDaysCount < 5) {
    insights.push(
      `תיעדת תזונה ב-${summary.loggedDaysCount}/7 ימים בלבד — הממוצעים כאן משקפים רק ימים מתועדים. בלי תיעוד עקבי, הצ'ק-אין לא ישנה יעדים.`,
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
  const [, month, dom] = day.date.split("-").map(Number)
  const dow = dayNames[String(dayOfWeekStr(day.date))] ?? ""
  const dateLabel = `${dow}' ${dom}/${month}`
  const proteinColor = day.isLogged ? (day.proteinTargetHit ? "#22c55e" : "#f97316") : "#94a3b8"
  const sugarColor = day.sugarOverLimit ? "#f59e0b" : "#22c55e"
  const gymBadge = day.isWorkoutDay
    ? `<span style="background:#4f46e5;color:#e0e7ff;padding:1px 7px;border-radius:9999px;font-size:11px;">💪 ${escapeHtml(day.workoutName ?? "אימון")}</span>`
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
        `<li style="margin-bottom:8px;color:#cbd5e1;font-size:14px;line-height:1.5;">${escapeHtml(i)}</li>`,
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
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">קק&quot;ל ממוצע (ימים מתועדים)</p>
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
            יעד חלבון: ${user.targetProtein}גר' · ירוק = אזור ירוק (≥1.6 גר'/ק"ג) · כתום = מתחת · סוכר: ייחוס לסוכר כולל, לא גבול קשיח
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

// ── Shared report runner ──────────────────────────────────────────────────────

async function runReport(isTest: boolean): Promise<NextResponse> {
  try {
    const settings = await db.userSettings.findUnique({
      where: { userId: DEMO_USER_ID },
      select: { reportEnabled: true, reportEmail: true },
    })

    if (!isTest && settings?.reportEnabled === false) {
      return NextResponse.json({ skipped: true, reason: "reports disabled by user" })
    }

    const recipientEmail = settings?.reportEmail?.trim() || process.env.REPORT_EMAIL
    if (!recipientEmail) {
      return NextResponse.json(
        { error: "אין כתובת אימייל מוגדרת — הגדר reportEmail בהגדרות או REPORT_EMAIL ב-.env.local" },
        { status: 400 },
      )
    }

    const weeksAgo = isTest ? 0 : 1
    const report   = await getWeeklyReport(DEMO_USER_ID, weeksAgo)

    // Dedupe scheduled sends: atomically claim this week before sending, so a
    // cron retry (or a duplicate invocation) can't email the same report twice.
    let previousClaim: string | null = null
    if (!isTest) {
      const existing = await db.userSettings.findUnique({
        where: { userId: DEMO_USER_ID },
        select: { lastReportWeekStart: true },
      })
      previousClaim = existing?.lastReportWeekStart ?? null
      const { count } = await db.userSettings.updateMany({
        where: {
          userId: DEMO_USER_ID,
          OR: [{ lastReportWeekStart: null }, { lastReportWeekStart: { not: report.weekStart } }],
        },
        data: { lastReportWeekStart: report.weekStart },
      })
      if (count === 0) {
        return NextResponse.json({ skipped: true, reason: "already sent for this week" })
      }
    }
    const insights = buildInsights(report)
    const subject  = isTest
      ? `[בדיקה] דוח שבועי — ${report.weekStart} עד ${report.weekEnd}`
      : `דוח שבועי — ${report.weekStart} עד ${report.weekEnd}`

    const releaseClaim = async () => {
      if (isTest) return
      await db.userSettings.updateMany({
        where: { userId: DEMO_USER_ID, lastReportWeekStart: report.weekStart },
        data: { lastReportWeekStart: previousClaim },
      })
    }

    let sendResult: Awaited<ReturnType<Resend["emails"]["send"]>>
    try {
      sendResult = await getResend().emails.send({
      from:    FROM_ADDRESS,
      to:      recipientEmail,
      subject,
      html:    buildEmailHtml(report, insights),
    })
    } catch (err) {
      await releaseClaim()
      throw err
    }
    const { data, error } = sendResult

    if (error) {
      console.error("[weekly-report] Resend error:", error.name)
      // Release the claim so the next run can retry.
      await releaseClaim()
      return NextResponse.json({ error: "שליחת המייל נכשלה" }, { status: 502 })
    }

    return NextResponse.json({
      sent:      true,
      messageId: data?.id,
      recipient: recipientEmail,
      period:    { start: report.weekStart, end: report.weekEnd },
      isTest,
      insights,
    })
  } catch (err) {
    console.error("[weekly-report] runReport error:", err)
    return NextResponse.json({ error: "שגיאה בשליחת הדוח השבועי" }, { status: 500 })
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────
// Proxy lets /api/cron/* through with a valid CRON_SECRET bearer, otherwise it
// requires the logged-in cookie. Scheduled (non-test) sends always require the
// bearer secret — fails closed when CRON_SECRET is unset.

// GET — invoked by Vercel Cron (Vercel sends GET with "Authorization: Bearer <CRON_SECRET>")
export async function GET(request: Request) {
  if (!isValidCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return runReport(false)
}

// POST — manual trigger from the Settings page ({ test: true }); the user is
// already authenticated by the proxy. Test sends are rate-limited.
export async function POST(request: Request) {
  let isTest = false
  try {
    const body = await request.json()
    isTest = body?.test === true
  } catch {
    // empty body is fine
  }

  if (!isTest && !isValidCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (isTest) {
    const retryAfter = takeRateLimit("report-test", 3, 10 * 60 * 1000)
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: "יותר מדי שליחות בדיקה — נסה שוב מאוחר יותר" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      )
    }
  }

  return runReport(isTest)
}
