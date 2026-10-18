-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "darkMode" BOOLEAN NOT NULL DEFAULT true,
    "proteinAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proteinAlertTime" TEXT NOT NULL DEFAULT '14:00',
    "deloadThreshold" INTEGER NOT NULL DEFAULT 3,
    "fatiguePacingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "aiApiKey" TEXT,
    "autoProteinGoal" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("darkMode", "deloadThreshold", "fatiguePacingEnabled", "id", "proteinAlertEnabled", "proteinAlertTime", "userId") SELECT "darkMode", "deloadThreshold", "fatiguePacingEnabled", "id", "proteinAlertEnabled", "proteinAlertTime", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
