import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini } from "@/lib/ai"

const DEMO_USER_ID = "demo-user"

// PRIVACY: Audio buffer is transient and not stored on disk or DB

const VOICE_PROMPT =
  'Listen to this audio log of a user describing what they ate. Identify all distinct meals mentioned. ' +
  'For each meal, identify EVERY individual food item/ingredient as its own separate entry — never bundle ' +
  'multiple distinct foods into one aggregated line, even if the user describes them as a single dish or ' +
  'meal. For example, "shawarma with pasta and peas" must become 3 separate items — shawarma, pasta, and ' +
  'peas — each with its own estimated quantity and macros, never one combined item. ' +
  'For each item, estimate its quantity in grams (field "quantity", unit "g") and its own calories, protein, ' +
  'carbs, fat, and sugar. Name each item in Hebrew. ' +
  'Also evaluate each meal\'s OVERALL protein-to-calorie ratio, summed across all of that meal\'s items ' +
  '((total protein grams × 4) / total calories) for a vegetarian ' +
  'athlete pursuing hypertrophy. If the ratio is under 0.10 (the meal is calorie/carb/fat "expensive" but ' +
  'low in protein), write one short, gentle Hebrew sentence suggesting a concrete swap or addition for next ' +
  'time — e.g. swapping oat milk for soy milk, adding a fraction of a tofu block, or using seitan. Never be ' +
  'judgmental or guilt-inducing. If the ratio is high (protein-dense relative to calories), write one short, ' +
  'warm Hebrew encouragement instead, e.g. "פצצת התאוששות! יחס חלבון-קלוריות מעולה." Put this sentence in an ' +
  '"insight" field on that meal (not per item — one insight per meal, based on its items combined). ' +
  'Return a JSON object with a single top-level \'meals\' array formatted EXACTLY like this: ' +
  '{ "meals": [ { "mealName": "בוקר/צהריים/ערב/נשנוש", "items": [ { "name": "Hebrew food item name", "quantity": number, "unit": "g", "calories": number, "protein": number, "carbs": number, "fat": number, "sugar": number } ], "insight": "one Hebrew sentence per the rule above" } ] }.'

interface VoiceFoodItem {
  name:     string
  quantity: number
  unit:     string
  calories: number
  protein:  number
  carbs:    number
  fat:      number
  sugar:    number
}

interface VoiceMeal {
  mealName: string
  items:    VoiceFoodItem[]
  insight?: string
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

    // Defensive normalization — an LLM omitting `items` on a meal shouldn't crash the client.
    const meals = result.meals.map((m) => ({
      ...m,
      items: Array.isArray(m.items) ? m.items : [],
    }))

    return NextResponse.json({ meals })
  } catch (err) {
    console.error("[POST /api/ai/analyze-voice]", err)
    return NextResponse.json({ error: "שגיאה בניתוח ההקלטה — נסה שוב" }, { status: 500 })
  }
}
