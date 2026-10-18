import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { syncStoredTargets } from "@/lib/targets-server"

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
          startFatFreeMass: true,
          fatFreeMassGoal: true,
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
          fatFreeMassKg: true,
          waistCm: true,
        },
      }),
    ])

    return NextResponse.json({
      metrics,
      goals: {
        startWeight: user?.startWeight ?? null,
        targetWeight: user?.targetWeight ?? null,
        startFatFreeMass: user?.startFatFreeMass ?? null,
        fatFreeMassGoal: user?.fatFreeMassGoal ?? 5.0,
      },
    })
  } catch (err) {
    console.error("[GET /api/metrics]", err)
    return NextResponse.json({ error: "שגיאה בטעינת המדדים" }, { status: 500 })
  }
}

/** POST /api/metrics
 * Body: { weightKg: number, bodyFatPct?: number, waistCm?: number }
 * Creates a BodyMetric entry, backfills baselines on the first entry, and
 * re-derives targets (which use the 7-day TREND weight, not this one reading).
 */
export async function POST(request: Request) {
  try {
    const { weightKg, bodyFatPct, waistCm } = await request.json()

    if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
      return NextResponse.json({ error: "משקל לא תקין" }, { status: 400 })
    }
    if (bodyFatPct !== undefined && bodyFatPct !== null &&
        (typeof bodyFatPct !== "number" || !Number.isFinite(bodyFatPct) || bodyFatPct < 3 || bodyFatPct > 60)) {
      return NextResponse.json({ error: "אחוז שומן לא תקין (3–60)" }, { status: 400 })
    }
    if (waistCm !== undefined && waistCm !== null &&
        (typeof waistCm !== "number" || !Number.isFinite(waistCm) || waistCm < 40 || waistCm > 200)) {
      return NextResponse.json({ error: "היקף מותן לא תקין" }, { status: 400 })
    }

    // Fat-free mass = weight × (1 − BF%). Includes water/bone/organs — it is
    // NOT skeletal muscle, and creatine water shows up here too.
    const fatFreeMassKg =
      typeof bodyFatPct === "number"
        ? Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10
        : null

    const metric = await db.$transaction(async (tx) => {
      const created = await tx.bodyMetric.create({
        data: {
          userId: DEMO_USER_ID,
          weightKg,
          bodyFatPct: typeof bodyFatPct === "number" ? bodyFatPct : null,
          fatFreeMassKg,
          waistCm: typeof waistCm === "number" ? waistCm : null,
          date: new Date(),
        },
      })
      const user = await tx.user.findUnique({
        where: { id: DEMO_USER_ID },
        select: { startWeight: true, startFatFreeMass: true },
      })
      const baseline: { startWeight?: number; startFatFreeMass?: number } = {}
      if (!user?.startWeight) baseline.startWeight = weightKg
      if (!user?.startFatFreeMass && fatFreeMassKg != null) baseline.startFatFreeMass = fatFreeMassKg
      if (Object.keys(baseline).length > 0) {
        await tx.user.update({ where: { id: DEMO_USER_ID }, data: baseline })
      }
      return created
    })

    await syncStoredTargets(DEMO_USER_ID)

    revalidatePath("/dashboard")
    revalidatePath("/recovery")
    return NextResponse.json({ metric }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/metrics]", err)
    return NextResponse.json({ error: "שגיאה בשמירת המדד" }, { status: 500 })
  }
}
