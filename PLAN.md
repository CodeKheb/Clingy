# Plan

Project-wide status and roadmap. `TASKS.md` is the live checkbox list; this file
is the narrative version — what's actually built, what's stubbed, what's next,
and why. Update this when the picture materially changes; keep `TASKS.md` as the
quick-glance checklist.

## What Clingy is

A study-assistant app: pulls assignments/events from Google Classroom + Calendar,
scores their urgency, schedules study time into free calendar slots, reminds the
user, and surfaces all of it through **Cling** — a mascot widget whose mood
reflects how urgent things are.

Three-way split, per `CONTRACT.md`:
- **Person A** — backend (Express): Google OAuth, Classroom/Calendar proxying.
- **Person B** — app core: SQLite, sync, scheduling, notifications, HomeScreen/ScheduleScreen.
- **Person C** — priority scoring + Cling (the mascot widget).

## Current state (as of this doc)

### Done and verified
- **Cling floating widget** (Person C) — sprite animation engine, draggable
  edge-snapping in-app fallback, mood-driven animations, tap-to-poke, left/right
  flip when docked. Built and tuned against real user feedback on-device.
  `app/src/pet/`.
- **Priority scoring** (Person C) — `scorePriority()` implemented against the
  `CONTRACT.md` section 3 signature, with two backends:
  - `heuristic.ts`: due-date decay + keyword cues. Always available, zero deps.
  - `tfliteScorer.ts`: on-device MiniLM (all-MiniLM-L6-v2, quantized, ~23MB)
    embeddings compared against a small set of "urgency anchor" phrases, blended
    with due-date decay. Feature-flagged (`USE_TFLITE` in `src/priority/index.ts`)
    with the heuristic as a permanent, automatic fallback — model-load failure or
    a per-call error both degrade silently to heuristic, never throw to the caller.
  - Verified on-device: embedding sanity check passes
    (`similar=0.650, different=-0.035`), and the full pipeline (Google auth →
    backend → tokenizer → on-device model) was run against a real account's
    live Classroom data (246 real assignments, 0% unknown-token rate).
  - Needs: `react-native-fast-tflite` → requires a **native dev client**, not
    Expo Go (see "Dev workflow" below).
- **Backend auth + data routes** (Person A) — `/auth/google/url`,
  `/auth/google/callback`, `/auth/refresh`, `/classroom/coursework`,
  `/calendar/events` all implemented against the `CONTRACT.md` response shapes
  and verified against live Google data. `backend/src/routes/`.
- **Hardcoded classroom/calendar fixture** (stand-in for backend while it wasn't
  up) — `app/src/fixtures/classroomFixture.ts`. Now that the backend is live
  this is a fallback/offline-dev tool rather than the primary path, but it's
  still useful for fast local iteration without needing a live Google token.

### Known issues (flagged, not yet fixed)
1. **Backend crash bug**: `/classroom/coursework` and `/calendar/events` handlers
   are `async` with no try/catch; an expired or bad Bearer token throws an
   unhandled rejection and **kills the whole Express process**. Needs: wrap
   handlers or add central Express error middleware. This will take down the
   sync pipeline the moment it's wired up against a real (eventually-expiring)
   token — fix before relying on long-running sync.
2. **Overdue-urgency clamping**: all overdue items currently score urgency ≈1.0
   with no further differentiation, so a backlog of old overdue assignments
   would keep Cling stuck in "urgent" mood indefinitely. Needs a decision on how
   old-overdue should decay or cap (product call, not just code).
3. Minor: a (fixed, see below) `setState`-during-render warning existed in
   `PetWidget`/`ClingSprite`'s poke-animation-end callback.

### Not started (empty stubs, Person B's scope)
Everything that actually wires the two halves above into a working app:
- `src/db/schema.ts`, `src/db/queries.ts` — SQLite setup + CRUD, per
  `CONTRACT.md` section 2 schema.
- `src/sync/syncService.ts`, `src/sync/backgroundSync.ts` — fetch from backend
  (or fixture), call `scorePriority()`, upsert into SQLite, background interval.
- `src/screens/HomeScreen.tsx` — render assignments/events from SQLite, offline-first.
- `src/scheduling/scheduler.ts` — greedy allocator: `suggestedMinutes` into free
  calendar slots.
- `src/notifications/reminders.ts` — scheduled notifications from SQLite deadlines.
- `src/screens/ScheduleScreen.tsx` — render the proposed time blocks.
- `src/auth/googleAuth.ts`, `src/screens/LoginScreen.tsx` — app-side OAuth screen
  and token storage (backend routes exist; nothing calls them from the app yet).
- Mood aggregation: something needs to compute `ClingMood` from real
  `urgency_score` values across upcoming assignments and feed it to
  `PetFloatingFallback`/`PetWidget` (currently hardcoded to `'neutral'` in `App.tsx`).

This is the biggest remaining gap: both "halves" (scoring, data-fetching) work in
isolation, but nothing connects them to a real screen yet.

## Dev workflow — read before touching native code

The app **no longer runs in Expo Go.** `react-native-fast-tflite` is a native
module (Nitro-based), so the project was moved to a native dev client via
`npx expo prebuild` + `npx expo run:android`. From here on:
- Use `npx expo start --dev-client` to connect Metro to the installed dev client
  (already on the test device as `com.anonymous.clingy`), not plain `expo start`.
- Only rerun `npx expo run:android` if native dependencies change.
- **Known build gotcha**: this machine's default JDK (25) trips an Android
  Gradle Plugin / Prefab bug (a JDK 24+ "restricted method" warning gets
  misparsed as a fatal build error). Build with:
  ```bash
  cd app
  unset ANDROID_SDK_ROOT   # conflicts with ANDROID_HOME on this machine
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
  npx expo run:android
  ```
- **Model gotcha**: the bundled `.tflite` model's input tensor shapes were
  patched in-place from `[1,1]` to `[1,128]` (the community conversion baked a
  dynamic sequence dim as a literal `1`, and `react-native-fast-tflite` can't
  resize inputs at runtime — silent garbage output otherwise). If the model file
  is ever re-downloaded fresh from Hugging Face, this patch must be reapplied.
  `tfliteScorer.ts` also runs an empirical input-order probe at init as a second
  line of defense (the two input tensors have ambiguous names), so a future
  model swap is less likely to fail silently either way.

## Near-term priority order

1. **Fix the backend crash bug** (small, well-scoped, blocks safe end-to-end
   testing of anything downstream).
2. **Wire the pipeline** (Person B's stubs): SQLite schema → syncService (backend
   or fixture) → HomeScreen. This is what turns two working halves into an
   actual usable app, and unblocks mood aggregation (real urgency scores feeding
   Cling) and the scheduler/notifications work after it.
3. **Mood aggregation**: once real urgency scores exist, compute `ClingMood` and
   replace the hardcoded `'neutral'` in `App.tsx`.
4. Scheduler + notifications + ScheduleScreen, once there's real data to
   schedule against.
5. Decide and implement the overdue-urgency clamping behavior.
6. Stretch (P2/P3 in `TASKS.md`): manual schedule entry, COR image scan → OCR.

## Where to look for more detail

- `CONTRACT.md` — the binding interface shapes (API responses, SQLite schema,
  `scorePriority()` signature, `ClingWidget` props). Don't change without a sync.
- `TASKS.md` — the live checkbox list, update as items complete.
- `HANDOFF.md` — detailed session-by-session log of the embeddings/priority work
  (model sourcing, the input-order investigation, build fixes). Useful for
  context on *why* the TFLite scorer is built the way it is; not needed for
  day-to-day work once this plan is in place.
