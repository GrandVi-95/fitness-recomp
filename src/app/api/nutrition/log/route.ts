import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

interface ParsedFoodItem {
  name: string
  matchedFoodId: string | null
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
}

// ── Hebrew NLP prompt (shared across providers) ─────────────────────────────
const SYSTEM_PROMPT = `אתה עוזר לתיעוד תזונה באפליקציית כושר צמחונית.
תפקידך: לחלץ פריטי מזון מטקסט בעברית ולהתאים אותם למסד נתוני המזון הנתון.

כללים:
1. זהה כל מרכיב מזון שהמשתמש ציין, כולל כמויות.
2. נסה להתאים כל פריט לרשומה קיימת במסד הנתונים לפי שם או כינוי (aliases).
3. אם הכמות לא צוינה, השתמש בגודל מנה סביר (לדוגמה: 100 גרם לטופו, 200 גרם ליוגורט).
4. חשב מאקרו על בסיס הכמות שצוינה: (כמות / 100) × ערכי per100g.
5. אם מזון לא נמצא במסד הנתונים, כלול אותו עם הערכה מציאותית ו-matchedFoodId כ-null.
6. שם המזון בתשובה יכול להיות בעברית.

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף לפני או אחרי):
{
  "items": [
    {
      "name": "שם המזון",
      "matchedFoodId": "food-id-or-null",
      "quantity": 200,
      "unit": "g",
      "calories": 160,
      "protein": 18,
      "carbs": 4,
      "fat": 9,
      "fiber": 2
    }
  ]
}`

function buildUserMessage(text: string, foodList: object[]): string {
  return `טקסט המשתמש: "${text}"

מסד נתוני המזון הזמין:
${JSON.stringify(foodList, null, 2)}`
}

// ── Robust JSON extraction ────────────────────────────────────────────────────
// Handles plain JSON, markdown code fences (```json ... ```), and embedded JSON.
function extractJsonText(raw: string): string {
  // Strip markdown code fences
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim()

  // If the stripped text starts with { it's likely clean JSON
  if (stripped.startsWith("{")) return stripped

  // Fallback: find the first {...} block (greedy match of the whole object)
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) return match[0]

  throw new Error("No JSON object found in AI response")
}

// ── Provider dispatch ────────────────────────────────────────────────────────

async function callAnthropic(
  userMessage: string,
  apiKey?: string | null
): Promise<string> {
  // Prefer explicit key from settings, fall back to env var
  const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY
  if (!resolvedKey) {
    throw new Error(
      "API_KEY_MISSING: מפתח Anthropic API לא מוגדר — " +
      "הוסף אותו בדף ההגדרות או הגדר ANTHROPIC_API_KEY בקובץ .env.local"
    )
  }

  const client = new Anthropic({ apiKey: resolvedKey })
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })
    const content = message.content[0]
    if (content.type !== "text") throw new Error("Unexpected response type from Claude")
    return content.text
  } catch (err: unknown) {
    // Re-throw with a friendlier message for auth errors
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("401") || message.includes("auth") || message.includes("API key")) {
      throw new Error("API_KEY_INVALID: מפתח Anthropic API לא תקין — בדוק את המפתח בדף ההגדרות")
    }
    throw err
  }
}

