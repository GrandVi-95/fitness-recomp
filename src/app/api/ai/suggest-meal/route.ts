import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import {
  callGemini,
  checkAiRateLimit,
  fetchWithTimeout,
  requestErrorResponse,
  resolveProviderKey,
  stripMarkdownFences,
  AI_REQUEST_TIMEOUT_MS,
  MAX_FOOD_TEXT_CHARS,
  TEXT_BODY_MAX_BYTES,
} from "@/lib/ai"
import { num, readJsonBody, ValidationError } from "@/lib/validate"

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

// A meal's protein may overshoot the remaining protein by at most this much.
const PROTEIN_OVERSHOOT_G = 20
// Calories are a planning target: aim within ±10% of what remains.
const CALORIE_TOLERANCE = 0.10

// Key resolution (user-saved key, decrypted, then the chosen provider's env
// var — never a different provider) lives in resolveProviderKey().

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a sports nutritionist API endpoint. Respond with a valid JSON object. No greetings, no text outside the JSON.\n\n" +
  "MACRO PLANNING RULES:\n" +
  "• Calories = a planning target, not a safety ceiling. Aim within ±10% of the remaining calories.\n" +
  `• Protein = aim for the remaining protein within a reasonable range. Get close to it, and never exceed it by more than ~${PROTEIN_OVERSHOOT_G} g — extra protein is not a goal in itself.\n` +
  "• Carbs / Fat = keep meaningful amounts, close to the remaining targets. Never strip them out just to make room for more protein.\n" +
  "• HONEST NUMBERS: the macros you report must be the real sum of the ingredients and quantities you list. Never adjust numbers to match the targets.\n\n" +
  "FEASIBILITY RULES — apply in this exact priority order:\n" +
  "1. INFEASIBLE TARGETS: If the remaining macros cannot be met together by a realistic meal (e.g. the remaining protein needs more calories than remain, or a near-zero macro makes a real meal impossible), do NOT fabricate. Suggest the closest realistic meal and explain the trade-off in one short, neutral Hebrew sentence in the top-level \"warning\" field.\n" +
  "2. TRANSPARENCY: Always include the top-level \"warning\" field (string). When the targets were met normally, set it to an empty string \"\".\n" +
  "3. FAIL-SAFE: If you still cannot find a solution, STOP immediately. Return the closest approximation you have computed so far and close the JSON object. Do NOT loop, do NOT add more ingredients trying to fix the math."

// ── Prompt ───────────────────────────────────────────────────────────────────

// A previously suggested meal, sent back when the user removes ingredients
// so the model can revise it instead of inventing a brand-new dish.
interface PreviousMeal {
  name: string
  ingredients: Array<{ quantity: string; name: string }>
}

function mealSchema(n: 1 | 2): string {
  return `"meal${n}_name":"...","meal${n}_ingredients":"150 גר' מרכיב א, 2 יח' מרכיב ב","meal${n}_prep_time":"15 דק'","meal${n}_steps":"שלב ראשון | שלב שני | שלב שלישי","meal${n}_macros":"calories:0,protein:0,carbs:0,fat:0,sugar:0"`
}

