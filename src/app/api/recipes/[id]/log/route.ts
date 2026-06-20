import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** POST /api/recipes/[id]/log
 *  Body: { servingPct: number, mealType?: string }
 *  Logs a fractional serving of the recipe directly to today's nutrition log.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }  = await params
    const { servingPct, mealType = "snack" } = (await request.json()) as {
      servingPct: number
      mealType?:  string
    }

    if (!servingPct || servingPct <= 0 || servingPct > 100) {
      return NextResponse.json({ error: "אחוז המנה חייב להיות בין 1 ל-100" }, { status: 400 })
    }

    const recipe = await db.recipe.findFirst({ where: { id, userId: DEMO_USER_ID } })
    if (!recipe) {
      return NextResponse.json({ error: "מתכון לא נמצא" }, { status: 404 })
    }

    const fraction = servingPct / 100

    const log = await db.nutritionLog.create({
      data: {
        userId:   DEMO_USER_ID,
        mealType,
        rawInput: `${recipe.name} — ${servingPct}% מהמתכון`,
        date:     new Date(),
        foodItems: {
          create: [{
            name:     `${recipe.name} (${servingPct}%)`,
            quantity: servingPct,
            unit:     "%",
            calories:    Math.round(recipe.totalCalories * fraction * 10) / 10,
            protein:     Math.round(recipe.totalProtein  * fraction * 10) / 10,
            carbs:       Math.round(recipe.totalCarbs    * fraction * 10) / 10,
            fat:         Math.round(recipe.totalFat      * fraction * 10) / 10,
            sugar:       Math.round(recipe.totalSugar    * fraction * 10) / 10,
            fiber:       0,
            saturatedFat: 0,
          }],
        },
      },
      include: { foodItems: true },
    })

    revalidatePath("/dashboard")
    revalidatePath("/recovery")

    const item = log.foodItems[0]
    return NextResponse.json({
      logId:    log.id,
      mealType: log.mealType,
      macros: {
        calories: item.calories,
        protein:  item.protein,
        carbs:    item.carbs,
        fat:      item.fat,
      },
    })
  } catch (err) {
    console.error("[POST /api/recipes/[id]/log]", err)
    return NextResponse.json({ error: "שגיאה ברישום המנה" }, { status: 500 })
  }
}
