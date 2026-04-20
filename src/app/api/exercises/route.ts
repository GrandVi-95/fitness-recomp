import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

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
