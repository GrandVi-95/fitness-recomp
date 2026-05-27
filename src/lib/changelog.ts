export interface ChangelogEntry {
  version: string
  description: string
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.1.3",
    description:
      "Forced maxTokens override in backend to fix JSON truncation (token limits hardcoded at 4096 per provider, no client override path).",
  },
  {
    version: "v1.1.2",
    description:
      "Expanded AI token limit for JSON generation to 4096 across all providers to fix silent failures.",
  },
  {
    version: "v1.1.1",
    description:
      "תיקון: הגדלת מגבלת הטוקנים ל-4096 בכל ספקי ה-AI למניעת קטיעת JSON בהצעות ארוחה.",
  },
  {
    version: "v1.1.0",
    description:
      "הוספת מדד סוכר, ווידג'ט התמדה שבועי, ודוחות אימייל שבועיים. שיפור מנוע ה-AI להצעות ארוחה חכמות.",
  },
  {
    version: "v1.0.0",
    description:
      "גרסת השקה: מעקב תזונה, אימוני A/B וניהול התקדמות (Progressive Overload).",
  },
]

export const APP_VERSION = "v1.1.3"
