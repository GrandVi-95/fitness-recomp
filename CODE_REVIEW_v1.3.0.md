# Full System Code Review — Fitness Recomp App (v1.0.0 → v1.3.0)

**Mode:** Read-only audit. No files were modified, no versions bumped.
**Scope:** Entire repo — AI/Gemini routes, nutrition engine, gym/workout flow, state, security.
**Reviewers:** Senior Next.js/AI Engineer · Expert Nutritionist · Strength & Hypertrophy Coach

---

## 1. Architectural Wins (what is built well)

- **Timestamp-driven rest timer.** `useRestTimer` derives countdown from `restStartedAt + restDurationSecs` via `Date.now()` rather than an in-memory tick counter. Tab-switching, screen-lock, and refresh all resolve to correct wall-clock remaining time. `adjustRestDuration` correctly mutates *duration* (not `startedAt`), so +30/−15 buttons behave intuitively. This is the strongest piece of code in the repo.
- **Single source of truth for "today's nutrition."** `getTodayNutrition()` in `lib/nutrition.ts` is shared by the dashboard Server Component and the `/api/nutrition/today` route, so consumed macros never drift between the two screens. The timezone-bounds helper (`getTodayBounds`) is documented and reused.
- **Offline-first set logging.** `gymStore` is `persist`ed to `localStorage` with an SSR-safe no-op storage fallback. Sets are written locally first (optimistic) with a `tempId`, then reconciled to a `serverId` after POST — refreshing mid-session loses nothing.
- **Reordering preserves session data.** `loggedSets` is keyed by `exerciseId`, so `swapExercises` reorders the queue without orphaning logged sets. Reorder UI is correctly restricted to *upcoming* exercises only (`slice(currentExIdx + 1)`), so an athlete can't accidentally reshuffle completed work.
- **Gym UI is genuinely gym-optimized.** 48px (`w-12 h-12`) stepper hit-targets, `active:scale` feedback, large `2rem` exercise title, color-coded RPE, vibration on rest-finish, and the amber "previous performance" card as the visual anchor — this is well-tuned for a fatigued user glancing at a phone.
- **Force-dynamic dashboard.** `export const dynamic = "force-dynamic"` correctly prevents stale cached macros — a real bug class avoided.

---

## 2. Code Smells & Technical Debt (structural flaws, leaks, API vulnerabilities)

### Persona 1 — Engineering

- **Phantom AI model in the fallback chain.** `suggest-meal` lists `"gemini-3.1-flash"` *first* in `GEMINI_MODELS`. That model id does not exist — every meal suggestion eats a guaranteed 404 round-trip before falling through to `gemini-2.5-flash`. The git log (`e12143b upgrade to gemini 3.1 flash` → `9385284 downgrade…`) shows this was never cleaned up. Added latency on every call, for nothing.
- **Two AI routes, zero shared code.** `stripMarkdownFences`, the Gemini key resolver, the Gemini `fetch`/payload boilerplate, `DEMO_USER_ID`, and error-handling are duplicated verbatim between `suggest-meal/route.ts` and `analyze-image/route.ts`. There is no `lib/ai.ts`. Any prompt/robustness fix has to be made twice and has already drifted (see next point).
- **Robustness is split-brained across the two routes.** `suggest-meal` has **model fallback but no 503/429 retry**; `analyze-image` has **503/429 retry but no model fallback**. Neither route has both. Retry uses a fixed `1000ms` delay with no exponential backoff or jitter. These two strategies should be unified into one shared helper that does *both* fallback and backoff.
- **Debug logging left in production.** `console.log("[GEMINI EXACT PAYLOAD]", JSON.stringify(payload, null, 2))` dumps the full prompt on every suggest-meal call. Noise, and a minor data-exposure footgun in shared logs.
- **Duplicated/diverged constants & components.** `TZ_OFFSET_MS` (3h) is redefined in `lib/nutrition.ts` and `dashboard/page.tsx`; `SUGAR_TARGET = 50` is hardcoded in *three* files; `MacroRing` is implemented **twice** with two different SVG techniques (dashboard uses `strokeDasharray "${pct} ${100-pct}"`, nutrition uses `strokeDashoffset`). One should live in `components/ui`.
- **Enter-key double-fire bug in the gym.** `ActiveSession` registers a `window` `keydown` listener that calls `handleLogSet()` on Enter. `StepperInput`'s numeric input also handles Enter (to commit) but does **not** `stopPropagation`, so pressing Enter to confirm a typed weight/reps value *also logs a set*. Real, reproducible mis-log.
- **`ActiveSession` subscribes to the entire store.** `const { ... } = useGymStore()` with no selector re-renders the whole active-session tree on *any* store change. Combined with `useRestTimer`'s 250ms `setInterval`, the page re-renders ~4×/sec during rest. `GymPage` also calls the full `useRestTimer()` hook just to read `isActive` — it should subscribe to `restActive` directly. Use granular selectors.
- **No resync queue for failed set POSTs.** On a network failure `handleLogSet` only does `console.error("…stored locally")`. The set survives in `localStorage` but is never retried or reconciled — on a crowded-gym flaky connection, finished-session totals can silently under-count. A pending-sync queue flushed on reconnect/finish is needed.

