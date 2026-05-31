import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

// PRIVACY: Image buffer is transient and not stored on disk or DB

const ANALYZE_PROMPT =
  'Analyze this image of food. Identify the ingredients and estimate their quantities in grams. ' +
  'Return a flat JSON object EXACTLY like this: { "ingredients": "comma separated list of ingredients with estimated grams in Hebrew", "calories": number, "protein": number, "carbs": number, "fat": number }.'

const VISION_MODEL   = "gemini-2.5-flash"
const MAX_RETRIES    = 3
const RETRY_DELAY_MS = 1000

function resolveGeminiKey(aiProvider: string | null, userApiKey: string | null): string | null {
  if (aiProvider === "gemini" && userApiKey) return userApiKey
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
}

function stripMarkdownFences(raw: string): string {
  return raw.replace(/```(?:json)?\n?/g, "").replace(/```\n?/g, "").trim()
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = (await request.json()) as { imageBase64: string }

    if (!imageBase64) {
      return NextResponse.json({ error: "נדרשת תמונה לניתוח" }, { status: 400 })
    }

    // Strip the data-URL prefix ("data:image/jpeg;base64,...") to get raw base64
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/)
    const mimeType  = mimeMatch ? mimeMatch[1] : "image/jpeg"
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "")

    const settings  = await db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } })
    const apiKey    = resolveGeminiKey(settings?.aiProvider ?? null, settings?.aiApiKey ?? null)

    if (!apiKey) {
      return NextResponse.json(
        { error: "מפתח Gemini API אינו מוגדר — הגדר GEMINI_API_KEY ב-.env.local" },
        { status: 500 },
      )
    }

    const url     = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${apiKey}`
    const payload = {
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: ANALYZE_PROMPT },
        ],
      }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
    }

    let rawText   = ""
    let lastError = ""

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })

      if (res.ok) {
        console.log(`[analyze-image] success on attempt ${attempt}`)
        const data = await res.json()
        rawText = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
        break
      }

      const errBody = await res.text().catch(() => "(unreadable)")
      console.error(`[analyze-image] attempt ${attempt} HTTP ${res.status}:`, errBody)

      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({ error: "מפתח Gemini API לא תקין" }, { status: 500 })
      }

      if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES) {
        console.warn(`[analyze-image] retryable ${res.status} — waiting ${RETRY_DELAY_MS}ms before retry ${attempt + 1}/${MAX_RETRIES}`)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        continue
      }

      lastError = `${res.status}: ${errBody}`
      break
    }

    if (!rawText) throw new Error(`${VISION_MODEL} failed after ${MAX_RETRIES} attempts. Last: ${lastError}`)

    const result = JSON.parse(stripMarkdownFences(rawText)) as {
      ingredients: string
      calories:    number
      protein:     number
      carbs:       number
      fat:         number
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/ai/analyze-image]", err)
    return NextResponse.json({ error: "שגיאה בניתוח התמונה — נסה שוב" }, { status: 500 })
  }
}
