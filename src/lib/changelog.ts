export interface ChangelogEntry {
  version: string
  description: string
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.13.1",
    description:
      "Fix & Feature: Resolved instant-save bug on unit input, added single-item weight option, and implemented clipboard paste support for the Label Scanner.",
  },
  {
    version: "v1.13.0",
    description:
      "Fix: Forced granular item separation in AI parsing and improved image scale calibration, leveraging the Label Scanner for branded items.",
  },
  {
    version: "v1.12.0",
    description:
      "Refactor: Redesigned Super-Set UI into a unified dual-input card for better workout flow, and added a visual link toggle in the workout editor.",
  },
  {
    version: "v1.11.0",
    description:
      "Feature: Updated Gym and Home A/B/C programs to the new Hypertrophy split and introduced visual Super-Set grouping logic for linked exercises.",
  },
  {
    version: "v1.10.0",
    description:
      "Feature: Introduced AI Nudging with dynamic, vegetarian-friendly protein insights for logged meals.",
  },
  {
    version: "v1.9.1",
    description:
      "Fix: Unlocked exercise reordering to allow moving the first exercise down when gym equipment is unavailable.",
  },
  {
    version: "v1.9.0",
    description:
      "Feature: Implemented Home vs. Gym workout environments with completely isolated data tracking and dynamic metric fields for bodyweight/isometric exercises.",
  },
  {
    version: "v1.8.1",
    description:
      "Feature Refinement: Integrated Label Scanner with saved recipes and added unit-based portioning capabilities.",
  },
  {
    version: "v1.8.0",
    description:
      "Feature: Launched Phase 8 Multimodal Nutrition Label Scanner with automated OCR macro extraction and flexible portion-logging.",
  },
  {
    version: "v1.7.0",
    description:
      "Audit Phase 7: Fixed API-key-in-URL leak and missing retry in NLP route, added partial-failure recovery to multi-meal logging, eliminated rest-day target flash, hardened direct-log input validation, and rebalanced rest-day macro cycling (fat/carb split), vegetarian protein target (2.5g/kg), and rest-day sugar ceiling.",
  },
  {
    version: "v1.6.4",
    description:
      "Critical: Eliminated hardcoded deprecated model array in nutrition log route, linked to verified core shared models, and finalized editable cards, rest-day cycling, and quick-coffee logger.",
  },
  {
    version: "v1.6.3",
    description:
      "Feature: Added Quick-Log Coffee Milk button with customizable volume and pre-configured Tnuva/Oatly Barista presets.",
  },
  {
    version: "v1.6.2",
    description:
      "Feature: Implemented Rest Day Macro Cycling toggle with automated carb and calorie reduction for non-training recovery days.",
  },
  {
    version: "v1.6.1",
    description:
      "Feature: Added inline editing to AI review cards before logging.",
  },
  {
    version: "v1.6.0",
    description:
      "Feature: Upgraded primary core AI engine to verified gemini-3.5-flash with a clean production fallback chain (2.5-flash/2.5-pro) to ensure zero-latency processing for voice, image, and recipe logging.",
  },
  {
    version: "v1.5.5",
    description:
      "Emergency fix: Stripped all deprecated/404ing models from fallback array and restricted core to stabilized gemini-2.5 architecture with aggressive 503 retry backoff.",
  },
  {
    version: "v1.5.4",
    description:
      "Audit Phase 5.4: Stabilized 503 retry mechanics on the primary gemini-2.5-flash model while keeping the known-working production model array intact.",
  },
  {
    version: "v1.5.2",
    description:
      "Forced native JSON response mode and expanded token limits for recipe analyzer to prevent truncated payloads.",
  },
  {
    version: "v1.5.1",
    description:
      "Fixed JSON parsing vulnerability for recipe analysis by enforcing strict string escaping and adding pre-parse sanitation.",
  },
  {
    version: "v1.5.0",
    description:
      "Feature: Added Recipe Builder and Leftover Logger with fractional serving options and 25% default portion shortcuts.",
  },
  {
    version: "v1.4.0",
    description:
      "Feature: Added multimodal voice-to-meal logging using Gemini audio analysis for seamless single-sentence daily tracking.",
  },
  {
    version: "v1.3.4",
    description:
      "Fixed Vercel build crash by separating pure nutrition utilities from server-side database logic.",
  },
  {
    version: "v1.3.3",
    description:
      "Audit Phase 3: Refined macro logic (protein floor, adjusted total sugar limit), added offline resync queue for the gym, and secured image payload endpoints.",
  },
  {
    version: "v1.3.2",
    description:
      "Audit Phase 2: Unified AI routes, optimized gym render performance, and enabled static hold data logging.",
  },
  {
    version: "v1.3.1",
    description:
      "Audit Phase 1: Fixed macro math synchronization, Enter-key double-log bug, and activated AI sugar tracking.",
  },
  {
    version: "v1.3.0",
    description:
      "Feature: Added in-workout timer for static holds and dynamic exercise reordering.",
  },
  {
    version: "v1.2.4",
    description:
      "Fixed Vercel Cron not firing by adding GET handler to weekly-report route.",
  },
  {
    version: "v1.2.3",
    description:
      "Fixed truncated JSON in image analyzer by setting maxOutputTokens to 8192.",
  },
  {
    version: "v1.2.2",
    description:
      "Fixed image analyzer crashes by adding automatic 503/429 retry logic.",
  },
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

export const APP_VERSION = "v1.13.1"
