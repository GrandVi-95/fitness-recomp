import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { num, optOneOf, readJsonBody, ValidationError } from "@/lib/validate"
import { snapshotDayPlan } from "@/lib/targets-server"

const DEMO_USER_ID = "demo-user"

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"] as const

/** POST /api/recipes/[id]/log
 *  Body: { servingPct: number (0 < x ≤ 100), mealType?: string }
 *  Logs a fractional serving of the recipe directly to today's nutrition log.
 *  Recipe totals are for the WHOLE batch, so a portion = batch total × pct/100.
 *  (Logging by grams would need a finished-batch weight on Recipe — not stored yet.)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }  = await params
    let servingPct: number
    let mealType: string
    try {
      const body = await readJsonBody<Record<string, unknown>>(request, 2048)
      servingPct = num(body?.servingPct, "servingPct", 0, 100)
      if (servingPct <= 0) throw new ValidationError("servingPct: must be > 0")
      mealType = optOneOf(body?.mealType, "mealType", MEAL_TYPES) ?? "snack"
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: "אחוז המנה חייב להיות גדול מ-0 ועד 100" }, { status: 400 })
      }
      throw err
    }

    const recipe = await db.recipe.findFirst({ where: { id, userId: DEMO_USER_ID } })
    if (!recipe) {
      return NextResponse.json({ error: "מתכון לא נמצא" }, { status: 404 })
    }

    const fraction = servingPct / 100
    const pctLabel = Math.round(servingPct * 10) / 10
    const portion  = (batchTotal: number) => Math.round(batchTotal * fraction * 10) / 10

    const log = await db.nutritionLog.create({
      data: {
        userId:   DEMO_USER_ID,
        mealType,
        rawInput: `${recipe.name} — ${pctLabel}% מהמתכון`,
        date:     new Date(),
        foodItems: {
          create: [{
            name:     `${recipe.name} (${pctLabel}%)`,
            quantity: pctLabel,
            unit:     "%",
            calories: portion(recipe.totalCalories),
            protein:  portion(recipe.totalProtein),
            carbs:    portion(recipe.totalCarbs),
            fat:      portion(recipe.totalFat),
            sugar:    recipe.totalSugar == null ? null : portion(recipe.totalSugar),
            // Recipes don't track these — unknown, not 0.
            fiber:        null,
            saturatedFat: null,
          }],
        },
      },
      include: { foodItems: true },
    })

    try {
      await snapshotDayPlan(DEMO_USER_ID)
    } catch (err) {
      console.error("[recipes/log] snapshotDayPlan failed:", err instanceof Error ? err.message : "unknown error")
    }
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
    console.error("[POST /api/recipes/[id]/log]", err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ error: "שגיאה ברישום המנה" }, { status: 500 })
  }
}