function buildPrompt(
  remaining: { calories: number; protein: number; carbs: number; fats: number },
  dietLabel: string,
  ingredients: string,
  mealType: string,
  flavorProfile: string,
  excluded: string[],
  previous: PreviousMeal[] | null,
): string {
  const mealTypeLabel  = MEAL_TYPE_LABELS[mealType]   ?? "ארוחה כלשהי"
  const flavorLabel    = FLAVOR_LABELS[flavorProfile]  ?? "כל פרופיל טעם"

  const ingredientsPart = ingredients.trim()
    ? `\n- **מרכיבים זמינים בבית:** ${ingredients.trim()}`
    : ""

  const ingredientsInstruction = ingredients.trim()
    ? "השתמש במרכיבים המצוינים לעיל ככל האפשר."
    : "הצע מרכיבים מעשיים ונפוצים שקל להשיג."

  const excludedPart = excluded.length
    ? `\n- **מרכיבים שאינם זמינים (אסור להשתמש בהם או בכל צורה שלהם):** ${excluded.join(", ")}`
    : ""

  // Revising keeps the meal count of the original suggestion so the UI
  // doesn't jump from one meal to two just because an ingredient was removed.
  const needsSplit = previous
    ? previous.length > 1
    : remaining.calories > SPLIT_CAL || remaining.protein > SPLIT_PROTEIN

  const splitRule = needsSplit
    ? `\n\n**כלל חלוקת ארוחות (חובה):** הכמות הנותרת (${remaining.calories} קק"ל / ${remaining.protein} גר' חלבון) גדולה מדי לארוחה אחת סבירה. עליך לחלק את ההצעה בדיוק לשתי ארוחות נפרדות (לדוגמה: ארוחה עיקרית + חטיף לילה). השתמש בפורמט הכפול המפורט למטה.`
    : ""

  const revisionPart = previous
    ? `\n\n**עדכון הצעה קיימת (חובה):** זו ההצעה הקודמת:\n${previous
        .map((m, i) => `ארוחה ${i + 1}: ${m.name} — ${m.ingredients.map((x) => `${x.quantity} ${x.name}`.trim()).join(", ")}`)
        .join("\n")}\nהסר ממנה את המרכיבים שאינם זמינים. שמור על אותה מנה ככל האפשר: הגדל כמויות של המרכיבים הקיימים או הוסף תחליף נפוץ אחד כדי לחזור ליעדי המאקרו, עדכן את שם המנה אם צריך, וכתוב מחדש את המתכון.`
    : ""

  const calLow  = Math.round(remaining.calories * (1 - CALORIE_TOLERANCE))
  const calHigh = Math.round(remaining.calories * (1 + CALORIE_TOLERANCE))
  const proteinMax = Math.round(remaining.protein + PROTEIN_OVERSHOOT_G)

  // Protein alone needs ~4 kcal/g; flag clearly-infeasible combos up front so
  // the model reports them in "warning" instead of inventing numbers.
  const infeasibleHint = remaining.protein * 4 > remaining.calories * 0.9
    ? `\n\n**שים לב:** ${remaining.protein} גר' חלבון דורשים לפחות ~${Math.round(remaining.protein * 4)} קק"ל — כמעט כל הקלוריות שנותרו (${remaining.calories}) או יותר. ייתכן שאין ארוחה ריאלית שעומדת בשניהם; אם כך, הצע את הקרובה ביותר והסבר בשדה warning.`
    : ""

  const jsonSchema = needsSplit
    ? `{${mealSchema(1)},${mealSchema(2)},"warning":""}`
    : `{${mealSchema(1)},"warning":""}`

  return `תפקידך: להציע ${needsSplit ? "שתי ארוחות" : "ארוחה אחת"} שמשלימות את יעדי המאקרו שנותרו להיום עבור ספורטאי עם תזונה ${dietLabel}ית.

יעדי מאקרו שנותרו:
- קלוריות: ${remaining.calories} קק"ל (יעד תכנון — כוון לטווח ${calLow}–${calHigh})
- חלבון: ${remaining.protein} גר' (כוון ליעד; לא יותר מ-${proteinMax} גר')
- פחמימות: ${remaining.carbs} גר'
- שומן: ${remaining.fats} גר'
- סוג ארוחה: ${mealTypeLabel}
- פרופיל טעם: ${flavorLabel}${ingredientsPart}${excludedPart}${splitRule}${revisionPart}${infeasibleHint}

כללים מחייבים:
1. קלוריות הן יעד תכנון ולא תקרת בטיחות: כוון לטווח ${calLow}–${calHigh} קק"ל.
2. חלבון: התקרב ל-${remaining.protein} גר' ואל תחרוג מ-${proteinMax} גר'. אין צורך "להעמיס" חלבון מעבר ליעד.
3. ${ingredientsInstruction}
4. הארוחה חייבת להיות ריאלית ומפתה — לא חומרי גלם לא מבושלים. שמור על כמות משמעותית של פחמימות ושומן, קרוב ליעדים שנותרו.
5. תבלינים/שמנים/ממרחים: עד 20 גר' לכל מרכיב. אבקת חלבון: עד סקופ אחד (~30 גר').
6. כל התוכן חייב להיות בעברית.
7. אם יעדי המאקרו אינם ניתנים להשגה יחד: אל תמציא מספרים — הצע את הארוחה הריאלית הקרובה ביותר, כתוב בשדה warning משפט קצר שמסביר מה לא ניתן היה להשיג, ועצור — אסור ללולאת מרכיבים.
8. כל מרכיב ב-ingredients חייב להתחיל בכמות מדויקת (גרם / יחידות / כפות), מופרד בפסיק.
9. מתכון מלא: ב-steps כתוב 3–8 שלבי הכנה ברורים ומעשיים (חיתוך, טמפרטורה, זמני בישול, הגשה), מופרדים בתו "|". ב-prep_time כתוב את זמן ההכנה הכולל.
10. ערכי ה-macros חייבים להיות הסכום האמיתי של המרכיבים והכמויות שרשמת.

החזר JSON בדיוק לפי הסכמה הבאה — ללא מפתחות נוספים, ללא מערכים, ללא קינון:
${jsonSchema}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FlatMeal {
  meal1_name?: string
  meal1_ingredients?: string
  meal1_prep_time?: string
  meal1_steps?: string
  meal1_macros?: string
  meal2_name?: string
  meal2_ingredients?: string
  meal2_prep_time?: string
  meal2_steps?: string
  meal2_macros?: string
  warning?: string
}

interface MealMacros {
  calories: number
  protein:  number
  carbs:    number
  fat:      number
  sugar:    number | null   // null = the model didn't say (unknown), not 0
}

/**
 * Parses "calories:520,protein:38,…" and validates it. Missing core macros
 * are rejected (never defaulted to 0); energy must match the macros
 * (Atwater 4/4/9, ±35% with a little slack).
 */
function parseMacroString(s: unknown, field: string): MealMacros {
  if (typeof s !== "string") throw new ValidationError(`${field}: missing`)
  const read = (key: string): number | null => {
    const m = s.match(new RegExp(key + "\\s*:?\\s*(\\d+(?:\\.\\d+)?)", "i"))
    return m ? parseFloat(m[1]) : null
  }
  const required = (key: string, max: number): number => {
    const v = read(key)
    if (v === null) throw new ValidationError(`${field}.${key}: missing`)
    return Math.round(num(v, `${field}.${key}`, 0, max))
  }
  const calories = required("calories", 5000)
  const protein  = required("protein",  400)
  const carbs    = required("carbs",    800)
  const fat      = required("fat",      400)
  const sugarRaw = read("sugar")
  const sugar    = sugarRaw === null ? null : Math.min(Math.round(num(sugarRaw, `${field}.sugar`, 0, 800)), carbs)
  if (calories === 0) throw new ValidationError(`${field}.calories: zero`)
  const atwater = protein * 4 + carbs * 4 + fat * 9
  if (Math.abs(atwater - calories) > Math.max(40, calories * 0.35)) {
    throw new ValidationError(`${field}.calories: ${calories} kcal doesn't match macros (~${Math.round(atwater)} kcal)`)
  }
  return { calories, protein, carbs, fat, sugar }
}

