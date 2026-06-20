import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini } from "@/lib/ai"

const DEMO_USER_ID = "demo-user"

// PRIVACY: Audio buffer is transient and not stored on disk or DB

const VOICE_PROMPT =
  'Listen to this audio log of a user describing what they ate. Identify all distinct meals mentioned. ' +
  'For each meal, estimate the components and calculate metrics. ' +
  'Return a JSON object with a single top-level \'meals\' array formatted EXACTLY like this: ' +
  '{ "meals": [ { "mealName": "בוקר/צהריים/ערב/נשנוש", "ingredients": "comma separated list of ingredients with estimated grams in Hebrew", "calories": number, "protein": number, "carbs": number, "fat": number, "sugar": number } ] }.'

interface VoiceMeal {
  mealName:    string
  ingredients: string
  calories:    number
  protein:     number
  carbs:       number
  fat:         number
  sugar:       number
}

function resolveGeminiKey(aiProvider: string | null, userApiKey: string | null): string | null {
  if (aiProvider === "gemini" && userApiKey) return userApiKey
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
}

export async function POST(request: NextRequest) {
  try {
    const { audioBase64, mimeType } = (await request.json()) as {
      audioBase64: string
      mimeType:    string
    }

    if (!audioBase64 || !mimeType) {
      return NextResponse.json({ error: "נדרש קובץ שמע לניתוח" }, { status: 400 })
    }

    // ── Security guards ───────────────────────────────────────────────────────
    if (!mimeType.startsWith("audio/")) {
      return NextResponse.json(
        { error: "סוג קובץ לא נתמך — נדרש קובץ שמע (audio/*)" },
        { status: 400 },
      )
    }

    // base64 string length × 0.75 ≈ binary byte size; enforce 10 MB limit
    if (audioBase64.length * 0.75 > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "קובץ השמע גדול מדי — גודל מקסימלי 10MB" },
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

    const rawText = await callGemini(
      apiKey,
      [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: VOICE_PROMPT },
        ],
      }],
      { generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } },
    )

    const result = JSON.parse(rawText) as { meals: VoiceMeal[] }

    if (!Array.isArray(result.meals)) {
      return NextResponse.json(
        { error: "לא זוהו ארוחות בהקלטה — נסה לדבר בבירור ונסה שוב" },
        { status: 422 },
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/ai/analyze-voice]", err)
    return NextResponse.json({ error: "שגיאה בניתוח ההקלטה — נסה שוב" }, { status: 500 })
  }
}
