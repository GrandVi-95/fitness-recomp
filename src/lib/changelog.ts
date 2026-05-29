export interface ChangelogEntry {
  version: string
  description: string
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.2.1",
    description:
      "Refactored camera scanner to Meal Logger and added Sugar meter to the Nutrition page.",
  },
  {
    version: "v1.2.0",
    description:
      "Feature: Secure image-based meal recognition with transient in-memory processing.",
  },
  {
    version: "v1.1.9",
    description:
      "Flattened JSON schema to resolve infinite generation loops.",
  },
  {
    version: "v1.1.8",
    description:
      "Added Graceful Failure mode and macro-violation warnings for impossible constraints.",
  },
  {
    version: "v1.1.7",
    description:
      "Fixed AI hallucination loops via temperature reduction and robust markdown stripping.",
  },
  {
    version: "v1.1.6",
    description:
      "Fixed Gemini infinite generation loop by removing JSON mime-type constraint and adding macro failsafes.",
  },
  {
    version: "v1.1.5",
    description:
      "Added verbose logging for Gemini API payload to diagnose MAX_TOKENS truncation.",
  },
  {
    version: "v1.1.4",
    description:
      "Raised AI token ceiling to 8192 across all providers (Gemini maxOutputTokens, OpenAI/Anthropic max_tokens) to eliminate JSON truncation.",
  },
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

export const APP_VERSION = "v1.2.1"
