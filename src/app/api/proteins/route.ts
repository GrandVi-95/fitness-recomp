import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { num, optNum, readJsonBody, str, ValidationError } from "@/lib/validate"

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
    let data: { name: string; caloriesPerScoop: number; proteinPerScoop: number; carbsPerScoop: number; fatPerScoop: number; sugarPerScoop: number | null }
    try {
      const body = await readJsonBody<Record<string, unknown>>(request, 4096)
      const r1 = (v: number) => Math.round(v * 10) / 10
      data = {
        name:             str(typeof body?.name === "string" ? body.name.trim() : body?.name, "name", 120, 1),
        caloriesPerScoop: r1(num(body?.caloriesPerScoop, "caloriesPerScoop", 0, 1000)),
        proteinPerScoop:  r1(num(body?.proteinPerScoop,  "proteinPerScoop",  0, 200)),
        carbsPerScoop:    r1(num(body?.carbsPerScoop,    "carbsPerScoop",    0, 200)),
        fatPerScoop:      r1(num(body?.fatPerScoop,      "fatPerScoop",      0, 200)),
        sugarPerScoop:    (() => {
          const v = optNum(body?.sugarPerScoop, "sugarPerScoop", 0, 200)
          return v == null ? null : r1(v)
        })(),
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        const error = err.message.startsWith("name") ? "נדרש שם אבקת חלבון" : "ערכי אבקת החלבון לא תקינים"
        return NextResponse.json({ error }, { status: 400 })
      }
      throw err
    }

    const protein = await db.savedProtein.create({
      data: { userId: DEMO_USER_ID, ...data },
    })

    return NextResponse.json({ protein })
  } catch (err) {
    console.error("[POST /api/proteins]", err)
    return NextResponse.json({ error: "שגיאה בשמירת אבקת החלבון" }, { status: 500 })
  }
}
