-- Planned meals: existing logs are all "eaten" (column default).
ALTER TABLE "NutritionLog" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'eaten';

-- CreateIndex
CREATE INDEX "NutritionLog_userId_status_date_idx" ON "NutritionLog"("userId", "status", "date");
