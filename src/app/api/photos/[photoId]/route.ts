import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** DELETE /api/photos/[photoId]
 * Deletes a progress photo owned by the demo user.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId } = await params

    const photo = await db.progressPhoto.findUnique({
      where: { id: photoId },
      select: { userId: true },
    })

    if (!photo || photo.userId !== DEMO_USER_ID) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 })
    }

    await db.progressPhoto.delete({ where: { id: photoId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/photos/[photoId]]", err)
    return NextResponse.json({ error: "שגיאה במחיקת התמונה" }, { status: 500 })
  }
}
