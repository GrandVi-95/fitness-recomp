import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini,
  checkAiRateLimit,
  requestErrorResponse,
  resolveGeminiKey,
  roundFoodItem,
  sanitizeAndParseJson,
  validateAiItems,
  IMAGE_BODY_MAX_BYTES, AIUnavailableError, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai"
import { readJsonBody, ValidationError } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

// PRIVACY: Image buffer is transient and not stored on disk or DB

const ANALYZE_PROMPT =
  'Analyze this image of food. Identify EVERY distinct food item visible as its own separate entry — never ' +
  'bundle multiple distinct foods into one aggregated line, even if they form a single plate or dish. For ' +
  'example, a plate containing shawarma, pasta, and peas must become 3 separate items — shawarma, pasta, and ' +
  'peas — each with its own estimated quantity and macros, never one combined item. ' +
  'For each item, estimate its quantity in grams (field "quantity", unit "g") and its own calories, protein, ' +
  'carbs, fat, and sugar. Name each item in Hebrew. Estimate sugar from visible sweet ingredients, sauces, ' +
  'fruit, or processed carbs; if sugar is not determinable, use null (never 0 as a placeholder). ' +
  'PORTION SIZE: give your UNBIASED, most likely estimate of each portion — neither conservative nor generous. ' +
  'Portion size from a photo alone is inherently uncertain (there is no guaranteed reference for scale), so ' +
  'ALSO give a plausible low/high range for the TOTAL calories of the whole photo in "calorieRange". ' +
  'HIDDEN CALORIES: explicitly consider cooking oil, butter, dressings and sauces. If the food looks fried, ' +
  'sautéed, roasted in oil, dressed or sauced, add a separate item for the likely oil/sauce (e.g. "שמן זית", ' +
  '"טחינה") with your best estimate, and let the range reflect that uncertainty. ' +
  'In the "insight" field, write one short, friendly Hebrew sentence gently reminding the user to double-check ' +
  'the estimated weight (and any oil/sauce you assumed), especially if the photo had no visual reference ' +
  'object (e.g. a hand, a coin, or a standard-size plate) to judge scale by. ' +
  'Return a JSON object EXACTLY like this: { "items": [ { "name": "Hebrew food item name", "quantity": number, ' +
  '"unit": "g", "calories": number, "protein": number, "carbs": number, "fat": number, "sugar": number or null } ], ' +
  '"calorieRange": { "low": number, "high": number }, "insight": "one short Hebrew sentence per the rule above" }.'

const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Low/high total-calorie range — optional; dropped (null) when implausible. */
function parseCalorieRange(raw: unknown, totalCalories: number): { low: number; high: number } | null {
  if (!raw || typeof raw !== "object") return null
  const { low, high } = raw as { low?: unknown; high?: unknown }
  if (typeof low !== "number" || typeof high !== "number") return null
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high > 20000 || low > high) return null
  // The point estimate should sit inside (or very near) the range.
  if (totalCalories < low * 0.9 || totalCalories > high * 1.1) return null
  return { low: Math.round(low), high: Math.round(high) }
}

export async function POST(request: NextRequest) {
  try {
    let imageBase64: unknown
    try {
      ({ imageBase64 } = await readJsonBody<{ imageBase64?: unknown }>(request, IMAGE_BODY_MAX_BYTES))
    } catch (err) {
      const res = requestErrorResponse(err)
      if (res) return res
      throw err
    }

    if (typeof imageBase64 !== "string" || !imageBase64) {
      return NextResponse.json({ error: "נדרשת תמונה לניתוח" }, { status: 400 })
    }

    // ── Security guards ───────────────────────────────────────────────────────
    const mimeMatch    = imageBase64.match(/^data:([^;]+);base64,/)
    const mimeType     = mimeMatch?.[1] ?? ""

    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { error: "סוג קובץ לא נתמך — השתמש ב-JPEG, PNG, או WebP" },
        { status: 400 },
      )
    }

    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "")
    // base64 string length × 0.75 ≈ binary byte size; enforce 5 MB limit
    if (base64Data.length * 0.75 > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "התמונה גדולה מדי — גודל מקסימלי 5MB" },
        { status: 413 },
      )
    }

    const limited = checkAiRateLimit()
    if (limited) return limited

    const settings = await db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } })
    const apiKey   = resolveGeminiKey(settings?.aiProvider ?? null, settings?.aiApiKey ?? null)

    if (!apiKey) {
      return NextResponse.json(
        { error: "מפתח Gemini API אינו מוגדר — הגדר GEMINI_API_KEY ב-.env.local" },
        { status: 500 },
      )
    }

    const rawText = await callGemini(apiKey, [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: ANALYZE_PROMPT },
      ],
    }], { generationConfig: { responseMimeType: "application/json" } })

    let parsed: { items?: unknown; insight?: unknown; calorieRange?: unknown }
    try {
      parsed = sanitizeAndParseJson(rawText)
    } catch {
      return NextResponse.json(
        { error: "המודל החזיר תשובה לא תקינה — נסה תמונה אחרת" },
        { status: 422 },
      )
    }

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return NextResponse.json(
        { error: "לא זוהו פריטי מזון בתמונה — נסה תמונה ברורה יותר" },
        { status: 422 },
      )
    }

    let items
    try {
      items = validateAiItems(parsed.items).map(roundFoodItem)
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err
      console.error(`[POST /api/ai/analyze-image] invalid model output: ${err.message}`)
      return NextResponse.json(
        { error: "ה-AI החזיר ערכים תזונתיים לא סבירים — נסה שוב או צלם מחדש" },
        { status: 422 },
      )
    }

    const totalCalories = items.reduce((s, it) => s + it.calories, 0)
    const insight = typeof parsed.insight === "string" && parsed.insight.trim()
      ? parsed.insight.trim().slice(0, 300)
      : undefined

    return NextResponse.json({
      items,
      insight,
      // Uncertainty band for the whole photo (null when the model's range was unusable).
      calorieRange: parseCalorieRange(parsed.calorieRange, totalCalories),
    })
  } catch (err) {
    console.error("[POST /api/ai/analyze-image]", err instanceof Error ? err.message : "unknown error")
    if (err instanceof AIUnavailableError) {
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 })
    }
    return NextResponse.json({ error: "שגיאה בניתוח התמונה — נסה שוב" }, { status: 500 })
  }
}
