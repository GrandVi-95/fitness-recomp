// ── Shared Gemini AI utility ──────────────────────────────────────────────────
//
// Single source of truth for all Gemini API calls across the app.
// Handles: model fallback, 503/429 retry-backoff, secure header auth, and
// markdown fence stripping so callers always receive clean text.
// Also the shared AI request budget: per-request timeouts, a total deadline,
// rate limiting, key decryption and AI-output validation. Server-only.

import { NextResponse } from "next/server"
import { decryptSecret } from "@/lib/secrets"
import { takeRateLimit, AI_RATE_LIMIT } from "@/lib/rateLimit"
import { validateFoodItem, ValidationError, type ValidFoodItem } from "@/lib/validate"

export const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"]
const MAX_RETRIES     = 3
const RETRY_DELAY_MS  = 1500

// Each upstream HTTP call is aborted after this long…
export const AI_REQUEST_TIMEOUT_MS = 25_000
// …and the whole fallback/retry chain must finish within this deadline, so
// 3 models × 3 retries can never run unbounded.
export const AI_TOTAL_DEADLINE_MS = 50_000
// Don't start another attempt with less than this left on the clock.
const MIN_ATTEMPT_MS = 3_000

// Request-body caps (checked before JSON parsing — see readJsonBody).
export const TEXT_BODY_MAX_BYTES  = 20 * 1024
export const IMAGE_BODY_MAX_BYTES = 7 * 1024 * 1024
export const AUDIO_BODY_MAX_BYTES = 14 * 1024 * 1024
// Free-text inputs (food descriptions, recipe ingredients) are capped too.
export const MAX_FOOD_TEXT_CHARS = 4000

// ── Types ─────────────────────────────────────────────────────────────────────

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

export interface GeminiContent {
  role:  "user" | "model"
  parts: GeminiPart[]
}

export interface GeminiCallOptions {
  systemInstruction?: { parts: { text: string }[] }
  generationConfig?: {
    maxOutputTokens?:  number
    temperature?:      number
    responseMimeType?: string  // e.g. "application/json" to enable Gemini native JSON mode
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function stripMarkdownFences(raw: string): string {
  return raw.replace(/```(?:json)?\n?/g, "").replace(/```\n?/g, "").trim()
}

// Convenience builder for multimodal inline data parts (images, audio, video, etc.)
export function buildInlineDataPart(data: string, mimeType: string): GeminiPart {
  return { inlineData: { mimeType, data } }
}

/** fetch() that aborts after `timeoutMs` (body read included). */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = AI_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    // Buffer the body while the timer is still armed, so a stalled stream
    // can't outlive the timeout either.
    const body = await res.arrayBuffer()
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
  } finally {
    clearTimeout(timer)
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
}

/**
 * Sanitize a raw model response and parse it as JSON.
 *
 * LLMs occasionally produce malformed JSON in these ways:
 *   • Prepend / append explanatory prose outside the `{…}` block
 *   • Embed literal newlines or tabs inside string values (invalid per RFC 8259)
 *   • Leave a trailing comma before `}` or `]`
 *
 * This function handles all three, then delegates to `JSON.parse`.
 * On failure it logs only the response length (never the content — it can
 * echo the user's food text) and re-throws so callers can return a 422.
 */
export function sanitizeAndParseJson<T = unknown>(raw: string): T {
  // 1. Collapse literal newlines / tabs — they are invalid inside JSON strings
  let cleaned = raw
    .replace(/\r?\n|\r/g, " ")
    .replace(/\t/g, " ")
  // 2. Remove trailing commas before } or ] (another common LLM quirk)
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1")
  // 3. Extract the outermost {...} block in case the model prepended prose
  const start = cleaned.indexOf("{")
  const end   = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    console.error(`[sanitizeAndParseJson] No JSON object found (response length ${raw.length})`)
    throw new SyntaxError("No JSON object found in model response")
  }
  const jsonSlice = cleaned.slice(start, end + 1)
  try {
    return JSON.parse(jsonSlice) as T
  } catch (err) {
    console.error(`[sanitizeAndParseJson] JSON.parse failed (slice length ${jsonSlice.length})`)
    throw err
  }
}

// ── Request guards ───────────────────────────────────────────────────────────

/** Shared AI budget. Returns a 429 response when exceeded, else null. */
export function checkAiRateLimit(): NextResponse | null {
  const retryAfter = takeRateLimit("ai", AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)
  if (retryAfter <= 0) return null
  return NextResponse.json(
    { error: `יותר מדי בקשות AI — נסה שוב בעוד ${Math.max(1, Math.ceil(retryAfter / 60))} דקות` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  )
}

/** Maps a body-validation error to 413 / 400 (Hebrew); null for anything else. */
export function requestErrorResponse(err: unknown): NextResponse | null {
  if (!(err instanceof ValidationError)) return null
  if (err.message.startsWith("body too large")) {
    return NextResponse.json({ error: "הבקשה גדולה מדי" }, { status: 413 })
  }
  return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 })
}

// ── Key resolution ───────────────────────────────────────────────────────────
// Stored user keys are encrypted at rest — always decrypt before use.

/** Gemini key: the user's own key only when their provider is Gemini, else env. */
export function resolveGeminiKey(aiProvider: string | null, storedKey: string | null): string | null {
  const userKey = aiProvider === "gemini" ? decryptSecret(storedKey) : null
  return userKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
}

