import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callGemini, buildInlineDataPart, sanitizeAndParseJson } from "@/lib/ai"

const DEMO_USER_ID = "demo-user"

// Max upload ~8 MB of base64 (≈6 MB binary) — labels photographed on a phone
// are well under this; the cap guards against runaway payloads.
const MAX_BASE64_LENGTH = 8 * 1024 * 1024

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
    sugar:         number
    fiber:         number
    saturatedFat:  number
  }
  confidence: "high" | "medium" | "low"
}

const SYSTEM_PROMPT = `אתה סורק תוויות תזונה. תקבל תמונה של תווית מזון (בעברית או באנגלית).
תפקידך: לחלץ ערכים תזונתיים אך ורק מטבלת הערכים התזונתיים שבתמונה — ל-100 גרם.

כללים קריטיים:
1. חלץ ערכים ל-100 גרם. אם הטבלה מציגה רק "למנה", המר ל-100 גרם לפי משקל המנה המצוין.
2. אל תנחש ואל תשלים ערכים מהידע הכללי שלך — רק מה שכתוב בתווית. ערך שלא מופיע בתווית → 0.
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

function resolveGeminiKey(aiProvider: string | null, userApiKey: string | null): string | null {
  if (aiProvider === "gemini" && userApiKey) return userApiKey
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
}

const clamp = (v: unknown, max: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0
  return Math.round(Math.min(Math.max(n, 0), max) * 10) / 10
}

/** POST /api/ai/scan-label
 * Body: { image: string (base64, no data: prefix), mimeType: string }
 * Returns a ScannedLabel — nothing is written to the DB here; the client
 * confirms name/portion first and then saves via /api/nutrition/products.
 */
export async function POST(request: Request) {
  try {
    const { image, mimeType } = await request.json()

    if (typeof image !== "string" || !image) {
      return NextResponse.json({ error: "חסרה תמונה" }, { status: 400 })
    }
    if (image.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: "התמונה גדולה מדי — עד 6MB" }, { status: 413 })
    }
    if (typeof mimeType !== "string" || !mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "סוג קובץ לא נתמך" }, { status: 400 })
    }

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
      typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null

    const p = parsed.per100g ?? ({} as ScannedLabel["per100g"])
    const result: ScannedLabel = {
      productName:    typeof parsed.productName === "string" && parsed.productName.trim()
        ? parsed.productName.trim().slice(0, 120)
        : null,
      packageWeightG:  posInt(parsed.packageWeightG),
      unitWeightG:     posInt(parsed.unitWeightG),
      unitsPerPackage: posInt(parsed.unitsPerPackage),
      per100g: {
        calories:     clamp(p.calories,     900),
        protein:      clamp(p.protein,      100),
        carbs:        clamp(p.carbs,        100),
        fat:          clamp(p.fat,          100),
        sugar:        clamp(p.sugar,        100),
        fiber:        clamp(p.fiber,        100),
        saturatedFat: clamp(p.saturatedFat, 100),
      },
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
    console.error("[POST /api/ai/scan-label]", err)
    return NextResponse.json({ error: "שגיאה בסריקת התווית" }, { status: 500 })
  }
}
