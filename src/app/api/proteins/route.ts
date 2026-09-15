import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/proteins — list all saved protein powders */
export async function GET() {
  try {
    const proteins = await db.savedProtein.findMany({
      where:   { userId: DEMO_USER_ID },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ proteins })
  } catch (err) {
    console.error("[GET /api/proteins]", err)
    return NextResponse.json({ error: "שגיאה בטעינת אבקות החלבון" }, { status: 500 })
  }
}

/** POST /api/proteins — save a new protein powder (macros per scoop) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name:              string
      caloriesPerScoop:  number
      proteinPerScoop:   number
      carbsPerScoop:     number
      fatPerScoop:       number
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "נדרש שם אבקת חלבון" }, { status: 400 })
    }

    const protein = await db.savedProtein.create({
      data: {
        userId:           DEMO_USER_ID,
        name:             body.name.trim(),
        caloriesPerScoop: Math.round((body.caloriesPerScoop ?? 0) * 10) / 10,
        proteinPerScoop:  Math.round((body.proteinPerScoop  ?? 0) * 10) / 10,
        carbsPerScoop:    Math.round((body.carbsPerScoop    ?? 0) * 10) / 10,
        fatPerScoop:      Math.round((body.fatPerScoop      ?? 0) * 10) / 10,
      },
    })

    return NextResponse.json({ protein })
  } catch (err) {
    console.error("[POST /api/proteins]", err)
    return NextResponse.json({ error: "שגיאה בשמירת אבקת החלבון" }, { status: 500 })
  }
}