// "200 גר' טופו" → { quantity: "200 גר'", name: "טופו" }. Items without a
// leading number keep the whole text as the name.
function parseIngredientString(s: string = "") {
  return s.split(",").map((i) => i.trim()).filter(Boolean).map((item) => {
    const m = item.match(/^([\d.,/½¼¾-]+\s*\S+)\s+(.+)$/)
    return m ? { quantity: m[1], name: m[2] } : { quantity: "", name: item }
  })
}

function parseSteps(s: string = "") {
  return s.split("|").map((step) => step.trim()).filter(Boolean)
}

const optText = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "")

/** Validates the model's flat JSON and returns the nested shape the UI reads. */
function flatToNestedSuggestion(raw: unknown): string {
  if (!raw || typeof raw !== "object") throw new ValidationError("suggestion: not an object")
  const flat = raw as FlatMeal
  const meals = ([1, 2] as const)
    .filter((n) => optText(flat[`meal${n}_name`], 200) !== "")
    .map((n) => {
      const ingredients = parseIngredientString(optText(flat[`meal${n}_ingredients`], 2000))
      if (ingredients.length === 0) throw new ValidationError(`meal${n}_ingredients: empty`)
      return {
        name: optText(flat[`meal${n}_name`], 200),
        ingredients,
        preparation: "",
        prepTime: optText(flat[`meal${n}_prep_time`], 60),
        steps: parseSteps(optText(flat[`meal${n}_steps`], 4000)).slice(0, 12),
        macros: parseMacroString(flat[`meal${n}_macros`], `meal${n}_macros`),
      }
    })
  if (meals.length === 0) throw new ValidationError("suggestion: no meals")
  return JSON.stringify({ meals, warning: optText(flat.warning, 300) })
}

// ── Provider dispatch ────────────────────────────────────────────────────────

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  // Bounded: one retry at most, each attempt aborted after the shared timeout.
  const client = new Anthropic({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS, maxRetries: 1 })
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  })
  const content = message.content[0]
  if (content.type !== "text") throw new Error("Unexpected response type from Anthropic")
  return content.text.trim()
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 8192,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  })
  if (res.status === 401) throw new Error("OpenAI API key is invalid")
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const data = await res.json()
  return (data.choices[0]?.message?.content ?? "").trim()
}

// ── Route handler ─────────────────────────────────────────────────────────────

