// ── Shared Gemini AI utility ──────────────────────────────────────────────────
//
// Single source of truth for all Gemini API calls across the app.
// Handles: model fallback, 503/429 retry-backoff, secure header auth, and
// markdown fence stripping so callers always receive clean text.

const GEMINI_MODELS   = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
const MAX_RETRIES     = 3
const RETRY_DELAY_MS  = 1000

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

/**
 * Sanitize a raw model response and parse it as JSON.
 *
 * LLMs occasionally produce malformed JSON in these ways:
 *   • Prepend / append explanatory prose outside the `{…}` block
 *   • Embed literal newlines or tabs inside string values (invalid per RFC 8259)
 *   • Leave a trailing comma before `}` or `]`
 *
 * This function handles all three, then delegates to `JSON.parse`.
 * On failure it logs the exact faulty string and re-throws so callers can
 * return a structured 422 instead of a generic 500.
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
    console.error("[sanitizeAndParseJson] No JSON object found. Raw input:", raw.slice(0, 300))
    throw new SyntaxError("No JSON object found in model response")
  }
  const jsonSlice = cleaned.slice(start, end + 1)
  try {
    return JSON.parse(jsonSlice) as T
  } catch (err) {
    console.error("[sanitizeAndParseJson] JSON.parse failed. Sanitized slice:", jsonSlice.slice(0, 300))
    throw err
  }
}

// ── Core caller ───────────────────────────────────────────────────────────────

/**
 * Call the Gemini REST API with automatic model fallback and retry-backoff.
 *
 * - API key is passed via the `x-goog-api-key` header (never in the URL).
 * - 503 / 429 responses are retried up to MAX_RETRIES times per model before
 *   falling through to the next model in the chain.
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

  let lastError = ""

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        method:  "POST",
        headers: {
          "Content-Type":    "application/json",
          "x-goog-api-key":  apiKey,
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        console.log(`[callGemini] ${model} succeeded on attempt ${attempt}`)
        const data = await res.json()
        const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
        return stripMarkdownFences(text)
      }

      const errBody = await res.text().catch(() => "(unreadable)")

      if (res.status === 401 || res.status === 403) {
        throw new Error("Gemini API key is invalid or does not have access")
      }

      if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES) {
        console.warn(`[callGemini] ${model} attempt ${attempt} → ${res.status}, retrying in ${RETRY_DELAY_MS}ms`)
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
        continue
      }

      console.error(`[callGemini] ${model} HTTP ${res.status}:`, errBody)
      lastError = `${model} ${res.status}: ${errBody}`
      break
    }
  }

  throw new Error(`All Gemini models failed. Last: ${lastError}`)
}
