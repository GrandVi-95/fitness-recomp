import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/** POST /api/gym/sessions/[sessionId]/sets
 * Body: { exerciseId, setNumber, reps, weightKg, rpe?, isWarmup? }
 * Persists a logged set and returns its server-assigned ID.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const body = await request.json()

    const { exerciseId, setNumber, reps, weightKg, rpe, isWarmup } = body

    if (!exerciseId || setNumber == null || reps == null || weightKg == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const setLog = await db.setLog.create({
      data: {
        sessionId,
        exerciseId,
        setNumber,
        reps: Math.round(reps),
        weightKg: Math.round(weightKg * 10) / 10,
        rpe: rpe != null ? Math.min(10, Math.max(1, Math.round(rpe))) : null,
        isWarmup: isWarmup ?? false,
        loggedAt: new Date(),
      },
    })

    return NextResponse.json({ id: setLog.id })
  } catch (err) {
    console.error("[POST /api/gym/sessions/[id]/sets]", err)
    return NextResponse.json({ error: "Failed to save set" }, { status: 500 })
  }
}
