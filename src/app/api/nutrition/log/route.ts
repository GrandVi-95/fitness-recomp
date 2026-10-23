import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { callGemini as callGeminiShared,
  checkAiRateLimit,
  fetchWithTimeout,
  isAbortError,
  lowProteinMealThresholdG,
  requestErrorResponse,
  resolveProviderKey,
  roundFoodItem,
  sanitizeAndParseJson,
  validateAiItems,
  AI_REQUEST_TIMEOUT_MS,
  AI_TOTAL_DEADLINE_MS,
  MAX_FOOD_TEXT_CHARS, AIUnavailableError, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai"
import { readJsonBody, ValidationError, type ValidFoodItem } from "@/lib/validate"
import { getTrendWeight, snapshotDayPlan } from "@/lib/targets-server"

const DEMO_USER_ID = "demo-user"

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"] as const
type MealType = (typeof MEAL_TYPES)[number]

// Snacks are exempt from the low-protein meal check.
const PROTEIN_CHECK_EXEMPT: readonly MealType[] = ["snack", "pre_workout"]

// Body cap: free text is ≤ MAX_FOOD_TEXT_CHARS, but direct logs can carry a
// few dozen reviewed items (voice meals), so allow a little more than 20 KB.
const LOG_BODY_MAX_BYTES = 32 * 1024
const MAX_DIRECT_ITEMS = 40

// Model output item after validation, plus the (verified) DB match.
interface ResolvedFoodItem extends ValidFoodItem {
  foodId: string | null
}

// Deterministic backup for the rare case an LLM omits the optional `insight`
// field despite the instruction — keeps the nudge feature from silently
// disappearing on a flaky response. Absolute per-meal protein, not a ratio.
function computeFallbackInsight(items: ValidFoodItem[], mealType: MealType, floorG: number): string {
  if (PROTEIN_CHECK_EXEMPT.includes(mealType)) return ""
  const protein = items.reduce((s, i) => s + i.protein, 0)
  return protein < floorG
    ? "כדאי להוסיף לארוחה הזו מקור חלבון — טופו, סייטן, יוגורט יווני או קטניות — בפעם הבאה."
    : "מנת חלבון טובה לארוחה הזו — כל הכבוד!"
}

// ── Hebrew NLP prompt (shared across providers) ─────────────────────────────
// {{PROTEIN_FLOOR_G}} / {{MEAL_KIND}} are filled per request (see buildSystemPrompt).
const SYSTEM_PROMPT_TEMPLATE = `אתה עוזר לתיעוד תזונה באפליקציית כושר צמחונית.
תפקידך: לחלץ פריטי מזון מטקסט בעברית ולהתאים אותם למסד נתוני המזון הנתון.

כללים:
1. זהה כל מרכיב מזון שהמשתמש ציין, כולל כמויות.
2. לעולם אל תאחד כמה מזונות/מרכיבים נבדלים לפריט אחד מסוכם — גם אם המשתמש מתאר אותם
   כחלק מ"מנה" או "ארוחה" אחת. פרק כל תיאור מורכב למספר פריטים נפרדים במערך items, פריט
   אחד לכל מרכיב מזון ניכר לעין, עם quantity/unit/מאקרו נפרדים לכל פריט. לדוגמה: "שווארמה
   רדפין עם פסטה ואפונה" חייב להפוך ל-3 פריטים נפרדים — שווארמה, פסטה, אפונה — ולעולם לא
   פריט מסוכם אחד כמו "שווארמה עם פסטה ואפונה".
3. נסה להתאים כל פריט לרשומה קיימת במסד הנתונים לפי שם או כינוי (aliases).
4. אם הכמות לא צוינה, השתמש בגודל מנה סביר (לדוגמה: 100 גרם לטופו, 200 גרם ליוגורט).
5. חשב מאקרו על בסיס הכמות שצוינה: (כמות / 100) × ערכי per100g.
6. אם מזון לא נמצא במסד הנתונים, כלול אותו עם הערכה מציאותית ו-matchedFoodId כ-null.
7. שם המזון בתשובה יכול להיות בעברית.
8. חשב גם sugar (סוכר, תת-קבוצה של פחמימות) ו-saturatedFat (שומן רווי, תת-קבוצה של שומן) לפי per100g אם קיים, אחרת הערך מציאותי.
   כמויות של מזון שהותאם למסד הנתונים — תמיד בגרמים (unit "g") או מ"ל (unit "ml") כשאפשר.

9. נדנוד AI (insight) — אחרי שחילצת את כל הפריטים, חשב את סך החלבון (בגרמים) של הארוחה כולה.
   סוג הארוחה: {{MEAL_KIND}}.
   - חטיף / נשנוש / לפני אימון — פטור מבדיקת החלבון: כתוב הערה קלילה וחיובית או השאר insight ריק.
   - ארוחה עיקרית עם פחות מ-{{PROTEIN_FLOOR_G}} גרם חלבון בסך הכול: כתוב טיפ עדין וקצר (משפט אחד
     בעברית) איך להוסיף חלבון בפעם הבאה — למשל להחליף חלב שיבולת שועל בחלב סויה, להוסיף חלק
     מקוביית טופו, יוגורט יווני, ביצים או סייטן. אל תשתמש בטון שיפוטי או מטיל אשמה — הכוונה
     חיובית בלבד, לא ציון.
   - זהה איכות מקורות החלבון: מקורות צמחוניים צפופי חלבון ("איכותיים") הם טופו, סייטן,
     טמפה, קטניות (עדשים, שעועית, חומוס, אדממה), מוצרי חלב וביצים, ואבקת חלבון. לעומת זאת,
     חלבון שמגיע כמעט כולו מכמות אדירה של פחמימה דלת-חלבון (למשל צלחת ענקית של פסטה או
     אורז) הוא "חלבון עקבות". אם זיהית שהארוחה מקבלת את רוב החלבון שלה מחלבון עקבות כזה,
     כתוב טיפ עדין (באותו משפט insight, לא משפט נוסף) שממליץ להוסיף מקור חלבון צמחוני צפוף.
   - ארוחה עיקרית עם {{PROTEIN_FLOOR_G}} גרם חלבון או יותר: כתוב משפט עידוד קצר וחם, למשל
     "פצצת התאוששות! מנת חלבון מעולה לארוחה."
   - המשפט חייב להיות קצר (עד כ-20 מילים), חיובי או עדין, ולעולם לא ביקורתי או מטיל אשמה.
10. אם ערך סוכר / סיבים / שומן רווי אינו ידוע — השמט אותו או החזר null (לא 0 כממלא מקום).

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף לפני או אחרי). זכור: items הוא מערך של פריטים
נפרדים — לעולם לא פריט מסוכם יחיד עבור ארוחה שלמה:
{
  "items": [
    {
      "name": "שווארמה",
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
    },
    {
      "name": "פסטה",
      "matchedFoodId": "food-id-or-null",
      "quantity": 150,
      "unit": "g",
      "calories": 185,
      "protein": 7,
      "carbs": 37,
      "fat": 1,
      "fiber": 2,
      "sugar": 1,
      "saturatedFat": 0
    }
  ],
  "insight": "משפט אחד בעברית לפי כלל 9 לעיל"
}`

const MEAL_KIND_LABELS: Record<MealType, string> = {
  breakfast:    "ארוחת בוקר (ארוחה עיקרית)",
  lunch:        "ארוחת צהריים (ארוחה עיקרית)",
  dinner:       "ארוחת ערב (ארוחה עיקרית)",
  snack:        "חטיף / נשנוש",
  pre_workout:  "לפני אימון (חטיף)",
  post_workout: "אחרי אימון (ארוחה עיקרית)",
}

function buildSystemPrompt(mealType: MealType, proteinFloorG: number): string {
  return SYSTEM_PROMPT_TEMPLATE
    .replaceAll("{{MEAL_KIND}}", MEAL_KIND_LABELS[mealType])
    .replaceAll("{{PROTEIN_FLOOR_G}}", String(proteinFloorG))
}

// ── Vacation Mode prompt — relaxed, judgment-free rough estimation ──────────
// Used instead of SYSTEM_PROMPT whenever UserSettings.vacationMode is true.
// The user explicitly doesn't want precise gram-level tracking or any protein-
// quality commentary right now — the only goal is a rough estimate that keeps
// the logging streak alive without any pressure.
const VACATION_SYSTEM_PROMPT = `אתה עוזר לתיעוד תזונה רגוע במצב חופשה (Vacation Mode) באפליקציית כושר.
המשתמש נמצא בחופשה ולא מעוניין במעקב מדויק כרגע — המטרה היחידה היא לשמור על רצף
התיעוד בלי שום לחץ או דרישה לדיוק.

כללים:
1. זהה בגסות מה המשתמש אכל/שתה מהטקסט.
2. תן הערכת קלוריות ומאקרו סבירה וגסה בלבד — אין צורך בדיוק גרם-לגרם, ואל תבקש
   מהמשתמש פרטים נוספים או כמויות מדויקות.
3. אפשר לפרק לכמה פריטים אם זה טבעי, אך גם פריט מסוכם אחד לארוחה שלמה מקובל
   לגמרי אם זה פשוט יותר — אין דרישה להפרדה קפדנית כרגע.
4. אל תעיר שום הערה על איכות מקורות חלבון, יחס חלבון-קלוריות, או כל ביקורת
   תזונתית אחרת. הטון תמיד קליל, חיובי ונטול שיפוטיות — אין "צריך לשפר" ואין
   "לשקול להוסיף". זו חופשה.
5. matchedFoodId תמיד null (אין צורך להתאים למסד הנתונים).
6. insight (אופציונלי) — לכל היותר משפט קליל אחד ומעודד, למשל "תיהנו מהחופשה!"
   — לעולם לא הערה ביקורתית או המלצה לשיפור. מותר גם להשמיט לגמרי.

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף לפני או אחרי):
{
  "items": [
    {
      "name": "פיצה",
      "matchedFoodId": null,
      "quantity": 300,
      "unit": "g",
      "calories": 750,
      "protein": 30,
      "carbs": 90,
      "fat": 28,
      "fiber": 3,
      "sugar": 6,
      "saturatedFat": 12
    }
  ],
  "insight": "משפט קליל אחד או השמט לגמרי"
}`

function buildUserMessage(text: string, foodList: object[], knownNames: string[] = []): string {
  const known = knownNames.length
    ? `

הפריטים הבאים כבר נרשמו בערכים מדויקים מתווית שמורה — אל תכלול אותם ב-items גם אם הם מוזכרים בטקסט: ${knownNames.join(", ")}`
    : ""
  return `טקסט המשתמש: "${text}"${known}

מסד נתוני המזון הזמין:
${JSON.stringify(foodList, null, 2)}`
}

// JSON extraction/repair is shared: sanitizeAndParseJson() in lib/ai.
// Key resolution (decrypted user key, then the chosen provider's env var —
// never a different provider) is resolveProviderKey() in lib/ai.

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai:    "OpenAI",
  gemini:    "Gemini",
}

