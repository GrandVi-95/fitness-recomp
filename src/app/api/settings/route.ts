import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { calculateBMR, calculateTDEE, calculateAutoProtein, calculateTargetFats, calculateTargetCarbs } from "@/lib/utils"

const DEMO_USER_ID = "demo-user"

/** GET /api/settings */
export async function GET() {
  try {
    const user = await db.user.findUnique({
      where: { id: DEMO_USER_ID },
      include: {
        userSettings: true,
        bodyMetrics: { orderBy: { date: "desc" }, take: 1 },
      },
    })

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const latestWeight = user.bodyMetrics[0]?.weightKg ?? null
    const s = user.userSettings

    // Body-profile defaults (used when UserSettings row doesn't exist yet)
    const height             = s?.height             ?? 183
    const age                = s?.age                ?? 31
    const gender             = s?.gender             ?? "male"
    const activityMultiplier = s?.activityMultiplier ?? 1.45
    const autoCalorieGoal    = s?.autoCalorieGoal    ?? true
    const autoProteinGoal    = s?.autoProteinGoal    ?? true

    // Derived auto-targets (for display / preview in the UI)
    const calculatedProtein = latestWeight ? calculateAutoProtein(latestWeight) : null
    const calculatedCalories = latestWeight
      ? calculateTDEE(calculateBMR(latestWeight, height, age, gender), activityMultiplier)
      : null

    return NextResponse.json({
      name:                user.name ?? "",
      targetCalories:      user.targetCalories,
      targetProtein:       user.targetProtein,
      targetFats:          user.targetFats,
      targetCarbs:         user.targetCarbs,
      latestWeight,
      calculatedProtein,
      calculatedCalories,
      aiProvider:          s?.aiProvider         ?? "anthropic",
      aiApiKeySet:         !!(s?.aiApiKey),
      autoProteinGoal,
      autoCalorieGoal,
      smartAlertsEnabled:  s?.smartAlertsEnabled ?? true,
      showWeeklySummary:   s?.showWeeklySummary  ?? true,
      height,
      age,
      gender,
      activityMultiplier,
      dietaryPreference:   s?.dietaryPreference  ?? "vegetarian",
    })
  } catch (err) {
    console.error("[GET /api/settings]", err)
    return NextResponse.json({ error: "שגיאה בטעינת ההגדרות" }, { status: 500 })
  }
}

interface SettingsBody {
  name?: string
  // Manual override targets (used when auto flags are false)
  targetCalories?: number
  targetProtein?: number
  // Body profile
  weight?: number
  height?: number
  age?: number
  gender?: string
  activityMultiplier?: number
  autoCalorieGoal?: boolean
  // AI
  aiProvider?: string
  aiApiKey?: string | null
  // Other
  autoProteinGoal?: boolean
  smartAlertsEnabled?: boolean
  showWeeklySummary?: boolean
  dietaryPreference?: string
}

