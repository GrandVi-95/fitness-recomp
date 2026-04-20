import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/photos
 * Returns the user's progress photos ordered newest-first.
 */
export async function GET() {
  try {
    const photos = await db.progressPhoto.findMany({
      where: { userId: DEMO_USER_ID },
      orderBy: { date: "desc" },
      select: { id: true, date: true, url: true, angle: true, notes: true },
    })
    return NextResponse.json({ photos })
  } catch (err) {
    console.error("[GET /api/photos]", err)
    return NextResponse.json({ error: "שגיאה בטעינת התמונות" }, { status: 500 })
  }
}

/** POST /api/photos
 * Body: { imageBase64: string, angle?: string, notes?: string }
 * Stores the photo as a base64 data URL in SQLite.
 */
export async function POST(request: Request) {
  try {
    const { imageBase64, angle, notes } = await request.json()

    if (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image/")) {
      return NextResponse.json({ error: "נתוני תמונה לא תקינים" }, { status: 400 })
    }

    const validAngles = ["front", "back", "side_left", "side_right"]
    const resolvedAngle = validAngles.includes(angle) ? angle : "front"

    const photo = await db.progressPhoto.create({
      data: {
        userId: DEMO_USER_ID,
        url: imageBase64,
        angle: resolvedAngle,
        notes: notes ?? null,
        date: new Date(),
      },
    })

    return NextResponse.json({ photo }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/photos]", err)
    return NextResponse.json({ error: "שגיאה בשמירת התמונה" }, { status: 500 })
  }
}
