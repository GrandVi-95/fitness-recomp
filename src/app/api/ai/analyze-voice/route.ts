import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini,
  checkAiRateLimit,
  lowProteinMealThresholdG,
  requestErrorResponse,
  resolveGeminiKey,
  roundFoodItem,
  sanitizeAndParseJson,
  validateAiItems,
  AUDIO_BODY_MAX_BYTES, AIUnavailableError, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai"
import { readJsonBody, ValidationError, type ValidFoodItem } from "@/lib/validate"
import { getTrendWeight } from "@/lib/targets-server"

const DEMO_USER_ID = "demo-user"

// PRIVACY: Audio buffer is transient and not stored on disk or DB

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MAX_MEALS = 10
const SNACK_MEAL_NAME = "נשנוש"

function buildVoicePrompt(proteinFloorG: number): string {
  return (
    'Listen to this audio log of a user describing what they ate. Identify all distinct meals mentioned. ' +
    'For each meal, identify EVERY individual food item/ingredient as its own separate entry — never bundle ' +
    'multiple distinct foods into one aggregated line, even if the user describes them as a single dish or ' +
    'meal. For example, "shawarma with pasta and peas" must become 3 separate items — shawarma, pasta, and ' +
    'peas — each with its own estimated quantity and macros, never one combined item. ' +
    'For each item, estimate its quantity in grams (field "quantity", unit "g") and its own calories, protein, ' +
    'carbs, fat, and sugar. If sugar is not determinable, use null (never 0 as a placeholder). Name each item in Hebrew. ' +
    `Then write one short Hebrew "insight" sentence per meal (not per item), based on that meal's items combined, ` +
    'for a vegetarian athlete pursuing hypertrophy: ' +
    `• A MAIN meal (בוקר/צהריים/ערב) with less than ${proteinFloorG} g of total protein is low in protein — write one ` +
    'short, gentle Hebrew sentence suggesting a concrete addition or swap for next time — e.g. swapping oat milk ' +
    'for soy milk, adding a fraction of a tofu block, Greek yogurt, eggs, or seitan. Never judgmental or guilt-inducing. ' +
    `• A main meal with ${proteinFloorG} g of protein or more — write one short, warm Hebrew encouragement, e.g. ` +
    '"פצצת התאוששות! מנת חלבון מעולה לארוחה." ' +
    `• A snack (${SNACK_MEAL_NAME}) is EXEMPT from the protein check — either a light neutral/positive remark or an empty string. ` +
    'Return a JSON object with a single top-level \'meals\' array formatted EXACTLY like this: ' +
    `{ "meals": [ { "mealName": "בוקר/צהריים/ערב/${SNACK_MEAL_NAME}", "items": [ { "name": "Hebrew food item name", ` +
    '"quantity": number, "unit": "g", "calories": number, "protein": number, "carbs": number, "fat": number, ' +
    '"sugar": number or null } ], "insight": "one Hebrew sentence per the rule above" } ] }.'
  )
}

interface VoiceMeal {
  mealName: string
  items:    ValidFoodItem[]
  insight?: string
}

function isSnackMeal(mealName: string): boolean {
  return mealName.includes(SNACK_MEAL_NAME) || mealName.includes("חטיף")
}

// Deterministic backup when the model omits a meal's insight.
function fallbackInsight(meal: VoiceMeal, floorG: number): string | undefined {
  if (isSnackMeal(meal.mealName)) return undefined
  const protein = meal.items.reduce((s, it) => s + it.protein, 0)
  return protein < floorG
    ? "כדאי להוסיף לארוחה הזו מקור חלבון — טופו, יוגורט יווני, ביצים או קטניות — בפעם הבאה."
    : "מנת חלבון טובה לארוחה הזו — כל הכבוד!"
}