### Security & Privacy

- **API key in the URL query string.** Both Gemini routes call `…:generateContent?key=${apiKey}`. Query strings are the most leak-prone place for secrets (proxy logs, error traces). Where the API allows, move to a header.
- **Image privacy claim is locally true but globally incomplete.** The `// PRIVACY: transient` comment is accurate — the base64 buffer is never written to disk/DB. Good. But it *is* transmitted to Google's servers, so "strict stateless privacy policy" only holds for *your* infrastructure; the third-party transmission should be stated honestly to users.
- **No input guards on the image route.** `imageBase64` has no size cap and no real image-type validation (the mime is regex-sniffed from the data-URL the client supplies). A large or malformed body is forwarded straight to Gemini. Add a payload-size limit and basic validation.
- **`aiApiKey` stored in plaintext** in `UserSettings`. Acceptable for a single-user `demo-user` app, but worth noting before any multi-user move.

---

## 3. Nutrition & Fitness Logic Flaws (where it fails the real-world athlete)

### Persona 2 — Nutritionist

- **The two screens disagree on macro targets.** This is the most important logic bug. Targets are computed in two places with different formulas:
  - Dashboard (`getDashboardData`): protein = `weight × 2.2`, carbs = *remainder* after protein+fat, fat = `cal × 0.25 / 9`.
  - `/api/nutrition/today`: protein = `weight × 2.1`, carbs = *fixed 50%* of calories, fat = `cal × 0.25 / 9`.

  So when `autoProteinGoal` is on, the dashboard and the nutrition page show **different protein goals (2.2 vs 2.1 g/kg)** and **different carb goals** for the same day. Target math must be centralized in `lib/nutrition.ts` and called by both.
- **Sugar tracking is systematically under-counted.** The prominent sugar meter is undermined by the data feeding it:
  - `suggest-meal`'s `parseMacroString` hardcodes `sugar: 0` — the model is never asked for sugar, so MealSuggester always renders "0ג' סוכר." Misleading.
  - `analyze-image`'s `ScanResult` has **no sugar field at all** — every camera-scanned meal contributes 0g sugar to the daily total. Since v1.2.x pushes the camera as the primary logger, the sugar meter reads low precisely when it's used most.
- **The 50g sugar limit conflates total vs. added sugar.** `SUGAR_TARGET = 50` is reasonable as a WHO *added-sugar* ceiling, but the app tracks *total* sugar (fruit + dairy included). For a high-volume plant-based athlete eating fruit, oats, and dairy/soy, hitting "100% sugar" daily is expected and not a health signal — the red warning is scientifically misleading as implemented. Either track added sugar specifically, or raise/relabel the threshold and make it user-configurable.
- **Capping protein is backwards for a recomp.** The prompt sets `maxProtein = remaining + 5` as a hard ceiling and instructs "אל תחרוג" (do not exceed). Protein overage is benign-to-beneficial during a recomp; the binding constraint should be calories, with protein as a *floor*, not a *ceiling*. The graceful-failure priority order (calories → protein → ignore fat) is otherwise sound and matches the brief.

### Persona 3 — Strength & Hypertrophy Coach

- **The static-hold timer records nothing.** `ExerciseTimer` is a clean count-up stopwatch with play/pause/reset and proper interval cleanup — but its elapsed value is **never written to the set log**. The set schema only stores reps/weight/RPE, so a 90-second plank cannot actually be *logged* as data; the timer is purely a visual aid. This fails the brief's "track static holds" requirement at the data layer. To truly support planks/holds, sets need a `durationSecs` field and a "log this hold" action.
- **The static timer isn't scoped to an exercise.** `ExerciseTimer` is mounted once in `ActiveSession` and persists across exercise navigation, so its running time carries over when you move to the next exercise — it isn't reset or associated with the current movement.
- **Reorder is client-only.** `swapExercises` mutates only the in-session array; the new order is never persisted to the server `order` field. Fine for a live session, but if the session is resumed from a fresh load the planned order returns. Acceptable, worth knowing.
- **UI/UX under stress is strong**, with one gap: the Enter-key mis-log above is exactly the kind of thing that bites a tired lifter who types a weight and hits Enter expecting to confirm the *number*, not log the *set*.

---

## Priority Shortlist (for when we resume)

1. **High — correctness:** Centralize macro-target math; the dashboard/nutrition protein & carb disagreement is user-facing.
2. **High — correctness:** Add sugar to the image-scan + meal-suggest schemas, or stop displaying a sugar value that's always 0/under-counted.
3. **High — bug:** `stopPropagation` on StepperInput Enter to kill the double-log.
4. **Medium — performance/cost:** Remove `gemini-3.1-flash`; unify retry+fallback into one `lib/ai.ts`; strip debug logging.
5. **Medium — performance:** Granular Zustand selectors in `ActiveSession`/`GymPage`.
6. **Medium — feature integrity:** Give static holds a real `durationSecs` log path.
7. **Low — nutrition science:** Reframe the 50g total-sugar warning; treat protein as a floor not a ceiling.
8. **Low — security:** Image payload size/type guards; move API key out of the query string.

---

Full Audit Complete. Awaiting your instructions on which optimizations to implement.
