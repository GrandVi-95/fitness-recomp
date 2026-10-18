import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { num, readJsonBody, ValidationError } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"
const MAX_QUANTITY = 5000

/** PUT /api/nutrition/items/[itemId]
 * Body: { quantity: number }  (finite, > 0, ≤ 5000)
 * Scales all macros and sub-nutrients proportionally to the new quantity.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params
    let quantity: number
    try {
      const body = await readJsonBody<{ quantity?: unknown }>(request, 1024)
      quantity = num(body?.quantity, "quantity", 0, MAX_QUANTITY)
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: `כמות לא תקינה — מספר גדול מ-0 ועד ${MAX_QUANTITY}` }, { status: 400 })
      }
      throw err
    }
    if (quantity <= 0) {
      return NextResponse.json({ error: `כמות לא תקינה — מספר גדול מ-0 ועד ${MAX_QUANTITY}` }, { status: 400 })
    }

    const item = await db.nutritionFoodItem.findUnique({
      where: { id: itemId },
      include: { log: { select: { userId: true } } },
    })
    if (!item || item.log.userId !== DEMO_USER_ID) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 })
    }
    // A stored quantity of 0 (or a corrupt negative) has no ratio to scale by.
    if (!(item.quantity > 0) || !Number.isFinite(item.quantity)) {
      return NextResponse.json({ error: "לא ניתן לשנות כמות לפריט הזה — מחק והוסף מחדש" }, { status: 409 })
    }

    const ratio = quantity / item.quantity
    const round1 = (v: number) => Math.round(v * 10) / 10
    // Sub-nutrients: null = unknown, and stays unknown after scaling.
    const scale = (v: number | null) => (v === null ? null : round1(v * ratio))
    const updated = await db.nutritionFoodItem.update({
      where: { id: itemId },
      data: {
        quantity,
        calories:     round1(item.calories * ratio),
        protein:      round1(item.protein  * ratio),
        carbs:        round1(item.carbs    * ratio),
        fat:          round1(item.fat      * ratio),
        fiber:        scale(item.fiber),
        sugar:        scale(item.sugar),
        saturatedFat: scale(item.saturatedFat),
      },
    })

    revalidatePath("/dashboard")
    revalidatePath("/recovery")
    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    console.error("[PUT /api/nutrition/items/:id]", err)
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 })
  }
}

/** DELETE /api/nutrition/items/[itemId]
 * Removes the food item. If the parent log becomes empty, removes it too.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params

    const item = await db.nutritionFoodItem.findUnique({
      where: { id: itemId },
      include: { log: { select: { userId: true, id: true } } },
    })
    if (!item || item.log.userId !== DEMO_USER_ID) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 })
    }

    await db.nutritionFoodItem.delete({ where: { id: itemId } })

    // Clean up the parent log if it's now empty
    const remaining = await db.nutritionFoodItem.count({ where: { logId: item.log.id } })
    if (remaining === 0) {
      await db.nutritionLog.delete({ where: { id: item.log.id } })
    }

    revalidatePath("/dashboard")
    revalidatePath("/recovery")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/nutrition/items/:id]", err)
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 })
  }
}
