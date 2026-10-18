import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { encryptSecret } from "@/lib/secrets"
import { computeCalorieTarget, getTrendWeight, resolveTargets, syncStoredTargets } from "@/lib/targets-server"
import {
  ValidationError,
  optBool,
  optInt,
  optNum,
  optOneOf,
  optStr,
} from "@/lib/validate"
import {
  CREATINE_CALIBRATION_DAYS,
  GOALS,
  checkMacroFeasibility,
  isCreatineCalibrationEffective,
  normalizeGoal,
  resolveFatForBudget,
} from "@/utils/nutrition-math"

const DEMO_USER_ID = "demo-user"

const GENDERS = ["male", "female"] as const
const AI_PROVIDERS = ["anthropic", "openai", "gemini"] as const
const DIETS = ["vegetarian", "vegan", "pescatarian", "omnivore"] as const

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
    const t = await resolveTargets(DEMO_USER_ID)

    return NextResponse.json({
      name:                user.name ?? "",
      targetCalories:      t.base.calories,
      targetProtein:       t.base.protein,
      targetFats:          t.base.fat,
      targetCarbs:         t.base.carbs,
      latestWeight,
      trendWeight:         t.weightKg,
      calculatedProtein:   t.weightKg ? Math.round(t.weightKg * 2.2) : null,
      calculatedCalories:  t.weightKg ? t.base.calories : null,
      aiProvider:          s?.aiProvider         ?? "anthropic",
      aiApiKeySet:         !!(s?.aiApiKey),
      autoProteinGoal:     s?.autoProteinGoal    ?? true,
      autoCalorieGoal:     s?.autoCalorieGoal    ?? true,
      smartAlertsEnabled:  s?.smartAlertsEnabled ?? true,
      showWeeklySummary:   s?.showWeeklySummary  ?? true,
      height:              s?.height             ?? 183,
      age:                 s?.age                ?? 31,
      gender:              s?.gender             ?? "male",
      activityMultiplier:  s?.activityMultiplier ?? 1.45,
      dietaryPreference:   s?.dietaryPreference  ?? "vegetarian",
      reportEnabled:       s?.reportEnabled      ?? true,
      reportEmail:         s?.reportEmail        ?? "",
      calorieAdjustmentOffset: s?.calorieAdjustmentOffset ?? 0,
      vacationMode:        s?.vacationMode       ?? false,
      creatineCalibrationActive: isCreatineCalibrationEffective(
        s?.creatineCalibrationActive,
        s?.creatineStartedAt,
      ),
      creatineStartedAt:   s?.creatineStartedAt ?? null,
      creatineCalibrationDays: CREATINE_CALIBRATION_DAYS,
      goal:                normalizeGoal(s?.goal),
      trainingDaysPerWeek: s?.trainingDaysPerWeek ?? 4,
    })
  } catch (err) {
    console.error("[GET /api/settings]", err)
    return NextResponse.json({ error: "שגיאה בטעינת ההגדרות" }, { status: 500 })
  }
}

