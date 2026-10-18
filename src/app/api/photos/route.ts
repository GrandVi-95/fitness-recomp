import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ValidationError, readJsonBody } from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

// Photos are resized client-side (max 1280px JPEG) before upload, so a real
// upload is a few hundred KB; this cap stops oversized blobs reaching the DB.
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024
const MAX_BODY_BYTES = Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4096
const PAGE_SIZE = 24
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/

/** GET /api/photos?cursor=<id>
 * Newest-first metadata page. Image bytes are NOT included — each photo is
 * served lazily from /api/photos/[photoId].
 */
export async function GET(request: Request) {
  try {
    const cursor = new URL(request.url).searchParams.get("cursor")
    const rows = await db.progressPhoto.findMany({
      where: { userId: DEMO_USER_ID },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, date: true, angle: true, notes: true },
    })
    const page = rows.slice(0, PAGE_SIZE)
    return NextResponse.json({
      photos: page.map((p) => ({ ...p, url: `/api/photos/${p.id}` })),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    })
  } catch (err) {
    console.error("[GET /api/photos]", err)
    return NextResponse.json({ error: "שגיאה בטעינת התמונות" }, { status: 500 })
  }
}

/** POST /api/photos
 * Body: { imageBase64: "data:image/(jpeg|png|webp);base64,…", angle?, notes? }
 */
export async function POST(request: Request) {
  try {
    let body: { imageBase64?: unknown; angle?: unknown; notes?: unknown }
    try {
      body = await readJsonBody(request, MAX_BODY_BYTES)
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: "התמונה גדולה מדי" }, { status: 413 })
      }
      throw err
    }
    const { imageBase64, angle, notes } = body

    const match = typeof imageBase64 === "string" ? DATA_URL_RE.exec(imageBase64) : null
    if (!match) {
      return NextResponse.json({ error: "נתוני תמונה לא תקינים (JPEG/PNG/WebP בלבד)" }, { status: 400 })
    }
    if ((match[2].length * 3) / 4 > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "התמונה גדולה מדי" }, { status: 413 })
    }

    const validAngles = ["front", "back", "side_left", "side_right"]
    const resolvedAngle = typeof angle === "string" && validAngles.includes(angle) ? angle : "front"

    const photo = await db.progressPhoto.create({
      data: {
        userId: DEMO_USER_ID,
        url: imageBase64 as string,
        angle: resolvedAngle,
        notes: typeof notes === "string" ? notes.slice(0, 500) : null,
        date: new Date(),
      },
      select: { id: true, date: true, angle: true, notes: true },
    })

    return NextResponse.json({ photo: { ...photo, url: `/api/photos/${photo.id}` } }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/photos]", err)
    return NextResponse.json({ error: "שגיאה בשמירת התמונה" }, { status: 500 })
  }
}
