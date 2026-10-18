-- DropForeignKey
ALTER TABLE "WorkoutSession" DROP CONSTRAINT "WorkoutSession_workoutId_fkey";

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "creatineStartedAt" TIMESTAMP(3),
ADD COLUMN     "goal" TEXT NOT NULL DEFAULT 'lean_gain',
ADD COLUMN     "lastReportWeekStart" TEXT,
ADD COLUMN     "trainingDaysPerWeek" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable (null = unknown, distinct from a measured 0)
ALTER TABLE "NutritionFoodItem" ALTER COLUMN "fiber" DROP NOT NULL,
ALTER COLUMN "sugar" DROP NOT NULL,
ALTER COLUMN "saturatedFat" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SetLog" ADD COLUMN     "clientId" TEXT;

-- AlterTable (cycleKey backfilled from id so existing check-ins stay unique)
ALTER TABLE "CheckIn" ADD COLUMN     "adherencePct" DOUBLE PRECISION,
ADD COLUMN     "rateVsGoal" TEXT,
ADD COLUMN     "cycleKey" TEXT;
UPDATE "CheckIn" SET "cycleKey" = "id" WHERE "cycleKey" IS NULL;
ALTER TABLE "CheckIn" ALTER COLUMN "cycleKey" SET NOT NULL;

-- CreateTable
CREATE TABLE "DayPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isTrainingDay" BOOLEAN NOT NULL DEFAULT true,
    "explicitDayType" BOOLEAN NOT NULL DEFAULT false,
    "targetCalories" INTEGER NOT NULL,
    "targetProtein" INTEGER NOT NULL,
    "targetCarbs" INTEGER NOT NULL,
    "targetFats" INTEGER NOT NULL,

    CONSTRAINT "DayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayPlan_userId_date_key" ON "DayPlan"("userId", "date");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_completedAt_idx" ON "WorkoutSession"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "WorkoutSession_workoutId_completedAt_idx" ON "WorkoutSession"("workoutId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SetLog_clientId_key" ON "SetLog"("clientId");

-- CreateIndex
CREATE INDEX "SetLog_sessionId_idx" ON "SetLog"("sessionId");

-- CreateIndex
CREATE INDEX "SetLog_exerciseId_loggedAt_idx" ON "SetLog"("exerciseId", "loggedAt");

-- CreateIndex
CREATE INDEX "NutritionLog_userId_date_idx" ON "NutritionLog"("userId", "date");

-- CreateIndex
CREATE INDEX "BodyMetric_userId_date_idx" ON "BodyMetric"("userId", "date");

-- CreateIndex
CREATE INDEX "CheckIn_userId_date_idx" ON "CheckIn"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_userId_cycleKey_key" ON "CheckIn"("userId", "cycleKey");

-- CreateIndex
CREATE INDEX "ProgressPhoto_userId_date_idx" ON "ProgressPhoto"("userId", "date");

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPlan" ADD CONSTRAINT "DayPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (null = unknown)
ALTER TABLE "Recipe" ALTER COLUMN "totalSugar" DROP NOT NULL;
ALTER TABLE "SavedProtein" ADD COLUMN "sugarPerScoop" DOUBLE PRECISION;

-- ── Data fixes (v1.17.0 review) ────────────────────────────────────────────
-- Creatine calibration already on: start its expiry window now (null would never expire)
UPDATE "UserSettings" SET "creatineStartedAt" = NOW()
WHERE "creatineCalibrationActive" = true AND "creatineStartedAt" IS NULL;
-- Seitan: existing row held DRY gluten values -> repurpose as prepared seitan
UPDATE "Food" SET "name"='Seitan (prepared)', "category"='legumes', "caloriesPer100"=150, "proteinPer100"=25, "carbsPer100"=6, "fatPer100"=2, "fiberPer100"=0.6,
  "aliases"='["seitan","wheat meat","seitan strips","סייטן"]'
