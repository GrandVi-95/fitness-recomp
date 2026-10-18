// ─── Local-time helpers (Asia/Jerusalem) ────────────────────────────────────
// Single source of truth for "which local day is it" and day/week boundaries.
// Uses the IANA zone via Intl, so DST (UTC+3 summer / UTC+2 winter) is handled
// correctly and the result never depends on the server's own timezone.
// Pure — safe in Client Components, Server Components, API routes and Proxy.

export const APP_TIME_ZONE = "Asia/Jerusalem"

const DAY_MS = 24 * 60 * 60 * 1000

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

function zonedParts(d: Date) {
  const p: Record<string, number> = {}
  for (const { type, value } of partsFormatter.formatToParts(d)) {
    if (type !== "literal") p[type] = Number(value)
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** Offset (ms) of the app timezone from UTC at instant `d` — e.g. +3h in summer. */
function zoneOffsetMs(d: Date): number {
  const p = zonedParts(d)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(d.getTime() / 1000) * 1000
}

/** "YYYY-MM-DD" of instant `d` in Israel local time. */
export function localDateStr(d: Date = new Date()): string {
  const p = zonedParts(d)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** Local hour (0–23) of instant `d` in Israel local time. */
export function localHour(d: Date = new Date()): number {
  return zonedParts(d).hour
}

/** UTC instant of local midnight that starts the given "YYYY-MM-DD" day. */
export function startOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d)
  // Two passes: the offset at the guess can differ from the offset at the
  // true midnight on DST-transition days.
  let t = guess - zoneOffsetMs(new Date(guess))
  t = guess - zoneOffsetMs(new Date(t))
  return new Date(t)
}

/** Add whole calendar days to a "YYYY-MM-DD" string. */
export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
  return t.toISOString().slice(0, 10)
}

/** Day of week (0 = Sunday) of a "YYYY-MM-DD" string. */
export function dayOfWeekStr(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Half-open bounds [start, nextStart) of the local day containing `d`. */
export function getLocalDayBounds(d: Date = new Date()): { start: Date; nextStart: Date; dateStr: string } {
  const dateStr = localDateStr(d)
  return { start: startOfLocalDay(dateStr), nextStart: startOfLocalDay(addDaysStr(dateStr, 1)), dateStr }
}

/**
 * Half-open bounds of a Sunday→Saturday local week. `weeksAgo` = 0 is the
 * current week, 1 the previous one.
 */
export function getLocalWeekBounds(weeksAgo = 0, now: Date = new Date()): {
  start: Date
  nextStart: Date
  startStr: string
  endStr: string
} {
  const today = localDateStr(now)
  const startStr = addDaysStr(today, -dayOfWeekStr(today) - weeksAgo * 7)
  const endStr = addDaysStr(startStr, 6)
  return {
    start: startOfLocalDay(startStr),
    nextStart: startOfLocalDay(addDaysStr(startStr, 7)),
    startStr,
    endStr,
  }
}

/** Whole local days between two instants (b − a), by calendar date. */
export function localDaysBetween(a: Date, b: Date): number {
  const [ay, am, ad] = localDateStr(a).split("-").map(Number)
  const [by, bm, bd] = localDateStr(b).split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS)
}
