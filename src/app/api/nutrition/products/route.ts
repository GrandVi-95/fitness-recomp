import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Saved scanned products are Food rows tagged with this category. Reusing the
// Food table (instead of a new model) means every saved product automatically
// joins the NLP matching corpus fed to /api/nutrition/log — scan a granola
// once and "אכלתי 40 גרם גרנולה" resolves against its real label values.
const CUSTOM_CATEGORY = "custom-product"

const clamp = (v: unknown, max: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0
  return Math.round(Math.min(Math.max(n, 0), max) * 10) / 10
}

/** GET /api/nutrition/products — list saved scanned products */
export async function GET() {
  try {
    const products = await db.food.findMany({
      where:   { category: CUSTOM_CATEGORY },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        caloriesPer100: true,
        proteinPer100: true,
        carbsPer100: true,
        fatPer100: true,
        fiberPer100: true,
        sugarPer100: true,
        saturatedFatPer100: true,
      },
    })
    return NextResponse.json({ products })
  } catch (err) {
    console.error("[GET /api/nutrition/products]", err)
    return NextResponse.json({ error: "שגיאה בטעינת המוצרים" }, { status: 500 })
  }
}

/** POST /api/nutrition/products
 * Body: { name: string, per100g: { calories, protein, carbs, fat, sugar, fiber?, saturatedFat? } }
 * Upserts by name — re-scanning a product refreshes its stored values.
 */
export async function POST(request: Request) {
  try {
    const { name, per100g } = await request.json()

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "נדרש שם מוצר" }, { status: 400 })
    }
    if (!per100g || typeof per100g !== "object") {
      return NextResponse.json({ error: "חסרים ערכים תזונתיים" }, { status: 400 })
    }

    const cleanName = name.trim().slice(0, 120)
    const values = {
      category:           CUSTOM_CATEGORY,
      caloriesPer100:     clamp(per100g.calories,     900),
      proteinPer100:      clamp(per100g.protein,      100),
      carbsPer100:        clamp(per100g.carbs,        100),
      fatPer100:          clamp(per100g.fat,          100),
      fiberPer100:        clamp(per100g.fiber,        100),
      sugarPer100:        clamp(per100g.sugar,        100),
      saturatedFatPer100: clamp(per100g.saturatedFat, 100),
    }

    const product = await db.food.upsert({
      where:  { name: cleanName },
      create: { name: cleanName, ...values },
      update: values,
    })

    return NextResponse.json({ id: product.id, name: product.name })
  } catch (err) {
    console.error("[POST /api/nutrition/products]", err)
    return NextResponse.json({ error: "שגיאה בשמירת המוצר" }, { status: 500 })
  }
}