/** PUT /api/settings */
export async function PUT(request: Request) {
  try {
    const body: SettingsBody = await request.json()
    const {
      name,
      targetCalories,
      targetProtein,
      weight,
      height,
      age,
      gender,
      activityMultiplier,
      autoCalorieGoal,
      aiProvider,
      aiApiKey,
      autoProteinGoal,
      smartAlertsEnabled,
      showWeeklySummary,
      dietaryPreference,
    } = body

    // ── 1. Validate manual ranges ────────────────────────────────────────────
    if (targetCalories !== undefined && (targetCalories < 1000 || targetCalories > 10000)) {
      return NextResponse.json(
        { error: 'יעד קלוריות חייב להיות בין 1,000 ל-10,000 קק"ל' },
        { status: 400 },
      )
    }
    if (targetProtein !== undefined && (targetProtein < 30 || targetProtein > 500)) {
      return NextResponse.json(
        { error: "יעד חלבון חייב להיות בין 30 ל-500 גר'" },
        { status: 400 },
      )
    }
    if (weight !== undefined && (typeof weight !== "number" || weight <= 0 || weight > 300)) {
      return NextResponse.json({ error: "משקל לא תקין" }, { status: 400 })
    }

    // ── 2. If a new weight was supplied, log it as a BodyMetric ──────────────
    if (typeof weight === "number") {
      await db.bodyMetric.create({
        data: { userId: DEMO_USER_ID, weightKg: weight, date: new Date() },
      })
      // Backfill startWeight if this is the first entry
      const user = await db.user.findUnique({
        where: { id: DEMO_USER_ID },
        select: { startWeight: true },
      })
      if (!user?.startWeight) {
        await db.user.update({ where: { id: DEMO_USER_ID }, data: { startWeight: weight } })
      }
    }

    // ── 3. Determine effective body-profile values for auto-calculation ───────
    //   Use the incoming values if provided, else fall back to stored settings.
    const [existing, currentUser] = await Promise.all([
      db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } }),
      db.user.findUnique({ where: { id: DEMO_USER_ID }, select: { targetCalories: true, targetProtein: true } }),
    ])

    const effectiveHeight             = height             ?? existing?.height             ?? 183
    const effectiveAge                = age                ?? existing?.age                ?? 31
    const effectiveGender             = gender             ?? existing?.gender             ?? "male"
    const effectiveActivityMultiplier = activityMultiplier ?? existing?.activityMultiplier ?? 1.45
    const effectiveAutoCalorie        = autoCalorieGoal    ?? existing?.autoCalorieGoal    ?? true
    const effectiveAutoProtein        = autoProteinGoal    ?? existing?.autoProteinGoal    ?? true

    // Effective weight: new value supplied → fall back to latest stored BodyMetric
    let effectiveWeight: number | null = typeof weight === "number" ? weight : null
    if (effectiveWeight === null) {
      const latest = await db.bodyMetric.findFirst({
        where: { userId: DEMO_USER_ID },
        orderBy: { date: "desc" },
        select: { weightKg: true },
      })
      effectiveWeight = latest?.weightKg ?? null
    }

    // ── 4. Build User-level updates (name + computed targets) ────────────────
    const userUpdates: { name?: string; targetCalories?: number; targetProtein?: number; targetFats?: number; targetCarbs?: number } = {}

    if (name !== undefined) userUpdates.name = name.trim()

    if (effectiveAutoCalorie && effectiveWeight !== null) {
      const bmr = calculateBMR(effectiveWeight, effectiveHeight, effectiveAge, effectiveGender)
      userUpdates.targetCalories = calculateTDEE(bmr, effectiveActivityMultiplier)
    } else if (!effectiveAutoCalorie && targetCalories !== undefined) {
      userUpdates.targetCalories = Math.round(targetCalories)
    }

    if (effectiveAutoProtein && effectiveWeight !== null) {
      userUpdates.targetProtein = calculateAutoProtein(effectiveWeight)
    } else if (!effectiveAutoProtein && targetProtein !== undefined) {
      userUpdates.targetProtein = Math.round(targetProtein)
    }

    // Always recompute fats/carbs whenever calories or protein changes
    if (userUpdates.targetCalories !== undefined || userUpdates.targetProtein !== undefined) {
      const calForMacros = userUpdates.targetCalories ?? currentUser?.targetCalories ?? 2500
      const protForMacros = userUpdates.targetProtein ?? currentUser?.targetProtein ?? 180
      userUpdates.targetFats = calculateTargetFats(calForMacros)
      userUpdates.targetCarbs = calculateTargetCarbs(calForMacros, protForMacros, userUpdates.targetFats)
    }

    if (Object.keys(userUpdates).length > 0) {
      await db.user.update({ where: { id: DEMO_USER_ID }, data: userUpdates })
    }

    // ── 5. Upsert UserSettings ───────────────────────────────────────────────
    const settingsData = {
      ...(aiProvider             !== undefined ? { aiProvider }                         : {}),
      ...(aiApiKey               !== undefined ? { aiApiKey: aiApiKey || null }         : {}),
      ...(autoProteinGoal        !== undefined ? { autoProteinGoal }                    : {}),
      ...(smartAlertsEnabled     !== undefined ? { smartAlertsEnabled }                 : {}),
      ...(showWeeklySummary      !== undefined ? { showWeeklySummary }                  : {}),
      ...(height                 !== undefined ? { height: Math.round(height) }         : {}),
      ...(age                    !== undefined ? { age: Math.round(age) }               : {}),
      ...(gender                 !== undefined ? { gender }                              : {}),
      ...(activityMultiplier     !== undefined ? { activityMultiplier }                 : {}),
      ...(autoCalorieGoal        !== undefined ? { autoCalorieGoal }                    : {}),
      ...(dietaryPreference      !== undefined ? { dietaryPreference }                  : {}),
    }

    if (Object.keys(settingsData).length > 0) {
      if (existing) {
        await db.userSettings.update({ where: { userId: DEMO_USER_ID }, data: settingsData })
      } else {
        await db.userSettings.create({ data: { userId: DEMO_USER_ID, ...settingsData } })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[PUT /api/settings]", msg)
    return NextResponse.json({ error: "שגיאה בשמירת ההגדרות" }, { status: 500 })
  }
}