/** PUT /api/settings — validates the whole body first, then writes atomically. */
export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 })
    }

    // ── 1. Validate everything before any write ──────────────────────────────
    let v
    try {
      v = {
        name:               optStr(body.name, "name", 60),
        // Manual targets are only validated (and used) when their auto flag is off.
        targetCalories:     body.autoCalorieGoal === true ? undefined : optNum(body.targetCalories, "targetCalories", 1000, 6000),
        targetProtein:      body.autoProteinGoal === true ? undefined : optNum(body.targetProtein, "targetProtein", 30, 400),
        weight:             optNum(body.weight, "weight", 30, 300),
        height:             optNum(body.height, "height", 120, 230),
        age:                optInt(body.age, "age", 14, 100),
        gender:             optOneOf(body.gender, "gender", GENDERS),
        activityMultiplier: optNum(body.activityMultiplier, "activityMultiplier", 1.2, 1.9),
        autoCalorieGoal:    optBool(body.autoCalorieGoal, "autoCalorieGoal"),
        aiProvider:         optOneOf(body.aiProvider, "aiProvider", AI_PROVIDERS),
        aiApiKey:           body.aiApiKey === null ? null : optStr(body.aiApiKey, "aiApiKey", 300),
        autoProteinGoal:    optBool(body.autoProteinGoal, "autoProteinGoal"),
        smartAlertsEnabled: optBool(body.smartAlertsEnabled, "smartAlertsEnabled"),
        showWeeklySummary:  optBool(body.showWeeklySummary, "showWeeklySummary"),
        dietaryPreference:  optOneOf(body.dietaryPreference, "dietaryPreference", DIETS),
        reportEnabled:      optBool(body.reportEnabled, "reportEnabled"),
        reportEmail:        optStr(body.reportEmail, "reportEmail", 200),
        vacationMode:       optBool(body.vacationMode, "vacationMode"),
        creatineCalibrationActive: optBool(body.creatineCalibrationActive, "creatineCalibrationActive"),
        goal:               optOneOf(body.goal, "goal", GOALS),
        trainingDaysPerWeek: optInt(body.trainingDaysPerWeek, "trainingDaysPerWeek", 0, 7),
      }
      if (v.reportEmail && v.reportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.reportEmail.trim())) {
        throw new ValidationError("reportEmail: invalid address")
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: `ערך לא תקין — ${err.message}` }, { status: 400 })
      }
      throw err
    }

    const [existing, currentUser] = await Promise.all([
      db.userSettings.findUnique({ where: { userId: DEMO_USER_ID } }),
      db.user.findUnique({ where: { id: DEMO_USER_ID }, select: { targetCalories: true, targetProtein: true, startWeight: true } }),
    ])

    // ── 2. Feasibility of MANUAL targets: protein + minimum fat must fit ────
    const effectiveAutoCalorie = v.autoCalorieGoal ?? existing?.autoCalorieGoal ?? true
    const effectiveAutoProtein = v.autoProteinGoal ?? existing?.autoProteinGoal ?? true
    if (!effectiveAutoCalorie || !effectiveAutoProtein) {
      const weight = v.weight ?? (await getTrendWeight(DEMO_USER_ID))
      if (weight) {
        // Auto calories are computed exactly as the resolver will.
        const calories = effectiveAutoCalorie
          ? computeCalorieTarget({
              autoCalorieGoal: true,
              storedCalories: null,
              weightKg: weight,
              heightCm: v.height ?? existing?.height ?? 183,
              age: v.age ?? existing?.age ?? 31,
              gender: v.gender ?? existing?.gender ?? "male",
              activityMultiplier: v.activityMultiplier ?? existing?.activityMultiplier ?? 1.45,
              offset: existing?.calorieAdjustmentOffset ?? 0,
              goal: normalizeGoal(v.goal ?? existing?.goal),
            })
          : (v.targetCalories ?? currentUser?.targetCalories ?? null)
        const protein = effectiveAutoProtein ? Math.round(weight * 2.2) : (v.targetProtein ?? currentUser?.targetProtein ?? null)
        if (calories != null && protein != null) {
          const fat = resolveFatForBudget(calories, protein, weight)
          const { feasible, remainderKcal } = checkMacroFeasibility(calories, protein, fat)
          if (!feasible) {
            return NextResponse.json(
              {
                error: `היעדים לא אפשריים: ${protein} גר' חלבון ו-${fat} גר' שומן כבר דורשים ${calories - remainderKcal} קק"ל — יותר מיעד הקלוריות (${calories}).`,
              },
              { status: 400 },
            )
          }
        }
      }
    }

    // ── 3. Write atomically ─────────────────────────────────────────────────
    // "Turned on" also covers re-enabling after the window expired (the stored
    // flag may still be true while GET already reports it as off).
    const creatineTurnedOn =
      v.creatineCalibrationActive === true &&
      !isCreatineCalibrationEffective(existing?.creatineCalibrationActive, existing?.creatineStartedAt)
    const settingsData = {
      ...(v.aiProvider           !== undefined ? { aiProvider: v.aiProvider } : {}),
      ...(v.aiApiKey             !== undefined ? { aiApiKey: v.aiApiKey ? encryptSecret(v.aiApiKey.trim()) : null } : {}),
      ...(v.autoProteinGoal      !== undefined ? { autoProteinGoal: v.autoProteinGoal } : {}),
      ...(v.smartAlertsEnabled   !== undefined ? { smartAlertsEnabled: v.smartAlertsEnabled } : {}),
      ...(v.showWeeklySummary    !== undefined ? { showWeeklySummary: v.showWeeklySummary } : {}),
      ...(v.height               !== undefined ? { height: Math.round(v.height) } : {}),
      ...(v.age                  !== undefined ? { age: v.age } : {}),
      ...(v.gender               !== undefined ? { gender: v.gender } : {}),
      ...(v.activityMultiplier   !== undefined ? { activityMultiplier: v.activityMultiplier } : {}),
      ...(v.autoCalorieGoal      !== undefined ? { autoCalorieGoal: v.autoCalorieGoal } : {}),
      ...(v.dietaryPreference    !== undefined ? { dietaryPreference: v.dietaryPreference } : {}),
      ...(v.reportEnabled        !== undefined ? { reportEnabled: v.reportEnabled } : {}),
      ...(v.reportEmail          !== undefined ? { reportEmail: v.reportEmail.trim() || null } : {}),
      ...(v.vacationMode         !== undefined ? { vacationMode: v.vacationMode } : {}),
      ...(v.goal                 !== undefined ? { goal: v.goal } : {}),
      ...(v.trainingDaysPerWeek  !== undefined ? { trainingDaysPerWeek: v.trainingDaysPerWeek } : {}),
      ...(v.creatineCalibrationActive !== undefined
        ? {
            creatineCalibrationActive: v.creatineCalibrationActive,
            ...(creatineTurnedOn ? { creatineStartedAt: new Date() } : {}),
            ...(v.creatineCalibrationActive === false ? { creatineStartedAt: null } : {}),
          }
        : {}),
    }

    await db.$transaction(async (tx) => {
      if (v.weight !== undefined) {
        await tx.bodyMetric.create({ data: { userId: DEMO_USER_ID, weightKg: v.weight, date: new Date() } })
        if (!currentUser?.startWeight) {
          await tx.user.update({ where: { id: DEMO_USER_ID }, data: { startWeight: v.weight } })
        }
      }

      const userData: { name?: string; targetCalories?: number; targetProtein?: number } = {}
      if (v.name !== undefined) userData.name = v.name.trim()
      // Manual targets are stored only when the matching auto flag is off;
      // auto targets are re-derived below by syncStoredTargets.
      if (!effectiveAutoCalorie && v.targetCalories !== undefined) userData.targetCalories = Math.round(v.targetCalories)
      if (!effectiveAutoProtein && v.targetProtein !== undefined) userData.targetProtein = Math.round(v.targetProtein)
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: DEMO_USER_ID }, data: userData })
      }

      await tx.userSettings.upsert({
        where: { userId: DEMO_USER_ID },
        update: settingsData,
        create: { userId: DEMO_USER_ID, ...settingsData },
      })
    })

    // ── 4. Re-derive the whole target set (calories, protein, fat, carbs) ───
    await syncStoredTargets(DEMO_USER_ID)
    revalidatePath("/dashboard")

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[PUT /api/settings]", msg)
    return NextResponse.json({ error: "שגיאה בשמירת ההגדרות" }, { status: 500 })
  }
}