function validateMeals(raw: unknown, floorG: number): VoiceMeal[] {
  if (!Array.isArray(raw)) throw new ValidationError("meals: expected an array")
  if (raw.length > MAX_MEALS) throw new ValidationError(`meals: more than ${MAX_MEALS}`)
  return raw
    .map((m, i): VoiceMeal => {
      if (!m || typeof m !== "object") throw new ValidationError(`meals[${i}]: not an object`)
      const r = m as Record<string, unknown>
      const mealName = typeof r.mealName === "string" && r.mealName.trim()
        ? r.mealName.trim().slice(0, 40)
        : SNACK_MEAL_NAME
      const items = validateAiItems(r.items ?? []).map(roundFoodItem)
      const meal: VoiceMeal = { mealName, items }
      meal.insight = typeof r.insight === "string" && r.insight.trim()
        ? r.insight.trim().slice(0, 300)
        : fallbackInsight(meal, floorG)
      return meal
    })
    .filter((m) => m.items.length > 0)
}

export async function POST(request: NextRequest) {
  try {
    let body: { audioBase64?: unknown; mimeType?: unknown }
    try {
      body = await readJsonBody(request, AUDIO_BODY_MAX_BYTES)
    } catch (err) {
      const res = requestErrorResponse(err)
      if (res) return res
      throw err
    }
    const { audioBase64, mimeType } = body

    if (typeof audioBase64 !== "string" || !audioBase64 || typeof mimeType !== "string" || !mimeType) {
      return NextResponse.json({ error: "נדרש קובץ שמע לניתוח" }, { status: 400 })
    }

    // ── Security guards ───────────────────────────────────────────────────────
    if (!/^audio\/[a-z0-9.+-]+$/i.test(mimeType)) {
      return NextResponse.json(
        { error: "סוג קובץ לא נתמך — נדרש קובץ שמע (audio/*)" },
        { status: 400 },
      )
    }

    // base64 string length × 0.75 ≈ binary byte size; enforce 10 MB limit
    if (audioBase64.length * 0.75 > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "קובץ השמע גדול מדי — גודל מקסימלי 10MB" },
        { status: 413 },
      )
    }

    const limited = checkAiRateLimit()
    if (limited) return limited

    const [settings, weightKg] = await Promise.all([
      db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } }),
      getTrendWeight(DEMO_USER_ID).catch(() => null),
    ])
    const apiKey = resolveGeminiKey(settings?.aiProvider ?? null, settings?.aiApiKey ?? null)

    if (!apiKey) {
      return NextResponse.json(
        { error: "מפתח Gemini API אינו מוגדר — הגדר GEMINI_API_KEY ב-.env.local" },
        { status: 500 },
      )
    }

    const proteinFloorG = lowProteinMealThresholdG(weightKg)

    const rawText = await callGemini(
      apiKey,
      [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: buildVoicePrompt(proteinFloorG) },
        ],
      }],
      { generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" } },
    )

    let parsed: { meals?: unknown }
    try {
      parsed = sanitizeAndParseJson(rawText)
    } catch {
      return NextResponse.json(
        { error: "המודל החזיר תשובה לא תקינה — נסה להקליט שוב" },
        { status: 422 },
      )
    }

    let meals: VoiceMeal[]
    try {
      meals = validateMeals(parsed.meals, proteinFloorG)
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err
      console.error(`[POST /api/ai/analyze-voice] invalid model output: ${err.message}`)
      return NextResponse.json(
        { error: "ה-AI החזיר ערכים תזונתיים לא סבירים — נסה להקליט שוב" },
        { status: 422 },
      )
    }

    if (meals.length === 0) {
      return NextResponse.json(
        { error: "לא זוהו ארוחות בהקלטה — נסה לדבר בבירור ונסה שוב" },
        { status: 422 },
      )
    }

    return NextResponse.json({ meals })
  } catch (err) {
    console.error("[POST /api/ai/analyze-voice]", err instanceof Error ? err.message : "unknown error")
    if (err instanceof AIUnavailableError) {
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 })
    }
    return NextResponse.json({ error: "שגיאה בניתוח ההקלטה — נסה שוב" }, { status: 500 })
  }
}
