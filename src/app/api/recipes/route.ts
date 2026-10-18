import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { num, optNum, optStr, readJsonBody, str, ValidationError } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

const RECIPE_BODY_MAX_BYTES = 16 * 1024
const MAX_INGREDIENTS_CHARS = 4000

interface RecipeInput {
  name:              string
  ingredients:       string
  totalCalories:     number
  totalProtein:      number
  totalCarbs:        number
  totalFat:          number
  totalSugar:        number | null
  defaultServingPct: number
}

/**
 * Whole-batch totals. Core macros are required (never defaulted to 0);
 * totalSugar is optional — missing means unknown (null), capped at carbs.
 */
function validateRecipeBody(raw: unknown): RecipeInput {
  if (!raw || typeof raw !== "object") throw new ValidationError("body: not an object")
  const b = raw as Record<string, unknown>
  const name = str(typeof b.name === "string" ? b.name.trim() : b.name, "name", 120, 1)
  const ingredients = (optStr(b.ingredients, "ingredients", MAX_INGREDIENTS_CHARS) ?? "").trim()
  const totalCalories = num(b.totalCalories, "totalCalories", 0, 50000)
  const totalProtein  = num(b.totalProtein,  "totalProtein",  0, 4000)
  const totalCarbs    = num(b.totalCarbs,    "totalCarbs",    0, 8000)
  const totalFat      = num(b.totalFat,      "totalFat",      0, 4000)
  const sugarIn       = optNum(b.totalSugar, "totalSugar", 0, 8000)
  const totalSugar    = sugarIn == null ? null : Math.min(sugarIn, totalCarbs)
  const defaultServingPct = optNum(b.defaultServingPct, "defaultServingPct", 0, 100) ?? 25
  if (defaultServingPct <= 0) throw new ValidationError("defaultServingPct: must be > 0")
  return {
    name,
    ingredients,
    totalCalories:     Math.round(totalCalories),
    totalProtein:      Math.round(totalProtein * 10) / 10,
    totalCarbs:        Math.round(totalCarbs),
    totalFat:          Math.round(totalFat * 10) / 10,
    totalSugar:        totalSugar == null ? null : Math.round(totalSugar * 10) / 10,
    defaultServingPct: Math.round(defaultServingPct * 10) / 10,
  }
}

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

/** POST /api/recipes — create a new recipe (totals are for the WHOLE batch) */
export async function POST(request: NextRequest) {
  try {
    let data: RecipeInput
    try {
      data = validateRecipeBody(await readJsonBody(request, RECIPE_BODY_MAX_BYTES))
    } catch (err) {
      if (err instanceof ValidationError) {
        if (err.message.startsWith("body too large")) {
          return NextResponse.json({ error: "הבקשה גדולה מדי" }, { status: 413 })
        }
        const error = err.message.startsWith("name")
          ? "נדרש שם מתכון (עד 120 תווים)"
          : "ערכי המתכון לא תקינים"
        return NextResponse.json({ error }, { status: 400 })
      }
      throw err
    }

    const recipe = await db.recipe.create({
      data: { userId: DEMO_USER_ID, ...data },
    })

    return NextResponse.json({ recipe })
  } catch (err) {
    console.error("[POST /api/recipes]", err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ error: "שגיאה בשמירת המתכון" }, { status: 500 })
  }
}
