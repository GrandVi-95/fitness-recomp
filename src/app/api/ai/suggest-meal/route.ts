import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

const DIET_LABELS: Record<string, string> = {
  vegetarian:  "צמחוני",
  vegan:       "טבעוני",
  pescatarian: "פסקטריאני",
  omnivore:    "כל-אוכל",
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "ארוחת בוקר",
  lunch:     "ארוחת צהריים",
  dinner:    "ארוחת ערב",
  snack:     "חטיף/ביניים",
}

const FLAVOR_LABELS: Record<string, string> = {
  savory:   "מלוח",
  sweet:    "מתוק",
  surprise: "כל פרופיל טעם (הפתעה)",
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai:    "OpenAI",
  gemini:    "Gemini",
}

// Remaining macros above these thresholds are split across two meals instead of one.
const SPLIT_CAL     = 800
const SPLIT_PROTEIN = 60

// ── Key resolution: user-saved key first, then env var for chosen provider ───
//
// Returns null only when NEITHER a user-saved key NOR the correct env var
// exists for the provider the user actually chose. Does NOT fall back to a
// different provider — the user's explicit selection is always respected.
function resolveApiKey(provider: string, userApiKey: string | null): string | null {
  if (userApiKey) return userApiKey
  switch (provider) {
    case "anthropic": return process.env.ANTHROPIC_API_KEY ?? null
    case "openai":    return process.env.OPENAI_API_KEY ?? null
    case "gemini":    return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
    default:          return null
  }
}

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a sports nutritionist API endpoint. " +
  "CRITICAL: Respond with valid JSON ONLY. " +
  "Do NOT include markdown, code fences (```json), greetings, preamble, or any text outside the JSON object. " +
  "Your entire response MUST start with { and end with }."

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(
  remaining: { calories: number; protein: number; carbs: number; fats: number },
  dietLabel: string,
  ingredients: string,
  mealType: string,
  flavorProfile: string,
): string {
  const mealTypeLabel  = MEAL_TYPE_LABELS[mealType]   ?? "ארוחה כלשהי"
  const flavorLabel    = FLAVOR_LABELS[flavorProfile]  ?? "כל פרופיל טעם"

  const ingredientsPart = ingredients.trim()
    ? `\n- **מרכיבים זמינים בבית:** ${ingredients.trim()}`
    : ""

  const ingredientsInstruction = ingredients.trim()
    ? "השתמש במרכיבים המצוינים לעיל ככל האפשר."
    : "הצע מרכיבים מעשיים ונפוצים שקל להשיג."

  const needsSplit = remaining.calories > SPLIT_CAL || remaining.protein > SPLIT_PROTEIN

  const splitRule = needsSplit
    ? `\n\n**כלל חלוקת ארוחות (חובה):** הכמות הנותרת (${remaining.calories} קק"ל / ${remaining.protein} גר' חלבון) גדולה מדי לארוחה אחת סבירה. עליך לחלק את ההצעה בדיוק לשתי ארוחות נפרדות (לדוגמה: ארוחה עיקרית + חטיף לילה). השתמש בפורמט הכפול המפורט למטה.`
    : ""

  // Pre-compute hard ceilings to embed as explicit numbers in the prompt
  const maxProtein  = remaining.protein + 5
  const maxCalories = remaining.calories

  const jsonSchema = `{
  "meals": [
    {
      "name": "שם קצר בעברית",
      "ingredients": [
        { "quantity": "200 גר'", "name": "שם מרכיב" }
      ],
      "preparation": "הוראת הכנה קצרה בעברית",
      "macros": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0 }
    }
  ]
}`

  return `תפקידך: להציע ${needsSplit ? "שתי ארוחות" : "ארוחה אחת"} שמשלימות את יעדי המאקרו שנותרו להיום עבור ספורטאי עם תזונה ${dietLabel}ית.

יעדי מאקרו שנותרו:
- קלוריות: ${remaining.calories} קק"ל (תקרה מוחלטת: ≤ ${maxCalories})
- חלבון: ${remaining.protein} גר' (תקרה מוחלטת: ≤ ${maxProtein} גר')
- פחמימות: ${remaining.carbs} גר'
- שומן: ${remaining.fats} גר'
- סוג ארוחה: ${mealTypeLabel}
- פרופיל טעם: ${flavorLabel}${ingredientsPart}${splitRule}

כללים מחייבים:
1. סך הקלוריות ≤ ${maxCalories}. אם יש קונפליקט, קצץ פחמימות — לא קלוריות.
2. סך החלבון ≤ ${maxProtein} גר'. אל תחרוג.
3. ${ingredientsInstruction}
4. הארוחה חייבת להיות ריאלית ומפתה — לא חומרי גלם לא מבושלים.
5. תבלינים/שמנים/ממרחים: עד 20 גר' לכל מרכיב. אבקת חלבון: עד סקופ אחד (~30 גר').
6. כל התוכן (שמות, הכנה) חייב להיות בעברית.
7. ${needsSplit ? "החזר 2 פריטים במערך meals." : "החזר פריט אחד במערך meals."}
8. אם המאקרו המבוקש בלתי-אפשרי מבחינה מתמטית עם המרכיבים הזמינים: קרב לקלוריות וחלבון ככל האפשר, ועצור. אסור בהחלט להוסיף מרכיבים לולאה אינסופית — בחר את ההתאמה הטובה ביותר האפשרית וסגור את ה-JSON מיידית.

החזר JSON בדיוק לפי הסכמה הבאה (ללא שדות נוספים, ללא טקסט מחוץ ל-JSON):
${jsonSchema}`
}

