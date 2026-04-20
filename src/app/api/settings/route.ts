import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/settings */
export async function GET() {
  try {
    const user = await db.user.findUnique({
      where: { id: DEMO_USER_ID },
      include: {
        userSettings: true,
        bodyMetrics: {
          orderBy: { date: "desc" },
          take: 1,
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const latestWeight       = user.bodyMetrics[0]?.weightKg ?? null
    const calculatedProtein  = latestWeight ? Math.round(latestWeight * 2.1) : null
    const settings           = user.userSettings

    return NextResponse.json({
      name:            user.name            ?? "",
      targetCalories:  user.targetCalories,
      targetProtein:   user.targetProtein,
      latestWeight,
      calculatedProtein,
      aiProvider:      settings?.aiProvider      ?? "anthropic",
      aiApiKeySet:     !!(settings?.aiApiKey),
      autoProteinGoal: settings?.autoProteinGoal ?? true,
    })
  } catch (err) {
    console.error("[GET /api/settings]", err)
    return NextResponse.json({ error: "שגיאה בטעינת ההגדרות" }, { status: 500 })
  }
}

interface SettingsBody {
  name?: string
  targetCalories?: number
  targetProtein?: number
  aiProvider?: string
  aiApiKey?: string | null
  autoProteinGoal?: boolean
}

/** PUT /api/settings */
export async function PUT(request: Request) {
  try {
    const body: SettingsBody = await request.json()
    const { name, targetCalories, targetProtein, aiProvider, aiApiKey, autoProteinGoal } = body

    // ── Validate numeric bounds ────────────────────────────────────────────
    if (targetCalories !== undefined && (targetCalories < 1000 || targetCalories > 10000)) {
      return NextResponse.json({ error: "יעד קלוריות חייב להיות בין 1,000 ל-10,000 קק\"ל" }, { status: 400 })
    }
    if (targetProtein !== undefined && (targetProtein < 30 || targetProtein > 500)) {
      return NextResponse.json({ error: "יעד חלבון חייב להיות בין 30 ל-500 גר'" }, { status: 400 })
    }

    // ── Update User fields (name / calorie / protein targets) ─────────────
    if (name !== undefined || targetCalories !== undefined || targetProtein !== undefined) {
      await db.user.update({
        where: { id: DEMO_USER_ID },
        data: {
          ...(name           !== undefined ? { name: name.trim() }                     : {}),
          ...(targetCalories !== undefined ? { targetCalories: Math.round(targetCalories) } : {}),
          ...(targetProtein  !== undefined ? { targetProtein:  Math.round(targetProtein)  } : {}),
        },
      })
    }

    // ── Update UserSettings (always exists after seed — use update, not upsert) ──
    // Build explicit update payload to avoid type widening issues with Prisma v7
    const hasSettingsUpdate = aiProvider !== undefined || aiApiKey !== undefined || autoProteinGoal !== undefined

    if (hasSettingsUpdate) {
      // Try update first; if somehow the record doesn't exist, create it
      const existing = await db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } })

      if (existing) {
        await db.userSettings.update({
          where: { userId: DEMO_USER_ID },
          data: {
            ...(aiProvider      !== undefined ? { aiProvider }                   : {}),
            ...(aiApiKey        !== undefined ? { aiApiKey: aiApiKey || null }   : {}),
            ...(autoProteinGoal !== undefined ? { autoProteinGoal }              : {}),
          },
        })
      } else {
        await db.userSettings.create({
          data: {
            userId: DEMO_USER_ID,
            ...(aiProvider      !== undefined ? { aiProvider }                   : {}),
            ...(aiApiKey        !== undefined ? { aiApiKey: aiApiKey || null }   : {}),
            ...(autoProteinGoal !== undefined ? { autoProteinGoal }              : {}),
          },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[PUT /api/settings]", msg)
    return NextResponse.json({ error: "שגיאה בשמירת ההגדרות" }, { status: 500 })
  }
}
