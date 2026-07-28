import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { callGemini as callGeminiShared } from "@/lib/ai"

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
  sugar?: number
  saturatedFat?: number
}

// 1 g protein = 4 kcal. A meal spending under ~10% of its calories on protein
// is "expensive" for a vegetarian hypertrophy diet — everything above reads as
// reasonably protein-dense. This must stay in sync with the ratio described in
// SYSTEM_PROMPT below.
const LOW_PROTEIN_RATIO_THRESHOLD = 0.10

// Deterministic backup for the rare case an LLM omits the optional `insight`
// field despite the instruction — keeps the nudge feature from silently
// disappearing on a flaky response.
function computeFallbackInsight(items: ParsedFoodItem[]): string {
  const totals = items.reduce(
    (acc, i) => ({ calories: acc.calories + i.calories, protein: acc.protein + i.protein }),
    { calories: 0, protein: 0 },
  )
  if (totals.calories <= 0) return ""
  const ratio = (totals.protein * 4) / totals.calories
  return ratio < LOW_PROTEIN_RATIO_THRESHOLD
    ? "ארוחה זו יחסית דלה בחלבון לכמות הקלוריות שלה — כדאי לשקול להוסיף טופו, סייטן או קטניות בפעם הבאה."
    : "יחס חלבון-קלוריות טוב לארוחה הזו — כל הכבוד!"
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
7. חשב גם sugar (סוכר, תת-קבוצה של פחמימות) ו-saturatedFat (שומן רווי, תת-קבוצה של שומן) לפי per100g אם קיים, אחרת הערך מציאותי.

8. נדנוד AI (insight) — אחרי שחילצת את כל הפריטים, חשב את סך הקלוריות וסך החלבון של הארוחה
   כולה, וגזור יחס חלבון-קלוריות: (סך חלבון × 4) / סך קלוריות.
   - אם היחס נמוך מ-0.10 (הארוחה "יקרה" בקלוריות/פחמימות/שומן אך דלה בחלבון עבור ספורטאי
     צמחוני בעל מטרת היפרטרופיה): כתוב טיפ עדין וקצר (משפט אחד בעברית) איך לשפר את הארוחה
     בפעם הבאה — למשל להחליף חלב שיבולת שועל בחלב סויה, להוסיף חלק מקוביית טופו, או
     להשתמש בסייטן. אל תשתמש בטון שיפוטי או מטיל אשמה — הכוונה חיובית בלבד, לא ציון.
   - אם היחס גבוה (הארוחה עשירה בחלבון יחסית לקלוריות): כתוב משפט עידוד קצר וחם, למשל
     "פצצת התאוששות! יחס חלבון-קלוריות מעולה."
   - המשפט חייב להיות קצר (עד כ-20 מילים), חיובי או עדין, ולעולם לא ביקורתי או מטיל אשמה.

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
      "fiber": 2,
      "sugar": 1,
      "saturatedFat": 3
    }
  ],
  "insight": "משפט אחד בעברית לפי כלל 8 לעיל"
}`

function buildUserMessage(text: string, foodList: object[]): string {
  return `טקסט המשתמש: "${text}"

