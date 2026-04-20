import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const DEMO_USER_ID = "demo-user"

/** GET /api/metrics
 * Returns the user's weight history (last 30 entries) + goal data.
 */
export async function GET() {
  try {
    const [user, metrics] = await Promise.all([
      db.user.findUnique({
        where: { id: DEMO_USER_ID },
        select: {
          targetWeight: true,
          startWeight: true,
          startMuscleMass: true,
          muscleMassGoal: true,
        },
      }),
      db.bodyMetric.findMany({
        where: { userId: DEMO_USER_ID },
        orderBy: { date: "desc" },
        take: 30,
        select: {
          id: true,
          date: true,
          weightKg: true,
          bodyFatPct: true,
          muscleMassKg: true,
        },
      }),
    ])

    return NextResponse.json({
      metrics,
      goals: {
        startWeight: user?.startWeight ?? null,
        targetWeight: user?.targetWeight ?? null,
        startMuscleMass: user?.startMuscleMass ?? null,
        muscleMassGoal: user?.muscleMassGoal ?? 5.0,
      },
    })
  } catch (err) {
    console.error("[GET /api/metrics]", err)
    return NextResponse.json({ error: "שגיאה בטעינת המדדים" }, { status: 500 })
  }
}

/** POST /api/metrics
 * Body: { weightKg: number, bodyFatPct?: number }
 * Creates a new BodyMetric entry. Also updates User.startWeight if this is the first entry.
 */
export async function POST(request: Request) {
  try {
    const { weightKg, bodyFatPct } = await request.json()

    if (typeof weightKg !== "number" || weightKg <= 0 || weightKg > 300) {
      return NextResponse.json({ error: "משקל לא תקין" }, { status: 400 })
    }

    const muscleMassKg =
      typeof bodyFatPct === "number" && bodyFatPct > 0
        ? Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10
        : null

    const metric = await db.bodyMetric.create({
      data: {
        userId: DEMO_USER_ID,
        weightKg,
        bodyFatPct: typeof bodyFatPct === "number" ? bodyFatPct : null,
        muscleMassKg,
        date: new Date(),
      },
    })

    // If no startWeight set on the user yet, backfill it
    const user = await db.user.findUnique({
      where: { id: DEMO_USER_ID },
      select: { startWeight: true },
    })
    if (!user?.startWeight) {
      await db.user.update({
        where: { id: DEMO_USER_ID },
        data: { startWeight: weightKg },
      })
    }

    return NextResponse.json({ metric }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/metrics]", err)
    return NextResponse.json({ error: "שגיאה בשמירת המדד" }, { status: 500 })
  }
}