// ── Client-supplied items (direct logs, known-product chips) ────────────────
// Values are pre-computed on the client (label scan, saved product, manual
// entry): clamp to plausible ranges and pass unknown sub-nutrients as null.
function sanitizeDirectItems(rawItems: unknown[]) {
  return rawItems
    .map((raw: unknown) => {
      const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
      const carbs = clampMacro(item.carbs, 1000)
      const fat   = clampMacro(item.fat,   500)
      return {
        name:     typeof item.name === "string" ? item.name.trim().slice(0, 200) : "",
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0
          ? Math.min(item.quantity, 10000)
          : 1,
        unit:     typeof item.unit === "string" && item.unit.trim()
          ? item.unit.trim().slice(0, 20)
          : "serving",
        calories: clampMacro(item.calories, 5000),
        protein:  clampMacro(item.protein,  500),
        carbs,
        fat,
        // Pass through what the client knows; unknown stays null.
        // Not capped at carbs — labels often list carbs excluding fibre.
        fiber:        clampSub(item.fiber,        Infinity),
        sugar:        clampSub(item.sugar,        carbs),
        saturatedFat: clampSub(item.saturatedFat, fat),
      }
    })
    .filter((item) => item.name.length > 0)
}

// ── Provider dispatch ────────────────────────────────────────────────────────

