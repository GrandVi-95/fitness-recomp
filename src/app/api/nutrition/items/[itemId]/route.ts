import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** PUT /api/nutrition/items/[itemId]
 * Body: { quantity: number }
 * Scales all macros proportionally to the new quantity.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params
    const { quantity } = await request.json()

    if (typeof quantity !== "number" || quantity <= 0) {
      return NextResponse.json({ error: "כמות לא תקינה" }, { status: 400 })
    }

    const item = await db.nutritionFoodItem.findUnique({
      where: { id: itemId },
      include: { log: { select: { userId: true } } },
    })
    if (!item || item.log.userId !== DEMO_USER_ID) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 })
    }

    const ratio = quantity / item.quantity
    const updated = await db.nutritionFoodItem.update({
      where: { id: itemId },
      data: {
        quantity,
        calories: item.calories * ratio,
        protein:  item.protein  * ratio,
        carbs:    item.carbs    * ratio,
        fat:      item.fat      * ratio,
        fiber:    item.fiber    * ratio,
      },
    })

    revalidatePath("/dashboard")
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
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/nutrition/items/:id]", err)
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 })
  }
}
