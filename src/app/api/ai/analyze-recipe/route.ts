import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  callGemini,
  checkAiRateLimit,
  requestErrorResponse,
  resolveGeminiKey,
  sanitizeAndParseJson,
  MAX_FOOD_TEXT_CHARS,
  TEXT_BODY_MAX_BYTES,
} from "@/lib/ai"
import { num, readJsonBody, ValidationError } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

const RECIPE_PROMPT =
  "You are a precise nutrition calculator. The user will describe the ingredients of an ENTIRE RECIPE BATCH. " +
  "Your job is to calculate the TOTAL cumulative macronutrients for the whole batch — NOT per serving. " +
  "Sum up every ingredient listed. " +
  "Return ONLY a raw JSON object — no markdown fences, no explanatory text before or after. " +
  "The object must contain EXACTLY these 5 fields and nothing else: " +
  '{ "totalCalories": number, "totalProtein": number, "totalCarbs": number, "totalFat": number, "totalSugar": number }. ' +
  "All values must be plain numbers (no units, no quotes). " +
  "CRITICAL: The JSON must be strictly valid RFC 8259. " +
  "Do NOT include any additional fields. " +
  "Do NOT use literal newlines, carriage returns, or unescaped double quotes inside any value."

interface RecipeTotals {
  totalCalories: number
  totalProtein:  number
  totalCarbs:    number
  totalFat:      number
  totalSugar:    number
}

/**
 * Whole-batch totals from the model. Every field is required — a missing
 * macro is rejected, never silently turned into 0. Energy is cross-checked
 * against the macros (Atwater 4/4/9, ±35% with slack for fibre/rounding).
 */
function validateRecipeTotals(raw: unknown): RecipeTotals {
  if (!raw || typeof raw !== "object") throw new ValidationError("recipe: not an object")
  const r = raw as Record<string, unknown>
  const totalCalories = num(r.totalCalories, "totalCalories", 0, 50000)
  const totalProtein  = num(r.totalProtein,  "totalProtein",  0, 4000)
  const totalCarbs    = num(r.totalCarbs,    "totalCarbs",    0, 8000)
  const totalFat      = num(r.totalFat,      "totalFat",      0, 4000)
  const totalSugar    = num(r.totalSugar,    "totalSugar",    0, 8000)
  if (totalCalories === 0) throw new ValidationError("totalCalories: zero")
  if (totalSugar > totalCarbs + 1) throw new ValidationError("totalSugar: exceeds totalCarbs")
  const atwater = totalProtein * 4 + totalCarbs * 4 + totalFat * 9
  if (Math.abs(atwater - totalCalories) > Math.max(60, totalCalories * 0.35)) {
    throw new ValidationError(`totalCalories: ${totalCalories} kcal doesn't match macros (~${Math.round(atwater)} kcal)`)
  }
  return { totalCalories, totalProtein, totalCarbs, totalFat, totalSugar }
}

export async function POST(request: NextRequest) {
  try {
    let ingredientsText: unknown
    try {
      ({ ingredientsText } = await readJsonBody<{ ingredientsText?: unknown }>(request, TEXT_BODY_MAX_BYTES))
    } catch (err) {
      const res = requestErrorResponse(err)
      if (res) return res
      throw err
    }

    if (typeof ingredientsText !== "string" || !ingredientsText.trim()) {
      return NextResponse.json({ error: "נדרש תיאור רכיבים" }, { status: 400 })
    }
    if (ingredientsText.length > MAX_FOOD_TEXT_CHARS) {
      return NextResponse.json(
        { error: `תיאור הרכיבים ארוך מדי — עד ${MAX_FOOD_TEXT_CHARS} תווים` },
        { status: 400 },
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
      parts: [{ text: `${RECIPE_PROMPT}\n\nרכיבי המתכון:\n${ingredientsText}` }],
    }], {
      generationConfig: {
        temperature:      0.1,
        maxOutputTokens:  2048,
        responseMimeType: "application/json",
      },
    })

    let result: RecipeTotals
    try {
      result = validateRecipeTotals(sanitizeAndParseJson(rawText))
    } catch (err) {
      console.error(
        "[POST /api/ai/analyze-recipe] invalid model output:",
        err instanceof ValidationError ? err.message : err instanceof Error ? err.name : "unknown error",
      )
      return NextResponse.json(
        { error: "המודל החזיר ערכים לא תקינים — נסה לנסח את הרכיבים מחדש" },
        { status: 422 },
      )
    }

    return NextResponse.json({
      totalCalories: Math.round(result.totalCalories),
      totalProtein:  Math.round(result.totalProtein * 10) / 10,
      totalCarbs:    Math.round(result.totalCarbs),
      totalFat:      Math.round(result.totalFat     * 10) / 10,
      totalSugar:    Math.round(result.totalSugar   * 10) / 10,
    })
  } catch (err) {
    console.error("[POST /api/ai/analyze-recipe]", err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ error: "שגיאה בניתוח המתכון — נסה שוב" }, { status: 500 })
  }
}
