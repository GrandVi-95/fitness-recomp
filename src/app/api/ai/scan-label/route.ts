import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  callGemini,
  buildInlineDataPart,
  checkAiRateLimit,
  requestErrorResponse,
  resolveGeminiKey,
  sanitizeAndParseJson,
  IMAGE_BODY_MAX_BYTES,
} from "@/lib/ai"
import { num, readJsonBody, ValidationError } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

// Max ~5 MB binary (≈6.7 MB of base64) — labels photographed on a phone are
// well under this; the whole JSON body is also capped before parsing.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

interface ScannedLabel {
  productName:     string | null
  packageWeightG:  number | null
  unitWeightG:     number | null   // weight of one serving/unit if the label has a למנה/ליחידה column
  unitsPerPackage: number | null   // e.g. "4 יחידות" printed on the package
  per100g: {
    calories:      number
    protein:       number
    carbs:         number
    fat:           number
    // Sub-nutrients: null = not printed on the label (unknown), not 0.
    sugar:         number | null
    fiber:         number | null
    saturatedFat:  number | null
  }
  confidence: "high" | "medium" | "low"
}

const SYSTEM_PROMPT = `אתה סורק תוויות תזונה. תקבל תמונה של תווית מזון (בעברית או באנגלית).
תפקידך: לחלץ ערכים תזונתיים אך ורק מטבלת הערכים התזונתיים שבתמונה — ל-100 גרם.

כללים קריטיים:
1. חלץ ערכים ל-100 גרם. אם הטבלה מציגה רק "למנה", המר ל-100 גרם לפי משקל המנה המצוין.
2. אל תנחש ואל תשלים ערכים מהידע הכללי שלך — רק מה שכתוב בתווית. סוכרים / סיבים / שומן רווי שלא מופיעים בתווית → null (לא 0). 0 רק אם התווית עצמה מציינת 0.
3. אם מופיע שם מוצר ברור בתמונה, כלול אותו. אחרת null.
4. אם מופיע משקל אריזה כולל (למשל "400 גרם"), כלול אותו ב-packageWeightG. אחרת null.
5. עמודת "למנה" / "ליחידה": אם הטבלה כוללת עמודה כזו ומצוין משקל המנה/היחידה (למשל "מנה = 80 גרם" או "ליחידה (95 גרם)"), כלול את המשקל ב-unitWeightG. אחרת null.
6. אם מצוין מספר יחידות באריזה (למשל "4 שניצלים" או "6 יחידות"), כלול אותו ב-unitsPerPackage. אחרת null.
7. confidence: "high" אם הטבלה קריאה וברורה, "medium" אם חלק מהערכים מטושטשים, "low" אם התמונה אינה תווית תזונה או בלתי קריאה.

החזר JSON בלבד:
{
  "productName": "שם המוצר או null",
  "packageWeightG": 400,
  "unitWeightG": 80,
  "unitsPerPackage": 5,
  "per100g": {
    "calories": 375,
    "protein": 12.5,
    "carbs": 60,
    "fat": 8,
    "sugar": 15,
    "fiber": 6,
    "saturatedFat": 1.2
  },
  "confidence": "high"
}`

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Validates the per-100 g table. Core macros are required and must be
 * plausible (each ≤ 100 g, together ≤ ~100 g, energy consistent with Atwater
 * 4/4/9); sub-nutrients are optional and stay null when missing.
 */
function validatePer100g(raw: unknown): ScannedLabel["per100g"] {
  if (!raw || typeof raw !== "object") throw new ValidationError("per100g: not an object")
  const p = raw as Record<string, unknown>
  const calories = num(p.calories, "per100g.calories", 0, 900)
  const protein  = num(p.protein,  "per100g.protein",  0, 100)
  const carbs    = num(p.carbs,    "per100g.carbs",    0, 100)
  const fat      = num(p.fat,      "per100g.fat",      0, 100)
  if (protein + carbs + fat > 105) throw new ValidationError("per100g: macros exceed 100 g")
  const atwater = protein * 4 + carbs * 4 + fat * 9
  if (Math.abs(atwater - calories) > Math.max(40, calories * 0.35)) {
    throw new ValidationError(`per100g.calories: ${calories} kcal doesn't match macros (~${Math.round(atwater)} kcal)`)
  }
  const sub = (k: string, parent: number): number | null => {
    if (p[k] === undefined || p[k] === null) return null
    return round1(Math.min(num(p[k], `per100g.${k}`, 0, 100), parent))
  }
  return {
    calories:     round1(calories),
    protein:      round1(protein),
    carbs:        round1(carbs),
    fat:          round1(fat),
    sugar:        sub("sugar", carbs),
    fiber:        sub("fiber", 100),
    saturatedFat: sub("saturatedFat", fat),
  }
}

