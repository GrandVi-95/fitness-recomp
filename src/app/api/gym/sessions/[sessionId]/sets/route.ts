import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"
import {
  bool,
  int,
  num,
  optInt,
  optStr,
  readJsonBody,
  str,
  ValidationError,
} from "@/lib/validate"

const DEMO_USER_ID = "demo-user"

/** POST /api/gym/sessions/[sessionId]/sets
 * Body: { exerciseId, setNumber, reps, weightKg, rpe?, isWarmup?, durationSecs?, clientId? }
 * Persists a logged set and returns its server-assigned ID.
 *
 * `clientId` is a client-generated idempotency key: a retried / offline-synced
 * POST with the same clientId returns the SAME row instead of a duplicate.
 * Sets may arrive after the session was finished (late offline sync) — they
 * are real data and are accepted, as long as they pass ownership checks.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params

    // ── 1. Validate the whole body before touching the DB ──────────────
    let data: {
      exerciseId: string
      setNumber: number
      reps: number
      weightKg: number
      rpe: number | null
      isWarmup: boolean
      durationSecs: number | null
      clientId: string | null
    }
    try {
      const body = await readJsonBody<Record<string, unknown>>(request, 4_000)
      if (!body || typeof body !== "object") throw new ValidationError("invalid body")
      const durationSecs = optInt(body.durationSecs, "durationSecs", 0, 36_000)
      data = {
        exerciseId: str(body.exerciseId, "exerciseId", 64, 1),
        setNumber: int(body.setNumber, "setNumber", 1, 100),
        reps: int(body.reps, "reps", 0, 1000),
        weightKg: Math.round(num(body.weightKg, "weightKg", 0, 1000) * 10) / 10,
        rpe: optInt(body.rpe, "rpe", 1, 10) ?? null,
        isWarmup: body.isWarmup == null ? false : bool(body.isWarmup, "isWarmup"),
        durationSecs: durationSecs && durationSecs > 0 ? durationSecs : null,
        clientId: optStr(body.clientId, "clientId", 64) || null,
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    // ── 2. Ownership: session belongs to the user ──────────────────────
    const session = await db.workoutSession.findFirst({
      where: { id: sessionId, userId: DEMO_USER_ID },
      select: { id: true, workoutId: true },
    })
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // ── 3. Membership: exercise is part of this session's workout ──────
    // (or already has sets in this session — the plan may have been edited
    // mid-session, removing the WorkoutExercise row)
    const [inWorkout, alreadyLogged] = await Promise.all([
      db.workoutExercise.findFirst({
        where: { workoutId: session.workoutId, exerciseId: data.exerciseId },
        select: { id: true },
      }),
      db.setLog.findFirst({
        where: { sessionId, exerciseId: data.exerciseId },
        select: { id: true },
      }),
    ])
    if (!inWorkout && !alreadyLogged) {
      return NextResponse.json(
        { error: "Exercise is not part of this workout" },
        { status: 400 },
      )
    }

    const createData = {
      sessionId,
      exerciseId: data.exerciseId,
      setNumber: data.setNumber,
      reps: data.reps,
      weightKg: data.weightKg,
      rpe: data.rpe,
      isWarmup: data.isWarmup,
      durationSecs: data.durationSecs,
      clientId: data.clientId,
      loggedAt: new Date(),
    }

    // ── 4. Write (idempotent when clientId is present) ─────────────────
    if (!data.clientId) {
      const setLog = await db.setLog.create({ data: createData })
      return NextResponse.json({ id: setLog.id })
    }

    let row: { id: string; sessionId: string }
    try {
      row = await db.setLog.upsert({
        where: { clientId: data.clientId },
        create: createData,
        update: {}, // retry → keep the first write untouched
        select: { id: true, sessionId: true },
      })
    } catch (err) {
      // Two concurrent retries can race on the unique index — the loser
      // simply reads back the winner's row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await db.setLog.findUnique({
          where: { clientId: data.clientId },
          select: { id: true, sessionId: true },
        })
        if (!existing) throw err
        row = existing
      } else {
        throw err
      }
    }

    // A clientId can never be "moved" to a different session.
    if (row.sessionId !== sessionId) {
      return NextResponse.json({ error: "clientId already used" }, { status: 409 })
    }

    return NextResponse.json({ id: row.id })
  } catch (err) {
    console.error("[POST /api/gym/sessions/[id]/sets]", err)
    return NextResponse.json({ error: "Failed to save set" }, { status: 500 })
  }
}
