import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini } from "@/lib/ai"

const DEMO_USER_ID = "demo-user"

// PRIVACY: Image buffer is transient and not stored on disk or DB

const ANALYZE_PROMPT =
  'Analyze this image of food. Identify the ingredients and estimate their quantities in grams. ' +
  'Return a flat JSON object EXACTLY like this: { "ingredients": "comma separated list of ingredients with estimated grams in Hebrew", "calories": number, "protein": number, "carbs": number, "fat": number, "sugar": number }. ' +
  'Estimate sugar from visible sweet ingredients, sauces, fruit, or processed carbs. If not determinable, use 0.'

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

    const result = JSON.parse(rawText) as {
      ingredients: string
      calories:    number
      protein:     number
      carbs:       number
      fat:         number
      sugar:       number
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/ai/analyze-image]", err)
    return NextResponse.json({ error: "שגיאה בניתוח התמונה — נסה שוב" }, { status: 500 })
  }
}
