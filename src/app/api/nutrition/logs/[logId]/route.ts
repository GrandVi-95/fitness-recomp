import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { snapshotDayPlan } from "@/lib/targets-server"

const DEMO_USER_ID = "demo-user"

/** PATCH /api/nutrition/logs/[logId]
 * Body: { status: "eaten" } — confirms a planned meal as eaten (it now counts
 * toward today's intake, stamped with the time it was confirmed).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ logId: string }> },
) {
  try {
    const { logId } = await params
    const body = await request.json().catch(() => null)
    if (body?.status !== "eaten") {
      return NextResponse.json({ error: "ניתן רק לסמן ארוחה מתוכננת כנאכלה" }, { status: 400 })
    }
    const { count } = await db.nutritionLog.updateMany({
      where: { id: logId, userId: DEMO_USER_ID, status: "planned" },
      data:  { status: "eaten", date: new Date() },
    })
    if (count === 0) {
      return NextResponse.json({ error: "ארוחה מתוכננת לא נמצאה" }, { status: 404 })
    }
    await snapshotDayPlan(DEMO_USER_ID).catch(() => null)
    revalidatePath("/dashboard")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/nutrition/logs/[logId]]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "שגיאה בעדכון הארוחה" }, { status: 500 })
  }
}

/** DELETE /api/nutrition/logs/[logId] — removes a planned meal (and its items). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ logId: string }> },
) {
  try {
    const { logId } = await params
    // Only planned meals are deleted as a whole here; eaten items keep their
    // existing per-item delete in /api/nutrition/items/[itemId].
    const { count } = await db.nutritionLog.deleteMany({
      where: { id: logId, userId: DEMO_USER_ID, status: "planned" },
    })
    if (count === 0) {
      return NextResponse.json({ error: "ארוחה מתוכננת לא נמצאה" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/nutrition/logs/[logId]]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "שגיאה במחיקת הארוחה" }, { status: 500 })
  }
}