WHERE "name"='Seitan' AND NOT EXISTS (SELECT 1 FROM "Food" WHERE "name"='Seitan (prepared)');
INSERT INTO "Food" ("id","name","category","isVegetarian","caloriesPer100","proteinPer100","carbsPer100","fatPer100","fiberPer100","aliases")
VALUES (gen_random_uuid()::text,'Vital Wheat Gluten (dry)','protein_supplement',true,370,75,14,1.9,0.6,'["vital wheat gluten","wheat gluten","gluten flour","גלוטן חיטה"]')
ON CONFLICT ("name") DO NOTHING;
-- Oats: dry values; porridge aliases move to cooked oatmeal
UPDATE "Food" SET "name"='Oats (dry)', "aliases"='["oats","rolled oats","dry oats","oat flakes","שיבולת שועל"]'
WHERE "name"='Oats' AND NOT EXISTS (SELECT 1 FROM "Food" WHERE "name"='Oats (dry)');
INSERT INTO "Food" ("id","name","category","isVegetarian","caloriesPer100","proteinPer100","carbsPer100","fatPer100","fiberPer100","aliases")
VALUES (gen_random_uuid()::text,'Oatmeal (cooked with water)','grain',true,71,2.5,12,1.5,1.7,'["oatmeal","porridge","cooked oats","דייסת שיבולת שועל","דייסה"]')
ON CONFLICT ("name") DO NOTHING;
-- Legumes: values are cooked — say so
UPDATE "Food" SET "name"='Red Lentils (cooked)', "aliases"='["lentils","red lentils","red dal","cooked lentils"]' WHERE "name"='Red Lentils' AND NOT EXISTS (SELECT 1 FROM "Food" WHERE "name"='Red Lentils (cooked)');
UPDATE "Food" SET "name"='Green Lentils (cooked)', "aliases"='["lentils","green lentils","puy lentils","cooked lentils"]' WHERE "name"='Green Lentils' AND NOT EXISTS (SELECT 1 FROM "Food" WHERE "name"='Green Lentils (cooked)');
UPDATE "Food" SET "name"='Black Beans (cooked)', "aliases"='["black beans","black turtle beans","cooked black beans"]' WHERE "name"='Black Beans' AND NOT EXISTS (SELECT 1 FROM "Food" WHERE "name"='Black Beans (cooked)');
UPDATE "Food" SET "name"='Chickpeas (cooked)', "aliases"='["chickpeas","garbanzo beans","hummus base","cooked chickpeas"]' WHERE "name"='Chickpeas' AND NOT EXISTS (SELECT 1 FROM "Food" WHERE "name"='Chickpeas (cooked)');
-- Compound rest times (only rows still at their seeded defaults)
UPDATE "WorkoutExercise" SET "restSeconds" = 150
WHERE "restSeconds" IN (90, 120) AND "exerciseId" IN (
  SELECT "id" FROM "Exercise" WHERE "isCompound" = true AND "name" IN (
    'Converging Chest Press (Machine)','Smith Machine Incline Press','Leg Press','Lat Pulldown',
    'Chest-Supported Row','Glute Drive Machine (or High/Wide Leg Press)','Pull-Ups'));
-- Muscle taxonomy: home exercises seeded with generic "legs"
UPDATE "Exercise" SET "primaryMuscle"='quads' WHERE name IN ('ישיבת קיר (Wall Sit)','סקוואט בולגרי (Bulgarian Split Squat)') AND "primaryMuscle"='legs';
UPDATE "Exercise" SET "secondaryMuscles"='["glutes","hamstrings"]' WHERE name='סקוואט בולגרי (Bulgarian Split Squat)';
UPDATE "Workout" SET "muscleGroups"=replace("muscleGroups",'"legs"','"quads","glutes"') WHERE environment='home' AND "dayLabel"='A-Home';
-- Archive duplicate home workouts left by the old seeding race (keep the one with the most sessions)
WITH ranked AS (
  SELECT w.id, row_number() OVER (PARTITION BY w."planId", w."dayLabel"
    ORDER BY (SELECT count(*) FROM "WorkoutSession" s WHERE s."workoutId"=w.id) DESC, w."order", w.id) AS rn
  FROM "Workout" w WHERE w.environment='home' AND w."archivedAt" IS NULL)
UPDATE "Workout" SET "archivedAt"=now() WHERE id IN (SELECT id FROM ranked WHERE rn>1);