// ── Provider dispatch ────────────────────────────────────────────────────────

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  })
  const content = message.content[0]
  if (content.type !== "text") throw new Error("Unexpected response type from Anthropic")
  return content.text.trim()
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  })
  if (res.status === 401) throw new Error("OpenAI API key is invalid")
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const data = await res.json()
  return (data.choices[0]?.message?.content ?? "").trim()
}

const GEMINI_MODELS = [
  "gemini-3.1-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
]

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  let lastError = ""
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }
    console.log("[GEMINI EXACT PAYLOAD]:", JSON.stringify(payload, null, 2))
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      console.log("[Gemini] Successfully used model:", model)
      const data = await res.json()
      console.log("[Gemini] Finish reason:", data?.candidates?.[0]?.finishReason)
      return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
    }
    const errorBody = await res.text().catch(() => "(unreadable)")
    console.error(`[callGemini suggest-meal] HTTP ${res.status}:`, errorBody)
    if (res.status === 401 || res.status === 403) {
      throw new Error("Gemini API key is invalid or does not have access")
    }
    console.warn(`[Gemini] Model failed, trying next: ${model} (${res.status})`)
    lastError = `${res.status}: ${errorBody}`
  }
  throw new Error(`Gemini: all models failed. Last error — ${lastError}`)
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ingredients   = (body.ingredients   ?? "") as string
    const mealType      = (body.mealType      ?? "dinner") as string
    const flavorProfile = (body.flavorProfile ?? "savory") as string
    const remaining = body.remaining as {
      calories: number
      protein: number
      carbs: number
      fats: number
    }

    const settings = await db.userSettings.findUnique({
      where: { userId: DEMO_USER_ID },
    })

    const provider  = settings?.aiProvider ?? "anthropic"
    const apiKey    = resolveApiKey(provider, settings?.aiApiKey ?? null)

    if (!apiKey) {
      const name = PROVIDER_NAMES[provider] ?? provider
      return NextResponse.json(
        {
          error: `מפתח ${name} API אינו מוגדר בשרת — הגדר ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY ב-.env.local, או הזן מפתח אישי בהגדרות`,
        },
        { status: 500 },
      )
    }

    const dietaryPreference = settings?.dietaryPreference ?? "vegetarian"
    const dietLabel = DIET_LABELS[dietaryPreference] ?? "צמחוני"
    const prompt    = buildPrompt(remaining, dietLabel, ingredients, mealType, flavorProfile)

    let suggestion: string
    if (provider === "openai") {
      suggestion = await callOpenAI(prompt, apiKey)
    } else if (provider === "gemini") {
      suggestion = await callGemini(prompt, apiKey)
    } else {
      suggestion = await callAnthropic(prompt, apiKey)
    }

    return NextResponse.json({ suggestion })
  } catch (err) {
    console.error("[POST /api/ai/suggest-meal]", err)
    return NextResponse.json({ error: "שגיאה בהצעת הארוחה — נסה שוב" }, { status: 500 })
  }
}
