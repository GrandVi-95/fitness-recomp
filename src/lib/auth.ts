// ─── Session auth (single shared account, master password) ─────────────────
// Session cookie = "<expiresAtMs>.<HMAC-SHA256(secret, expiresAtMs)>".
//  • Expires server-side (not just via cookie Max-Age) — a stolen cookie
//    stops working after SESSION_TTL_MS.
//  • Revocable — rotate AUTH_SECRET (or the master password, when
//    AUTH_SECRET isn't set) to invalidate every outstanding session.
//  • Fails CLOSED — no configured password means nobody is authenticated.
// Web Crypto only, so this runs in Proxy and in route handlers alike.

export const AUTH_COOKIE_NAME = "fitness_auth"
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const encoder = new TextEncoder()

export function getMasterPassword(): string | null {
  return process.env.APP_MASTER_PASSWORD || null
}

function getAuthSecret(): string | null {
  return process.env.AUTH_SECRET || getMasterPassword()
}

/** Constant-time string comparison (length is not secret here). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function createSessionToken(now: number = Date.now()): Promise<string | null> {
  const secret = getAuthSecret()
  if (!secret) return null
  const expiresAt = String(now + SESSION_TTL_MS)
  return `${expiresAt}.${await hmacHex(secret, `session:${expiresAt}`)}`
}

export async function verifySessionToken(token: string | undefined | null, now: number = Date.now()): Promise<boolean> {
  const secret = getAuthSecret()
  if (!secret || !token) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const expiresAt = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(expiresAt)
  if (!Number.isFinite(exp) || exp <= now) return false
  return safeEqual(sig, await hmacHex(secret, `session:${expiresAt}`))
}

/** Bearer check for Vercel Cron. Fails closed when CRON_SECRET is unset. */
export function isValidCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)
}

// ── Login throttling ─────────────────────────────────────────────────────────
// Best-effort, per-instance sliding window. Serverless instances don't share
// memory, so this bounds guessing per warm instance rather than globally —
// still far better than a fixed 400 ms sleep that parallel requests bypass.

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
const loginFailures = new Map<string, number[]>()

export function loginRetryAfterSecs(clientKey: string, now: number = Date.now()): number {
  const recent = (loginFailures.get(clientKey) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS)
  loginFailures.set(clientKey, recent)
  if (recent.length < LOGIN_MAX_FAILURES) return 0
  return Math.ceil((recent[0] + LOGIN_WINDOW_MS - now) / 1000)
}

export function recordLoginFailure(clientKey: string, now: number = Date.now()): void {
  const recent = (loginFailures.get(clientKey) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS)
  recent.push(now)
  loginFailures.set(clientKey, recent)
}

export function clearLoginFailures(clientKey: string): void {
  loginFailures.delete(clientKey)
}

export function clientKeyFromRequest(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}
