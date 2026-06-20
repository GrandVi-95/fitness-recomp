import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini, sanitizeAndParseJson } from "@/lib/ai"

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

function resolveGeminiKey(aiProvider: string | null, userApiKey: string | null): string | null {
  if (aiProvider === "gemini" && userApiKey) return userApiKey
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
}

export async function POST(request: NextRequest) {
  try {
    const { ingredientsText } = (await request.json()) as { ingredientsText: string }

    if (!ingredientsText?.trim()) {
      return NextResponse.json({ error: "נדרש תיאור רכיבים" }, { status: 400 })
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
      parts: [{ text: `${RECIPE_PROMPT}\n\nרכיבי המתכון:\n${ingredientsText}` }],
    }], {
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    })

    let result: {
      totalCalories: number
      totalProtein:  number
      totalCarbs:    number
      totalFat:      number
      totalSugar:    number
    }

    try {
      result = sanitizeAndParseJson(rawText)
    } catch (parseErr) {
      console.error("[POST /api/ai/analyze-recipe] JSON parse failed:", parseErr)
      return NextResponse.json(
        { error: "המודל החזיר תשובה לא תקינה — נסה לנסח את הרכיבים מחדש" },
        { status: 422 },
      )
    }

    return NextResponse.json({
      totalCalories: Math.round(result.totalCalories  ?? 0),
      totalProtein:  Math.round((result.totalProtein  ?? 0) * 10) / 10,
      totalCarbs:    Math.round(result.totalCarbs     ?? 0),
      totalFat:      Math.round((result.totalFat      ?? 0) * 10) / 10,
      totalSugar:    Math.round((result.totalSugar    ?? 0) * 10) / 10,
    })
  } catch (err) {
    console.error("[POST /api/ai/analyze-recipe]", err)
    return NextResponse.json({ error: "שגיאה בניתוח המתכון — נסה שוב" }, { status: 500 })
  }
}
