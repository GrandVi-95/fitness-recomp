import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/recipes — list all saved recipes */
export async function GET() {
  try {
    const recipes = await db.recipe.findMany({
      where:   { userId: DEMO_USER_ID },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ recipes })
  } catch (err) {
    console.error("[GET /api/recipes]", err)
    return NextResponse.json({ error: "שגיאה בטעינת המתכונים" }, { status: 500 })
  }
}

/** POST /api/recipes — create a new recipe */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name:              string
      ingredients?:      string
      totalCalories:     number
      totalProtein:      number
      totalCarbs:        number
      totalFat:          number
      totalSugar?:       number
      defaultServingPct?: number
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "נדרש שם מתכון" }, { status: 400 })
    }

    const recipe = await db.recipe.create({
      data: {
        userId:           DEMO_USER_ID,
        name:             body.name.trim(),
        ingredients:      body.ingredients?.trim() ?? "",
        totalCalories:    Math.round(body.totalCalories    ?? 0),
        totalProtein:     Math.round((body.totalProtein    ?? 0) * 10) / 10,
        totalCarbs:       Math.round(body.totalCarbs       ?? 0),
        totalFat:         Math.round((body.totalFat        ?? 0) * 10) / 10,
        totalSugar:       Math.round((body.totalSugar      ?? 0) * 10) / 10,
        defaultServingPct: body.defaultServingPct ?? 25,
      },
    })

    return NextResponse.json({ recipe })
  } catch (err) {
    console.error("[POST /api/recipes]", err)
    return NextResponse.json({ error: "שגיאה בשמירת המתכון" }, { status: 500 })
  }
}
