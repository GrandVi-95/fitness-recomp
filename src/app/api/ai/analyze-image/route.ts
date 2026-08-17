import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini } from "@/lib/ai"

const DEMO_USER_ID = "demo-user"

// PRIVACY: Image buffer is transient and not stored on disk or DB

const ANALYZE_PROMPT =
  'Analyze this image of food. Identify EVERY distinct food item visible as its own separate entry — never ' +
  'bundle multiple distinct foods into one aggregated line, even if they form a single plate or dish. For ' +
  'example, a plate containing shawarma, pasta, and peas must become 3 separate items — shawarma, pasta, and ' +
  'peas — each with its own estimated quantity and macros, never one combined item. ' +
  'For each item, estimate its quantity in grams (field "quantity", unit "g") and its own calories, protein, ' +
  'carbs, fat, and sugar. Name each item in Hebrew. Estimate sugar from visible sweet ingredients, sauces, ' +
  'fruit, or processed carbs; if not determinable, use 0. ' +
  'IMPORTANT — scale ambiguity: when analyzing an image with no explicit weight given in accompanying text ' +
  'or voice, be aware that portion size estimated from a photo alone is inherently uncertain — there is no ' +
  'guaranteed reference for scale. Estimate portion sizes conservatively rather than generously. In the ' +
  '"insight" field, write one short, friendly Hebrew sentence gently reminding the user to double-check the ' +
  'estimated weight, especially if the photo had no visual reference object (e.g. a hand, a coin, or a ' +
  'standard-size plate) to judge scale by. ' +
  'Return a JSON object EXACTLY like this: { "items": [ { "name": "Hebrew food item name", "quantity": number, "unit": "g", "calories": number, "protein": number, "carbs": number, "fat": number, "sugar": number } ], "insight": "one short Hebrew sentence per the rule above" }.'

interface ImageFoodItem {
  name:     string
  quantity: number
  unit:     string
  calories: number
  protein:  number
  carbs:    number
  fat:      number
  sugar:    number
}

function resolveGeminiKey(aiProvider: string | null, userApiKey: string | null): string | null {
  if (aiProvider === "gemini" && userApiKey) return userApiKey
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = (await request.json()) as { imageBase64: string }

    if (!imageBase64) {
      return NextResponse.json({ error: "נדרשת תמונה לניתוח" }, { status: 400 })
    }

    // ── Security guards ───────────────────────────────────────────────────────
    const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
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
    if (base64Data.length * 0.75 > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "התמונה גדולה מדי — גודל מקסימלי 5MB" },
        { status: 400 },
      )
    }

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
    }])

    const result = JSON.parse(rawText) as { items: ImageFoodItem[]; insight?: string }

    if (!Array.isArray(result.items) || result.items.length === 0) {
      return NextResponse.json(
        { error: "לא זוהו פריטי מזון בתמונה — נסה תמונה ברורה יותר" },
        { status: 422 },
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/ai/analyze-image]", err)
    return NextResponse.json({ error: "שגיאה בניתוח התמונה — נסה שוב" }, { status: 500 })
  }
}