async function callAnthropic(userMessage: string, apiKey: string, systemPrompt: string): Promise<string> {
  // Bounded: one retry at most, each attempt aborted after the shared timeout.
  const client = new Anthropic({ apiKey, timeout: AI_REQUEST_TIMEOUT_MS, maxRetries: 1 })
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: systemPrompt,
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

async function callOpenAI(userMessage: string, apiKey: string, systemPrompt: string): Promise<string> {
  const MAX_ATTEMPTS = 3
  const RETRY_DELAY_MS = 1500
  const deadline = Date.now() + AI_TOTAL_DEADLINE_MS
  let lastStatus: number | string = 0
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeLeft = deadline - Date.now()
    if (timeLeft < 3_000) break
    let res: Response
    try {
      res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 8192,
        }),
      }, Math.min(AI_REQUEST_TIMEOUT_MS, timeLeft))
    } catch (err) {
      lastStatus = isAbortError(err) ? "timeout" : "network error"
      break
    }
    if (res.ok) {
      const data = await res.json()
      return data.choices[0]?.message?.content ?? ""
    }
    if (res.status === 401) {
      throw new Error("API_KEY_INVALID: מפתח OpenAI לא תקין — בדוק את המפתח בדף ההגדרות")
    }
    lastStatus = res.status
    if ((res.status === 429 || res.status === 503) && attempt < MAX_ATTEMPTS
        && deadline - Date.now() > RETRY_DELAY_MS + 3_000) {
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
async function callGemini(userMessage: string, apiKey: string, systemPrompt: string): Promise<string> {
  try {
    return await callGeminiShared(
      apiKey,
      [{ role: "user", parts: [{ text: userMessage }] }],
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
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

// Units for which a DB match can be computed exactly from per-100 values
// (ml treated as g — density ≈ 1 for the liquids in the food DB).
const MASS_UNITS = new Set(["g", "gr", "gram", "grams", "גרם", "גר'", "ml", "מ\"ל", "מל", "milliliter", "milliliters"])

interface FoodRow {
  id: string
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
  fiberPer100: number
  sugarPer100: number
  saturatedFatPer100: number
}

/**
 * For items whose matchedFoodId is a real Food row and whose unit is g/ml,
 * the model's macros are IGNORED and recomputed from the row's per-100
 * values × quantity. Unknown ids are treated as unmatched. Food.sugarPer100 /
 * saturatedFatPer100 default to 0 for rows seeded without them, so a 0 there
 * means "not recorded" — keep the model's (validated, possibly null) value.
 */
function resolveAgainstFoodDb(
  item: ValidFoodItem,
  rawMatchedId: unknown,
  foodById: Map<string, FoodRow>,
): ResolvedFoodItem {
  const food = typeof rawMatchedId === "string" ? foodById.get(rawMatchedId) : undefined
  if (!food) return { ...item, foodId: null }
  if (!MASS_UNITS.has(item.unit.trim().toLowerCase())) return { ...item, foodId: food.id }
  const f = item.quantity / 100
  return {
    ...item,
    calories:     food.caloriesPer100 * f,
    protein:      food.proteinPer100  * f,
    carbs:        food.carbsPer100    * f,
    fat:          food.fatPer100      * f,
    fiber:        food.fiberPer100    * f,
    sugar:        food.sugarPer100        > 0 ? food.sugarPer100        * f : item.sugar,
    saturatedFat: food.saturatedFatPer100 > 0 ? food.saturatedFatPer100 * f : item.saturatedFat,
    foodId:       food.id,
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10

// Clamp to finite, non-negative, plausible values — a client bug sending
// NaN/Infinity/negatives would otherwise silently corrupt daily totals.
function clampMacro(v: unknown, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0
  return round1(Math.min(Math.max(n, 0), max))
}

// Sub-nutrients: missing / non-numeric → null (unknown), never 0. Capped at
// the parent macro (sugar/fiber ≤ carbs, saturated fat ≤ fat).
function clampSub(v: unknown, parent: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return round1(Math.min(Math.max(v, 0), parent))
}

function sumTotals(items: Array<{ calories: number; protein: number; carbs: number; fat: number }>) {
  const t = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein:  acc.protein  + item.protein,
      carbs:    acc.carbs    + item.carbs,
      fat:      acc.fat      + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return {
    calories: Math.round(t.calories),
    protein:  round1(t.protein),
    carbs:    Math.round(t.carbs),
    fat:      round1(t.fat),
  }
}

// Snapshot today's targets once the day has a logged meal. Best-effort: a
// failure here must not turn a successful log write into an error.
async function snapshotToday(): Promise<void> {
  try {
    await snapshotDayPlan(DEMO_USER_ID)
  } catch (err) {
    console.error("[nutrition/log] snapshotDayPlan failed:", err instanceof Error ? err.message : "unknown error")
  }
}

/** POST /api/nutrition/log
 * Body: { text: string, mealType?: string }
 *    or { directItems: [...], mealType?: string, insight?: string }
 */
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>
    try {
      const parsedBody = await readJsonBody(request, LOG_BODY_MAX_BYTES)
      if (!parsedBody || typeof parsedBody !== "object") throw new ValidationError("body: not an object")
      body = parsedBody as Record<string, unknown>
    } catch (err) {
      const res = requestErrorResponse(err)
      if (res) return res
      throw err
    }
    const { text, directItems, insight: rawInsight } = body
    const rawMealType = body.mealType ?? "snack"
    if (typeof rawMealType !== "string" || !(MEAL_TYPES as readonly string[]).includes(rawMealType)) {
      return NextResponse.json({ error: "סוג ארוחה לא תקין" }, { status: 400 })
    }
    const mealType = rawMealType as MealType
    // "planned" = a forecast (e.g. tonight's dinner): stored, but excluded from
    // every intake total until the user confirms it as eaten.
    if (body.status !== undefined && body.status !== "eaten" && body.status !== "planned") {
      return NextResponse.json({ error: "סטטוס לא תקין" }, { status: 400 })
    }
    const status: "eaten" | "planned" = body.status === "planned" ? "planned" : "eaten"
    // Known-product chips sent alongside free text: logged with their exact
    // saved values, and excluded from what the AI estimates.
    if (body.knownItems !== undefined && !Array.isArray(body.knownItems)) {
      return NextResponse.json({ error: "פריטים ידועים לא תקינים" }, { status: 400 })
    }
    const knownItems = sanitizeDirectItems(((body.knownItems ?? []) as unknown[]).slice(0, MAX_DIRECT_ITEMS))

    // Direct log path — skip AI re-analysis and write pre-computed values from the editable review card
    if (Array.isArray(directItems) && directItems.length > 0) {
      if (directItems.length > MAX_DIRECT_ITEMS) {
        return NextResponse.json({ error: `יותר מדי פריטים — עד ${MAX_DIRECT_ITEMS}` }, { status: 400 })
      }
      // The only source for a real insight here is an upstream AI call the client
      // already made (e.g. the voice-meal analyzer) — quick-logs (coffee, label
      // scanner) simply omit it, so this stays undefined/null for those.
      const directInsight = typeof rawInsight === "string" && rawInsight.trim()
        ? rawInsight.trim().slice(0, 300)
        : null
      const sanitized = sanitizeDirectItems(directItems)
      if (sanitized.length === 0) {
        return NextResponse.json({ error: "פריטים לא תקינים — חסר שם מזון" }, { status: 400 })
      }
      const log = await db.nutritionLog.create({
        data: {
          userId:   DEMO_USER_ID,
          mealType,
          rawInput: sanitized.map((it) => it.name).join(", "),
          date:     new Date(),
          status,
          insight:  directInsight,
          foodItems: { create: sanitized },
        },
        include: { foodItems: true },
      })
      await snapshotToday()
      revalidatePath("/dashboard")
      revalidatePath("/recovery")
      return NextResponse.json({
        logId:    log.id,
        mealType: log.mealType,
        items:    log.foodItems,
        insight:  log.insight ?? undefined,
        totals:   sumTotals(log.foodItems),
      })
    }

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "נדרש תיאור מזון" }, { status: 400 })
    }
    if (text.length > MAX_FOOD_TEXT_CHARS) {
      return NextResponse.json(
        { error: `התיאור ארוך מדי — עד ${MAX_FOOD_TEXT_CHARS} תווים` },
        { status: 400 },
      )
    }

    const limited = checkAiRateLimit()
    if (limited) return limited

    // ── Load AI settings and resolve API key for chosen provider ─────────────
    const [settings, weightKg] = await Promise.all([
      db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } }),
      getTrendWeight(DEMO_USER_ID).catch(() => null),
    ])
    const provider   = settings?.aiProvider ?? "anthropic"
    const apiKey     = resolveProviderKey(provider, settings?.aiApiKey ?? null)

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
    const foodById = new Map<string, FoodRow>(foods.map((f) => [f.id, f]))

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

    const proteinFloorG = lowProteinMealThresholdG(weightKg)
    const userMessage = buildUserMessage(text, foodList, knownItems.map((k) => k.name))
    const systemPrompt = settings?.vacationMode
      ? VACATION_SYSTEM_PROMPT
      : buildSystemPrompt(mealType, proteinFloorG)

    // ── Dispatch to chosen provider ───────────────────────────────────────
    let rawText: string
    try {
      if (provider === "openai") {
        rawText = await callOpenAI(userMessage, apiKey, systemPrompt)
      } else if (provider === "gemini") {
        rawText = await callGemini(userMessage, apiKey, systemPrompt)
      } else {
        rawText = await callAnthropic(userMessage, apiKey, systemPrompt)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith("API_KEY_")) {
        const display = msg.replace(/^API_KEY_[A-Z_]+:\s*/, "")
        return NextResponse.json({ error: display }, { status: 400 })
      }
      throw err
    }

    // ── Parse + validate JSON from response ───────────────────────────────
    let parsed: { items?: unknown; insight?: unknown }
    try {
      parsed = sanitizeAndParseJson(rawText)
    } catch {
      console.error(`[nutrition/log] ${provider}: unparseable response (length ${rawText.length})`)
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

    // All-or-nothing: one implausible item rejects the whole response, so
    // nothing partial is ever written.
    let items: ResolvedFoodItem[]
    try {
      const rawItems = parsed.items as unknown[]
      items = validateAiItems(rawItems).map((item, i) => {
        const matched = (rawItems[i] as Record<string, unknown>).matchedFoodId
        return resolveAgainstFoodDb(item, settings?.vacationMode ? null : matched, foodById)
      })
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err
      console.error(`[nutrition/log] ${provider}: invalid model output: ${err.message}`)
      return NextResponse.json(
        { error: "ה-AI החזיר ערכים תזונתיים לא סבירים — נסה לנסח מחדש עם כמויות" },
        { status: 422 }
      )
    }

    // Vacation Mode never gets the low-protein nudge fallback — if the AI
    // didn't write an insight, silence is fine; no lecturing.
    const insight = typeof parsed.insight === "string" && parsed.insight.trim()
      ? parsed.insight.trim().slice(0, 300)
      : settings?.vacationMode ? "" : computeFallbackInsight(items, mealType, proteinFloorG)

    // ── Save to DB ────────────────────────────────────────────────────────
    const log = await db.nutritionLog.create({
      data: {
        userId: DEMO_USER_ID,
        mealType,
        rawInput: knownItems.length ? `${text} + ${knownItems.map((k) => k.name).join(", ")}` : text,
        date: new Date(),
        status,
        insight: insight || null,
        foodItems: {
          create: [...knownItems, ...items.map((item) => {
            const r = roundFoodItem(item)
            return {
              foodId:       item.foodId ?? undefined,
              name:         r.name,
              quantity:     r.quantity,
              unit:         r.unit,
              calories:     r.calories,
              protein:      r.protein,
              carbs:        r.carbs,
              fat:          r.fat,
              fiber:        r.fiber,
              sugar:        r.sugar,
              saturatedFat: r.saturatedFat,
            }
          })],
        },
      },
      include: { foodItems: true },
    })

    await snapshotToday()
    revalidatePath("/dashboard")
    revalidatePath("/recovery")

    return NextResponse.json({
      logId: log.id,
      mealType: log.mealType,
      items: log.foodItems,
      insight: log.insight ?? undefined,
      totals: sumTotals(log.foodItems),
    })
  } catch (err) {
    console.error("[POST /api/nutrition/log]", err instanceof Error ? err.message : "unknown error")
    if (err instanceof AIUnavailableError) {
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 })
    }
    return NextResponse.json({ error: "שגיאה בעיבוד הבקשה" }, { status: 500 })
  }
}
