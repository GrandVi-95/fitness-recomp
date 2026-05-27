export interface ChangelogEntry {
  version: string
  description: string
}

export const CHANGELOG: ChangelogEntry[] = [
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

export const APP_VERSION = CHANGELOG[0].version
