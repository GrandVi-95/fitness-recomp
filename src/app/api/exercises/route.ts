import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { optBool, optOneOf, readJsonBody, str, ValidationError } from "@/lib/validate"

const MUSCLES = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "core", "legs", "other",
] as const
const EQUIPMENT = [
  "barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "household",
] as const

/** POST /api/exercises
 * Body: { name, primaryMuscle?, equipment?, isCompound? }
 * Creates a new exercise. If the name already exists, returns the existing one.
 */
export async function POST(request: NextRequest) {
  try {
    let body: {
      name: string
      primaryMuscle?: string
      equipment?: string
      isCompound?: boolean
    }
    try {
      const raw = await readJsonBody<Record<string, unknown>>(request, 2_000)
      body = {
        name: str(raw?.name ?? "", "name", 100),
        primaryMuscle: optOneOf(raw?.primaryMuscle, "primaryMuscle", MUSCLES),
        equipment: optOneOf(raw?.equipment, "equipment", EQUIPMENT),
        isCompound: optBool(raw?.isCompound, "isCompound"),
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    if (!body.name.trim()) {
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
    const q = (searchParams.get("q") ?? "").trim().slice(0, 100)

    const exercises = await db.exercise.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { primaryMuscle: { contains: q, mode: "insensitive" } },
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
