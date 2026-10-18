import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/photos/[photoId] — serves the image bytes (lazy-loaded by <img>). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId } = await params
    const photo = await db.progressPhoto.findFirst({
      where: { id: photoId, userId: DEMO_USER_ID },
      select: { url: true },
    })
    const match = photo ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(photo.url) : null
    if (!match) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 })
    }
    return new NextResponse(Buffer.from(match[2], "base64"), {
      headers: {
        "Content-Type": match[1],
        // Photos never change once stored — let the browser keep them.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("[GET /api/photos/[photoId]]", err)
    return NextResponse.json({ error: "שגיאה בטעינת התמונה" }, { status: 500 })
  }
}

/** DELETE /api/photos/[photoId]
 * Deletes a progress photo owned by the demo user.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId } = await params
    const { count } = await db.progressPhoto.deleteMany({
      where: { id: photoId, userId: DEMO_USER_ID },
    })
    if (count === 0) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/photos/[photoId]]", err)
    return NextResponse.json({ error: "שגיאה במחיקת התמונה" }, { status: 500 })
  }
}