/**
 * Key for the user's chosen provider: user-saved key first, then that
 * provider's env var. Never falls back to a different provider.
 */
export function resolveProviderKey(provider: string, storedKey: string | null): string | null {
  const userKey = decryptSecret(storedKey)
  if (userKey) return userKey
  switch (provider) {
    case "anthropic": return process.env.ANTHROPIC_API_KEY ?? null
    case "openai":    return process.env.OPENAI_API_KEY ?? null
    case "gemini":    return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
    default:          return null
  }
}

// ── AI output validation ─────────────────────────────────────────────────────

export const MAX_AI_ITEMS = 40

/** Validates a model-produced items array; throws ValidationError on any bad item. */
export function validateAiItems(raw: unknown): ValidFoodItem[] {
  if (!Array.isArray(raw)) throw new ValidationError("items: expected an array")
  if (raw.length > MAX_AI_ITEMS) throw new ValidationError(`items: more than ${MAX_AI_ITEMS} entries`)
  return raw.map((item, i) => validateFoodItem(item, i))
}

/** Rounds a validated item's numbers to 0.1 (sub-nutrients keep null = unknown). */
export function roundFoodItem(item: ValidFoodItem): ValidFoodItem {
  const r = (v: number) => Math.round(v * 10) / 10
  const rn = (v: number | null) => (v === null ? null : r(v))
  return {
    ...item,
    quantity: r(item.quantity),
    calories: r(item.calories),
    protein: r(item.protein),
    carbs: r(item.carbs),
    fat: r(item.fat),
    fiber: rn(item.fiber),
    sugar: rn(item.sugar),
    saturatedFat: rn(item.saturatedFat),
  }
}

// ── Low-protein meal check (shared by text + voice logging insights) ────────
// A main meal is "low in protein" below an absolute amount, not a ratio of
// its calories: ~20 g, or 0.25 g/kg bodyweight when weight is known. Snacks
// are exempt.
export const LOW_PROTEIN_MEAL_FLOOR_G = 20
export const LOW_PROTEIN_MEAL_G_PER_KG = 0.25

export function lowProteinMealThresholdG(weightKg: number | null | undefined): number {
  return weightKg && weightKg > 0
    ? Math.round(weightKg * LOW_PROTEIN_MEAL_G_PER_KG)
    : LOW_PROTEIN_MEAL_FLOOR_G
}

// ── Core caller ───────────────────────────────────────────────────────────────

/**
 * Call the Gemini REST API with automatic model fallback and retry-backoff.
 *
 * - API key is passed via the `x-goog-api-key` header (never in the URL).
 * - Every attempt is aborted after AI_REQUEST_TIMEOUT_MS, and the whole
 *   chain gives up after AI_TOTAL_DEADLINE_MS.
 * - 503 / 429 responses are retried up to MAX_RETRIES times per model before
 *   falling through to the next model in the chain; timeouts fall through.
 * - 401 / 403 throw immediately (bad key — no point retrying or falling back).
 * - Markdown fences are stripped from the returned text so callers get raw JSON.
 */
export async function callGemini(
  apiKey:   string,
  contents: GeminiContent[],
  options:  GeminiCallOptions = {},
): Promise<string> {
  const payload = {
    ...(options.systemInstruction && { systemInstruction: options.systemInstruction }),
    contents,
    generationConfig: {
      maxOutputTokens:  options.generationConfig?.maxOutputTokens  ?? 8192,
      temperature:      options.generationConfig?.temperature      ?? 0.1,
      ...(options.generationConfig?.responseMimeType && {
        responseMimeType: options.generationConfig.responseMimeType,
      }),
    },
  }
  const body = JSON.stringify(payload)

  const deadline = Date.now() + AI_TOTAL_DEADLINE_MS
  let lastError = ""

  modelLoop:
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const timeLeft = deadline - Date.now()
      if (timeLeft < MIN_ATTEMPT_MS) {
        lastError = `${lastError ? `${lastError}; ` : ""}total deadline exceeded`
        break modelLoop
      }

      let res: Response
      try {
        res = await fetchWithTimeout(url, {
          method:  "POST",
          headers: {
            "Content-Type":    "application/json",
            "x-goog-api-key":  apiKey,
          },
          body,
        }, Math.min(AI_REQUEST_TIMEOUT_MS, timeLeft))
      } catch (err) {
        const reason = isAbortError(err) ? "timeout" : "network error"
        console.warn(`[callGemini] ${model} attempt ${attempt} → ${reason}`)
        lastError = `${model} ${reason}`
        break // next model
      }

      if (res.ok) {
        const data = await res.json()
        const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
        console.log(`[callGemini] ${model} succeeded on attempt ${attempt} (response length ${text.length})`)
        return stripMarkdownFences(text)
      }

      if (res.status === 401 || res.status === 403) {
        throw new Error("Gemini API key is invalid or does not have access")
      }

      if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES
          && deadline - Date.now() > RETRY_DELAY_MS + MIN_ATTEMPT_MS) {
        console.warn(`[callGemini] ${model} attempt ${attempt} → ${res.status}, retrying in ${RETRY_DELAY_MS}ms`)
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
        continue
      }

      // Status only — the error body can echo request content.
      console.error(`[callGemini] ${model} HTTP ${res.status}`)
      lastError = `${model} ${res.status}`
      break
    }
  }

  throw new Error(`All Gemini models failed. Last: ${lastError}`)
}