/** POST /api/ai/scan-label
 * Body: { image: string (base64, no data: prefix), mimeType: string }
 * Returns a ScannedLabel — nothing is written to the DB here; the client
 * confirms name/portion first and then saves via /api/nutrition/products.
 */
export async function POST(request: Request) {
  try {
    let body: { image?: unknown; mimeType?: unknown }
    try {
      body = await readJsonBody(request, IMAGE_BODY_MAX_BYTES)
    } catch (err) {
      const res = requestErrorResponse(err)
      if (res) return res
      throw err
    }
    const { image, mimeType } = body

    if (typeof image !== "string" || !image) {
      return NextResponse.json({ error: "חסרה תמונה" }, { status: 400 })
    }
    if (image.length * 0.75 > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "התמונה גדולה מדי — עד 5MB" }, { status: 413 })
    }
    if (typeof mimeType !== "string" || !/^image\/[a-z0-9.+-]+$/i.test(mimeType)) {
      return NextResponse.json({ error: "סוג קובץ לא נתמך" }, { status: 400 })
    }

    const limited = checkAiRateLimit()
    if (limited) return limited

    const settings = await db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } })
    const apiKey = resolveGeminiKey(settings?.aiProvider ?? null, settings?.aiApiKey ?? null)
    if (!apiKey) {
      return NextResponse.json(
        { error: "מפתח Gemini API אינו מוגדר — הגדר GEMINI_API_KEY או הזן מפתח בהגדרות" },
        { status: 500 },
      )
    }

    const raw = await callGemini(
      apiKey,
      [{
        role: "user",
        parts: [
          buildInlineDataPart(image, mimeType),
          { text: "חלץ את הערכים התזונתיים מהתווית שבתמונה." },
        ],
      }],
      {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig:  { maxOutputTokens: 2048, responseMimeType: "application/json" },
      },
    )

    let parsed: ScannedLabel
    try {
      parsed = sanitizeAndParseJson<ScannedLabel>(raw)
    } catch {
      return NextResponse.json(
        { error: "לא הצלחתי לקרוא את התווית — נסה לצלם שוב בתאורה טובה" },
        { status: 422 },
      )
    }

    const posInt = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 50000 ? Math.round(v) : null

    let per100g: ScannedLabel["per100g"]
    try {
      per100g = validatePer100g(parsed.per100g)
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err
      console.error(`[POST /api/ai/scan-label] invalid model output: ${err.message}`)
      return NextResponse.json(
        { error: "לא הצלחתי לקרוא ערכים תקינים מהתווית — נסה לצלם שוב בתאורה טובה" },
        { status: 422 },
      )
    }

    const result: ScannedLabel = {
      productName:    typeof parsed.productName === "string" && parsed.productName.trim()
        ? parsed.productName.trim().slice(0, 120)
        : null,
      packageWeightG:  posInt(parsed.packageWeightG),
      unitWeightG:     posInt(parsed.unitWeightG),
      unitsPerPackage: posInt(parsed.unitsPerPackage),
      per100g,
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low",
    }

    // A label whose macros are all zero means the model found no nutrition table
    const { calories, protein, carbs, fat } = result.per100g
    if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
      return NextResponse.json(
        { error: "לא זוהתה טבלת ערכים תזונתיים בתמונה" },
        { status: 422 },
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/ai/scan-label]", err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ error: "שגיאה בסריקת התווית" }, { status: 500 })
  }
}