const MEAL_TYPES = Object.keys(MEAL_TYPE_LABELS)
const FLAVORS    = Object.keys(FLAVOR_LABELS)

interface SuggestBody {
  ingredients:   string
  mealType:      string
  flavorProfile: string
  remaining:     { calories: number; protein: number; carbs: number; fats: number }
  excluded:      string[]
  previous:      PreviousMeal[] | null
}

function validateBody(raw: unknown): SuggestBody {
  if (!raw || typeof raw !== "object") throw new ValidationError("body: not an object")
  const b = raw as Record<string, unknown>
  const ingredients = b.ingredients === undefined || b.ingredients === null ? "" : b.ingredients
  if (typeof ingredients !== "string" || ingredients.length > MAX_FOOD_TEXT_CHARS) {
    throw new ValidationError("ingredients: too long")
  }
  const mealType = typeof b.mealType === "string" && MEAL_TYPES.includes(b.mealType) ? b.mealType : "dinner"
  const flavorProfile = typeof b.flavorProfile === "string" && FLAVORS.includes(b.flavorProfile)
    ? b.flavorProfile
    : "savory"
  const r = (b.remaining ?? {}) as Record<string, unknown>
  const remaining = {
    calories: Math.round(num(r.calories, "remaining.calories", 0, 10000)),
    protein:  Math.round(num(r.protein,  "remaining.protein",  0, 1000) * 10) / 10,
    carbs:    Math.round(num(r.carbs,    "remaining.carbs",    0, 2000)),
    fats:     Math.round(num(r.fats,     "remaining.fats",     0, 1000) * 10) / 10,
  }
  const excluded = Array.isArray(b.excluded)
    ? b.excluded
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .slice(0, 50)
        .map((x) => x.trim().slice(0, 100))
    : []
  const previous = Array.isArray(b.previous) && b.previous.length
    ? b.previous.slice(0, 2).map((m, i): PreviousMeal => {
        const pm = (m ?? {}) as Record<string, unknown>
        if (typeof pm.name !== "string" || !Array.isArray(pm.ingredients)) {
          throw new ValidationError(`previous[${i}]: malformed`)
        }
        return {
          name: pm.name.slice(0, 200),
          ingredients: pm.ingredients.slice(0, 40).map((x) => {
            const ing = (x ?? {}) as Record<string, unknown>
            return {
              quantity: typeof ing.quantity === "string" ? ing.quantity.slice(0, 40) : "",
              name:     typeof ing.name === "string" ? ing.name.slice(0, 100) : "",
            }
          }),
        }
      })
    : null
  return { ingredients, mealType, flavorProfile, remaining, excluded, previous }
}

export async function POST(request: NextRequest) {
  try {
    let body: SuggestBody
    try {
      body = validateBody(await readJsonBody(request, TEXT_BODY_MAX_BYTES))
    } catch (err) {
      const res = requestErrorResponse(err)
      if (res) return res
      throw err
    }
    const { ingredients, mealType, flavorProfile, remaining, excluded, previous } = body

    const limited = checkAiRateLimit()
    if (limited) return limited

    const settings = await db.userSettings.findUnique({
      where: { userId: DEMO_USER_ID },
    })

    const provider  = settings?.aiProvider ?? "anthropic"
    const apiKey    = resolveProviderKey(provider, settings?.aiApiKey ?? null)

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
    const prompt    = buildPrompt(remaining, dietLabel, ingredients, mealType, flavorProfile, excluded, previous)

    let suggestion: string
    if (provider === "openai") {
      suggestion = await callOpenAI(prompt, apiKey)
    } else if (provider === "gemini") {
      suggestion = await callGemini(
        apiKey,
        [{ role: "user", parts: [{ text: prompt }] }],
        { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] } },
      )
    } else {
      suggestion = await callAnthropic(prompt, apiKey)
    }

    let nested: string
    try {
      nested = flatToNestedSuggestion(JSON.parse(stripMarkdownFences(suggestion)))
    } catch (err) {
      // Never pass unvalidated model text through to the client.
      console.error(
        `[POST /api/ai/suggest-meal] invalid model output (${provider}, length ${suggestion.length}):`,
        err instanceof Error ? err.name : "unknown error",
      )
      return NextResponse.json(
        { error: "ה-AI החזיר הצעה לא תקינה — נסה שוב" },
        { status: 422 },
      )
    }
    return NextResponse.json({ suggestion: nested })
  } catch (err) {
    console.error("[POST /api/ai/suggest-meal]", err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ error: "שגיאה בהצעת הארוחה — נסה שוב" }, { status: 500 })
  }
}