מסד נתוני המזון הזמין:
${JSON.stringify(foodList, null, 2)}`
}

// ── Robust JSON extraction ────────────────────────────────────────────────────
// Strips ALL markdown code fences (global replace handles mid-string wrapping
// from Gemini and other providers), then falls back to a {...} block scan.
function extractJsonText(raw: string): string {
  const stripped = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim()

  if (stripped.startsWith("{")) return stripped

  const match = stripped.match(/\{[\s\S]*\}/)
  if (match) return match[0]

  throw new Error("No JSON object found in AI response")
}

// ── Key resolution: user-saved key first, then env var for chosen provider ───
//
// Returns null only when NEITHER a user-saved key NOR the correct env var
// exists for the provider the user actually chose. This intentionally does NOT
// fall back to a different provider — respecting the user's explicit selection.
function resolveApiKey(provider: string, userApiKey: string | null): string | null {
  if (userApiKey) return userApiKey
  switch (provider) {
    case "anthropic": return process.env.ANTHROPIC_API_KEY ?? null
    case "openai":    return process.env.OPENAI_API_KEY ?? null
    case "gemini":    return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
    default:          return null
  }
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai:    "OpenAI",
  gemini:    "Gemini",
}

// ── Provider dispatch ────────────────────────────────────────────────────────

async function callAnthropic(userMessage: string, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })
    const content = message.content[0]
    if (content.type !== "text") throw new Error("Unexpected response type from Claude")
    return content.text
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("401") || msg.includes("auth") || msg.includes("API key")) {
      throw new Error("API_KEY_INVALID: מפתח Anthropic API לא תקין — בדוק את המפתח בדף ההגדרות")
    }
    throw err
  }
}

async function callOpenAI(userMessage: string, apiKey: string): Promise<string> {
  const MAX_ATTEMPTS = 3
  const RETRY_DELAY_MS = 1500
  let lastStatus = 0
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
        max_tokens: 8192,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.choices[0]?.message?.content ?? ""
    }
    if (res.status === 401) {
      throw new Error("API_KEY_INVALID: מפתח OpenAI לא תקין — בדוק את המפתח בדף ההגדרות")
    }
    lastStatus = res.status
    if ((res.status === 429 || res.status === 503) && attempt < MAX_ATTEMPTS) {
      console.warn(`[callOpenAI] attempt ${attempt} → ${res.status}, retrying in ${RETRY_DELAY_MS}ms`)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      continue
    }
    break
  }
  throw new Error(`OpenAI error: ${lastStatus}`)
}

// Delegates to the shared utility (header auth, 503/429 retry-backoff, model
// fallback) and translates its auth error into this route's API_KEY_ protocol.
async function callGemini(userMessage: string, apiKey: string): Promise<string> {
  try {
    return await callGeminiShared(
      apiKey,
      [{ role: "user", parts: [{ text: userMessage }] }],
      {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json" },
      },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("invalid or does not have access")) {
      throw new Error("API_KEY_INVALID: מפתח Gemini לא תקין — בדוק את המפתח בדף ההגדרות")
    }
    throw err
  }
}

/** POST /api/nutrition/log
 * Body: { text: string, mealType?: string }
 */
export async function POST(request: Request) {
  try {
    const { text, mealType = "snack", directItems, insight: rawInsight } = await request.json()

    // Direct log path — skip AI re-analysis and write pre-computed values from the editable review card
    if (Array.isArray(directItems) && directItems.length > 0) {
      // The only source for a real insight here is an upstream AI call the client
      // already made (e.g. the voice-meal analyzer) — quick-logs (coffee, label
      // scanner) simply omit it, so this stays undefined/null for those.
      const directInsight = typeof rawInsight === "string" && rawInsight.trim()
        ? rawInsight.trim().slice(0, 300)
        : null
      // Clamp to finite, non-negative, plausible values — a client bug sending
      // NaN/Infinity/negatives would otherwise silently corrupt daily totals.
      const clampMacro = (v: unknown, max: number): number => {
        const n = typeof v === "number" && Number.isFinite(v) ? v : 0
        return Math.round(Math.min(Math.max(n, 0), max) * 10) / 10
      }
      const sanitized = directItems
        .map((item: Record<string, unknown>) => ({
          name:     typeof item.name === "string" ? item.name.trim().slice(0, 200) : "",
          quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0
            ? Math.min(item.quantity, 10000)
            : 1,
          unit:     typeof item.unit === "string" && item.unit.trim()
            ? item.unit.trim().slice(0, 20)
            : "serving",
          calories: clampMacro(item.calories, 5000),
          protein:  clampMacro(item.protein,  500),
          carbs:    clampMacro(item.carbs,    1000),
          fat:      clampMacro(item.fat,      500),
          sugar:    clampMacro(item.sugar,    500),
        }))
        .filter((item) => item.name.length > 0)
      if (sanitized.length === 0) {
        return NextResponse.json({ error: "פריטים לא תקינים — חסר שם מזון" }, { status: 400 })
      }
      const log = await db.nutritionLog.create({
        data: {
          userId:   DEMO_USER_ID,
          mealType,
          rawInput: sanitized.map((it) => it.name).join(", "),
          date:     new Date(),
          insight:  directInsight,
          foodItems: {
            create: sanitized.map((item) => ({
              name:         item.name,
              quantity:     item.quantity,
              unit:         item.unit,
              calories:     item.calories,
              protein:      item.protein,
              carbs:        item.carbs,
              fat:          item.fat,
              fiber:        0,
              sugar:        item.sugar,
              saturatedFat: 0,
            })),
          },
        },
        include: { foodItems: true },
      })
      revalidatePath("/dashboard")
      revalidatePath("/recovery")
      const totals = log.foodItems.reduce(
        (acc, item) => ({
          calories: acc.calories + item.calories,
          protein:  acc.protein  + item.protein,
          carbs:    acc.carbs    + item.carbs,
          fat:      acc.fat      + item.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      )
      return NextResponse.json({
        logId:    log.id,
        mealType: log.mealType,
        items:    log.foodItems,
        insight:  log.insight ?? undefined,
        totals: {
          calories: Math.round(totals.calories),
          protein:  Math.round(totals.protein  * 10) / 10,
          carbs:    Math.round(totals.carbs),
          fat:      Math.round(totals.fat       * 10) / 10,
        },
      })
    }

    if (!text?.trim()) {
      return NextResponse.json({ error: "נדרש תיאור מזון" }, { status: 400 })
    }

    // ── Load AI settings and resolve API key for chosen provider ─────────────
    const settings = await db.userSettings.findUnique({
      where: { userId: DEMO_USER_ID },
    })
    const provider   = settings?.aiProvider ?? "anthropic"
    const apiKey     = resolveApiKey(provider, settings?.aiApiKey ?? null)

    if (!apiKey) {
      const name = PROVIDER_NAMES[provider] ?? provider
      return NextResponse.json(
        { error: `מפתח ${name} API אינו מוגדר בשרת — הגדר ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY ב-.env.local, או הזן מפתח אישי בהגדרות` },
        { status: 500 },
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
        sugarPer100: true,
        saturatedFatPer100: true,
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
          sugar: f.sugarPer100,
          saturatedFat: f.saturatedFatPer100,
        },
      }
    })

    const userMessage = buildUserMessage(text, foodList)

    // ── Dispatch to chosen provider ───────────────────────────────────────
    let rawText: string
    try {
      if (provider === "openai") {
        rawText = await callOpenAI(userMessage, apiKey)
      } else if (provider === "gemini") {
        rawText = await callGemini(userMessage, apiKey)
      } else {
        rawText = await callAnthropic(userMessage, apiKey)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith("API_KEY_")) {
        const display = msg.replace(/^API_KEY_[A-Z_]+:\s*/, "")
        return NextResponse.json({ error: display }, { status: 400 })
      }
      throw err
    }

    // ── Parse JSON from response ──────────────────────────────────────────
    let parsed: { items: ParsedFoodItem[]; insight?: string }
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

    const insight = typeof parsed.insight === "string" && parsed.insight.trim()
      ? parsed.insight.trim().slice(0, 300)
      : computeFallbackInsight(parsed.items)

    // ── Save to DB ────────────────────────────────────────────────────────
    const log = await db.nutritionLog.create({
      data: {
        userId: DEMO_USER_ID,
        mealType,
        rawInput: text,
        date: new Date(),
        insight: insight || null,
        foodItems: {
          create: parsed.items.map((item) => ({
            foodId: item.matchedFoodId ?? undefined,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            calories:     Math.round(item.calories * 10) / 10,
            protein:      Math.round(item.protein * 10) / 10,
            carbs:        Math.round(item.carbs * 10) / 10,
            fat:          Math.round(item.fat * 10) / 10,
            fiber:        Math.round((item.fiber        ?? 0) * 10) / 10,
            sugar:        Math.round((item.sugar        ?? 0) * 10) / 10,
            saturatedFat: Math.round((item.saturatedFat ?? 0) * 10) / 10,
          })),
        },
      },
      include: { foodItems: true },
    })

    revalidatePath("/dashboard")
    revalidatePath("/recovery")

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
      insight: log.insight ?? undefined,
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
