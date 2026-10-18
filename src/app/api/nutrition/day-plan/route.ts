import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { snapshotDayPlan } from "@/lib/targets-server"

const DEMO_USER_ID = "demo-user"

/** PUT /api/nutrition/day-plan
 * Body: { isTrainingDay: boolean }
 * Persists today's training/rest choice server-side (so every device and
 * screen agrees) and returns today's resolved targets.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (typeof body?.isTrainingDay !== "boolean") {
      return NextResponse.json({ error: "isTrainingDay חייב להיות true/false" }, { status: 400 })
    }
    const t = await snapshotDayPlan(DEMO_USER_ID, undefined, body.isTrainingDay)
    revalidatePath("/dashboard")
    return NextResponse.json({
      isTrainingDay: t.isTrainingDay,
      dayTypeSource: t.dayTypeSource,
      targets: t.day,
      baseTargets: t.base,
      sugarReferenceG: t.sugarReferenceG,
    })
  } catch (err) {
    console.error("[PUT /api/nutrition/day-plan]", err)
    return NextResponse.json({ error: "שגיאה בשמירת סוג היום" }, { status: 500 })
  }
}