async function callOpenAI(
  userMessage: string,
  apiKey: string
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1024,
    }),
  })
  if (res.status === 401) {
    throw new Error("API_KEY_INVALID: מפתח OpenAI לא תקין — בדוק את המפתח בדף ההגדרות")
  }
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`)
  const data = await res.json()
  return data.choices[0]?.message?.content ?? ""
}

async function callGemini(
  userMessage: string,
  apiKey: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  })
  if (res.status === 400 || res.status === 403) {
    throw new Error("API_KEY_INVALID: מפתח Gemini לא תקין — בדוק את המפתח בדף ההגדרות")
  }
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
}

/** POST /api/nutrition/log
 * Body: { text: string, mealType?: string }
 */
export async function POST(request: Request) {
  try {
    const { text, mealType = "snack" } = await request.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: "נדרש תיאור מזון" }, { status: 400 })
    }

    // ── Load AI settings ──────────────────────────────────────────────────
    const settings = await db.userSettings.findUnique({
      where: { userId: DEMO_USER_ID },
    })
    const provider = settings?.aiProvider ?? "anthropic"
    const apiKey   = settings?.aiApiKey ?? null

    // ── Validate key for non-Anthropic providers (they have no env fallback) ──
    if ((provider === "openai" || provider === "gemini") && !apiKey) {
      return NextResponse.json(
        {
          error: `מפתח ${provider === "openai" ? "OpenAI" : "Gemini"} API לא מוגדר — הגדר אותו בדף ההגדרות`,
        },
        { status: 400 }
      )
    }

    // ── Load food DB ──────────────────────────────────────────────────────
    const foods = await db.food.findMany({
      select: {
        id: true,
        name: true,
        aliases: true,
        caloriesPer100: true,
        proteinPer100: true,
        carbsPer100: true,
        fatPer100: true,
        fiberPer100: true,
      },
    })

    const foodList = foods.map((f) => {
      let aliases: string[] = []
      try { aliases = JSON.parse(f.aliases) } catch {}
      return {
        id: f.id,
        name: f.name,
        aliases,
        per100g: {
          calories: f.caloriesPer100,
          protein: f.proteinPer100,
          carbs: f.carbsPer100,
          fat: f.fatPer100,
          fiber: f.fiberPer100,
        },
      }
    })

    const userMessage = buildUserMessage(text, foodList)

    // ── Dispatch to provider ──────────────────────────────────────────────
    let rawText: string
    try {
      if (provider === "openai") {
        rawText = await callOpenAI(userMessage, apiKey!)
      } else if (provider === "gemini") {
        rawText = await callGemini(userMessage, apiKey!)
      } else {
        rawText = await callAnthropic(userMessage, apiKey)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Surface API key errors directly to the UI
      if (msg.startsWith("API_KEY_")) {
        const display = msg.replace(/^API_KEY_[A-Z_]+:\s*/, "")
        return NextResponse.json({ error: display }, { status: 400 })
      }
      throw err // let outer catch handle unexpected errors
    }

    // ── Parse JSON from response ──────────────────────────────────────────
    let parsed: { items: ParsedFoodItem[] }
    try {
      const jsonText = extractJsonText(rawText)
      parsed = JSON.parse(jsonText)
    } catch {
      console.error("[nutrition/log] Failed to parse AI response:", rawText)
      return NextResponse.json(
        { error: "AI לא החזיר JSON תקין — נסה לנסח מחדש" },
        { status: 422 }
      )
    }

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return NextResponse.json(
        { error: "לא זוהו פריטי מזון בטקסט — נסה לפרט יותר" },
        { status: 422 }
      )
    }

    // ── Save to DB ────────────────────────────────────────────────────────
    const log = await db.nutritionLog.create({
      data: {
        userId: DEMO_USER_ID,
        mealType,
        rawInput: text,
        date: new Date(),
        foodItems: {
          create: parsed.items.map((item) => ({
            foodId: item.matchedFoodId ?? undefined,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            calories: Math.round(item.calories * 10) / 10,
            protein: Math.round(item.protein * 10) / 10,
            carbs: Math.round(item.carbs * 10) / 10,
            fat: Math.round(item.fat * 10) / 10,
            fiber: Math.round((item.fiber ?? 0) * 10) / 10,
          })),
        },
      },
      include: { foodItems: true },
    })

    const totals = log.foodItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
        carbs: acc.carbs + item.carbs,
        fat: acc.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    return NextResponse.json({
      logId: log.id,
      mealType: log.mealType,
      items: log.foodItems,
      totals: {
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat * 10) / 10,
      },
    })
  } catch (err) {
    console.error("[POST /api/nutrition/log]", err)
    return NextResponse.json({ error: "שגיאה בעיבוד הבקשה" }, { status: 500 })
  }
}
