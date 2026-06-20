import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** DELETE /api/recipes/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existing = await db.recipe.findFirst({ where: { id, userId: DEMO_USER_ID } })
    if (!existing) {
      return NextResponse.json({ error: "מתכון לא נמצא" }, { status: 404 })
    }

    await db.recipe.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/recipes/[id]]", err)
    return NextResponse.json({ error: "שגיאה במחיקת המתכון" }, { status: 500 })
  }
}
