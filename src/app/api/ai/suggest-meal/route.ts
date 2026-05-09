import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

const DIET_LABELS: Record<string, string> = {
  vegetarian: "צמחוני",
  vegan:      "טבעוני",
  pescatarian:"פסקטריאני",
  omnivore:   "כל-אוכל",
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(
  remaining: { calories: number; protein: number; carbs: number; fats: number },
  dietLabel: string,
  ingredients: string,
): string {
  const ingredientsPart = ingredients.trim()
    ? `\n- **מרכיבים זמינים בבית:** ${ingredients.trim()}`
    : ""

  const ingredientsInstruction = ingredients.trim()
    ? "השתמש במרכיבים המצוינים לעיל ככל האפשר."
    : "הצע ארוחה מעשית עם מרכיבים נפוצים שקל להשיג."

  return `אתה תזונאי ספורט מנוסה המתמחה בספורטאים עם תזונה ${dietLabel}ית ויעדי רכב גוף.

תפקידך: להציע ארוחה אחת שמשלימה בצורה מדויקת את יעדי המאקרו שנותרו להיום.

**יעדי מאקרו שנותרו להיום:**
- קלוריות: ${remaining.calories} קק"ל
- חלבון: ${remaining.protein} גר'
- פחמימות: ${remaining.carbs} גר'
- שומן: ${remaining.fats} גר'
- העדפה תזונתית: ${dietLabel}${ingredientsPart}

**הנחיות:**
- ${ingredientsInstruction}
- **חובה: ענה בעברית בלבד.**
- ענה **בדיוק** בפורמט הבא, כולל הכותרות המודגשות:

**שם הארוחה:** [שם קצר]

**מרכיבים:**
- [כמות ויחידה] [שם מרכיב]
- [כמות ויחידה] [שם מרכיב]

**הכנה:** [משפט אחד]

**ערכים משוערים:** ~[קלוריות] קק"ל · [חלבון] גר' חלבון · [פחמימות] גר' פחמ' · [שומן] גר' שומן`
}

// ── Provider dispatch ────────────────────────────────────────────────────────

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
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
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const data = await res.json()
  return (data.choices[0]?.message?.content ?? "").trim()
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 512 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
}

// ── Key resolution: user-saved key first, then env-var fallback ──────────────

type ProviderKey = { provider: "anthropic" | "openai" | "gemini"; apiKey: string }

function resolveProvider(
  userProvider: string,
  userApiKey: string | null,
): ProviderKey | null {
  // 1. User-configured key takes highest priority
  if (userApiKey) {
    const p = userProvider as ProviderKey["provider"]
    return { provider: p, apiKey: userApiKey }
  }

  // 2. Environment variable fallback — first match wins
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY }
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY }
  }
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (geminiKey) {
    return { provider: "gemini", apiKey: geminiKey }
  }

  return null
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ingredients = (body.ingredients ?? "") as string
    const remaining = body.remaining as {
      calories: number
      protein: number
      carbs: number
      fats: number
    }

    const settings = await db.userSettings.findUnique({
      where: { userId: DEMO_USER_ID },
    })

    const dietaryPreference = settings?.dietaryPreference ?? "vegetarian"
    const dietLabel = DIET_LABELS[dietaryPreference] ?? "צמחוני"
    const prompt = buildPrompt(remaining, dietLabel, ingredients)

    const resolved = resolveProvider(
      settings?.aiProvider ?? "anthropic",
      settings?.aiApiKey ?? null,
    )

    if (!resolved) {
      return NextResponse.json(
        {
          error:
            "לא נמצא מפתח AI — הוסף ANTHROPIC_API_KEY, OPENAI_API_KEY, או GEMINI_API_KEY למשתני הסביבה, או הגדר מפתח בדף ההגדרות.",
        },
        { status: 500 },
      )
    }

    let suggestion: string
    if (resolved.provider === "openai") {
      suggestion = await callOpenAI(prompt, resolved.apiKey)
    } else if (resolved.provider === "gemini") {
      suggestion = await callGemini(prompt, resolved.apiKey)
    } else {
      suggestion = await callAnthropic(prompt, resolved.apiKey)
    }

    return NextResponse.json({ suggestion })
  } catch (err) {
    console.error("[POST /api/ai/suggest-meal]", err)
    return NextResponse.json({ error: "שגיאה בהצעת הארוחה — נסה שוב" }, { status: 500 })
  }
}
