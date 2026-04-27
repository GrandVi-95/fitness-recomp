import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

/** POST /api/exercises
 * Body: { name, primaryMuscle?, equipment?, isCompound? }
 * Creates a new exercise. If the name already exists, returns the existing one.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string
      primaryMuscle?: string
      equipment?: string
      isCompound?: boolean
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "שם תרגיל הוא שדה חובה" }, { status: 400 })
    }

    const name = body.name.trim()

    // Return existing exercise if name already taken
    const existing = await db.exercise.findUnique({
      where: { name },
      select: { id: true, name: true, primaryMuscle: true, equipment: true, isCompound: true },
    })
    if (existing) return NextResponse.json({ exercise: existing })

    const exercise = await db.exercise.create({
      data: {
        name,
        primaryMuscle: body.primaryMuscle ?? "other",
        equipment: body.equipment ?? "barbell",
        isCompound: body.isCompound ?? false,
      },
      select: { id: true, name: true, primaryMuscle: true, equipment: true, isCompound: true },
    })

    return NextResponse.json({ exercise }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/exercises]", err)
    return NextResponse.json({ error: "שגיאה ביצירת תרגיל" }, { status: 500 })
  }
}

/** GET /api/exercises
 * Optional query param `q` — searches exercise name OR primaryMuscle.
 * Returns up to 30 results ordered by isCompound desc, then name asc.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q")?.trim() ?? ""

    const exercises = await db.exercise.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { primaryMuscle: { contains: q } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        primaryMuscle: true,
        equipment: true,
        isCompound: true,
      },
      orderBy: [{ isCompound: "desc" }, { name: "asc" }],
      take: 30,
    })

    return NextResponse.json({ exercises })
  } catch (err) {
    console.error("[GET /api/exercises]", err)
    return NextResponse.json(
      { error: "שגיאה בטעינת תרגילים" },
      { status: 500 },
    )
  }
}
