# Architecture

How Clingy is put together, and why. For setup and screenshots see the [README](README.md).

## The pieces

```mermaid
flowchart LR
  subgraph Phone["Android phone (Expo / React Native)"]
    UI["Screens<br/>Home, Schedule, Class, chat"]
    DB[("SQLite<br/>expo-sqlite")]
    KS[("SecureStore<br/>Google tokens")]
    ML["MiniLM on-device<br/>react-native-fast-tflite"]
    SCH["Scheduler"]
    NOTIF["Local notifications"]
    OVL["Overlay service<br/>(Kotlin)"]
    UI --- DB
    SCH --- DB
    ML --- SCH
    SCH --> NOTIF
    UI --- OVL
  end

  subgraph Vercel
    API["Backend (Express)<br/>api.getclingy.download"]
    SITE["Download page + 2 functions<br/>site/"]
  end

  G["Google<br/>OAuth, Classroom, Calendar"]
  GEM["Gemini API<br/>reads schedule photos"]
  GH["GitHub<br/>repo, Actions, Releases"]

  Phone -- "access token per request" --> API
  API -- "client secret stays here" --> G
  API -- "API key stays here" --> GEM
  SITE -- "read-only token" --> GH
  GH -- "tag push builds the APK" --> GH
```

| Part | Where | What it is |
|---|---|---|
| App | `app/` | Expo SDK 57 / React Native 0.86 / Hermes, TypeScript. Android is the target; the floating overlay is Android-only. |
| Backend | `backend/` | A small stateless Express app on Vercel. It holds the Google OAuth client secret and the Gemini API key, proxies Classroom and Calendar, and reads schedule photos. |
| Download page | `site/` | Static page plus two Vercel functions that read the private repo's releases. Separate Vercel project (root directory `site`). |
| Release pipeline | `.github/workflows/release.yml` | Pushing a `v*` tag builds the arm64 APK and publishes a GitHub Release. |

## Why there is a backend at all

A Google OAuth client secret (and a Gemini API key) cannot live inside an app that people install. So the backend does a few narrow jobs: it exchanges the OAuth code for tokens, forwards Classroom and Calendar calls, and passes a photo of a class schedule to Gemini. It stores nothing. Every request carries the user's access token, and the phone keeps all the data. (If the backend were lost, the app would keep working on what is already saved; it just couldn't sync.)

## Signing in

```mermaid
sequenceDiagram
  participant App
  participant Browser
  participant Backend
  participant Google
  App->>Backend: GET /auth/google/url?appRedirectUri=clingy://...
  Backend-->>App: consent URL (scopes, prompt=consent)
  App->>Browser: open consent URL
  Browser->>Google: user signs in and consents
  Google->>Backend: redirect to /auth/google/callback?code=...
  Backend->>Google: exchange code (uses the client secret)
  Backend-->>Browser: redirect to clingy://...?accessToken&refreshToken&expiresAt
  Browser-->>App: deep link
  App->>App: store tokens in SecureStore
```

`prompt=consent` makes Google return a refresh token on every sign-in, not just the first. Without it a second sign-in leaves the app unable to refresh after an hour. Tokens travel in the deep-link query string, which is a known trade-off of the custom-scheme redirect.

## Data flow: one sync

`syncNow()` in `src/sync/syncService.ts` is the single pipeline. It runs on launch and sign-in, when the app returns to the foreground (at most once a minute), on pull-to-refresh, and from an OS background task (about hourly, at the OS's discretion).

```mermaid
flowchart TD
  A["authorizedFetch<br/>(refreshes the token once on a 401)"] --> B["GET /classroom/coursework<br/>GET /calendar/events"]
  B --> C["Filter: due date in the future,<br/>not turned in, not dismissed,<br/>not one of Cling's own calendar events"]
  C --> D["Score each assignment<br/>(type, effort, urgency)"]
  D --> E[("Upsert courses, assignments, events")]
  E --> F["Delete rows the server no longer returns"]
  F --> G["Update Cling's mood from the scores"]
  G --> H{"Any study blocks yet?"}
  H -- yes --> I["Rebuild the schedule"]
  H -- no --> J["Refresh reminders"]
  I --> K["Reminders and Google Calendar push<br/>(background, not awaited)"]
```

Screens read **only from SQLite**. That is what makes the app work offline: a failed sync leaves the last good data on screen, and the Home header says when it last synced.

## Prioritising an assignment

Code: `src/priority/`. The goal is two numbers per assignment: *how long will this take* and *how urgent is it*.

1. **Task type.** `taskProfile.ts` matches keywords in the title first (reading, quick task, exam, project, writing, problem set). If nothing matches, the on-device model picks the closest type by meaning (see below), and if nothing is close enough the type is `general`.
2. **Effort.** Minutes come from the type's baseline, scaled by the Classroom point value and the length of the brief, clamped to 20 to 300 and rounded to 5. It deliberately does **not** depend on urgency: a task doesn't get longer because it is due sooner.
3. **Urgency (0 to 1).** `0.5 × due-date closeness + 0.25 × stakes + 0.25 × crunch`, where closeness is `exp(-daysLeft / 5)`, stakes comes from the type and points, and crunch is the effort against about two usable study hours a day. Overdue is 1.
4. **Learning from dismissals.** Each time you dismiss a task of some type, later tasks of that type are scaled down by 10 percent, to a floor of 60 percent.

### The on-device model

A quantized **all-MiniLM-L6-v2** (22.8 MB) turns text into a 384-number vector. `tfliteScorer.ts` compares a task's text with example sentences for each type by cosine similarity (a match needs 0.3 or more). It is *only* a classifier; it does not write text, so the session labels ("Session 2 of 3 · Build") are templates keyed by the guessed type.

- **Tokenizer:** `tokenizer.ts` is a hand-written BERT WordPiece tokenizer (no suitable maintained React Native one exists), fed by `vocab.json`.
- **Input shape:** the community conversion declared its inputs as `[1,1]`, which `react-native-fast-tflite` can't resize, so the shapes in the `.tflite` file were patched to `[1,128]`. If the model is ever re-downloaded, that patch has to be reapplied or inference silently produces garbage.
- **Loading:** `react-native-fast-tflite` can only load web or `file://` addresses, and in a release build a JavaScript-required asset is just a resource name. So the model ships as a native Android asset and `ModelAssetModule.kt` copies it to private storage once per install; the scorer then loads that file.
- **Fallback:** if the model fails to load, classification uses keywords only and everything else still works.

## Planning study time

Code: `src/scheduling/scheduler.ts`. `buildProposedSchedule()` is deterministic and writes nothing; `commitProposedSchedule()` replaces the `schedule_blocks` table and then triggers reminders and the calendar push in the background.

- **Window:** 09:00 to 21:00 local time, the next 14 days, never in the past.
- **Sessions:** each assignment's effort is split into sessions of about an hour (at least 25 minutes), spread evenly from today to a day before the due date (an hour before, if it's due within 36 hours).
- **Fitting:** sessions go into free slots between calendar events and saved busy times, with a 10-minute gap after each and at most 4 hours of study per day. Most urgent assignment first.
- **Pinned blocks:** when you move a block, its exact time is saved as a *pin*. Every rebuild places pins first, counts their minutes toward the assignment, and plans everything else around them.
- **Finished sessions:** marking the first upcoming session done adds its minutes to that assignment's `done_minutes`; the rest re-plans around what's left.
- **Arrange schedule:** classes are drawn on the day timeline as read-only blocks (not draggable). A study block can't be dropped or moved onto a class: `findClassOverlap()` (`src/classes/occurrences.ts`) rejects it in both the drag and the "pick a new time" paths. A block that ends exactly as a class starts is allowed.
- **Busy times:** "can't make it" and the busy-time picker save unavailable windows that act like calendar events. They persist, so the automatic rebuild after a sync respects them.
- **Classes:** the weekly timetable (`class_meetings`) is expanded into concrete busy windows for the 14-day window (`expandClassOccurrences`, local time) on every rebuild and merged with the calendar events. They are never stored as busy times, so editing the timetable takes effect on the next rebuild (`rescheduleAfterClassChange()`, called after every add, edit, delete and scan save).

Small state that isn't a table lives in `app_meta` as JSON: `unavailable_windows`, `pinned_blocks`, `done_minutes`, `last_synced_at`, `calendar_push`, `cling_nudges`, and `dismissals:<type>`.

## Local data

SQLite (`src/db/schema.ts`, helpers in `queries.ts`):

| Table | Holds |
|---|---|
| `courses`, `assignments`, `events` | What the last sync fetched; assignments carry `urgency_score`, `suggested_minutes` and `task_type` |
| `schedule_blocks` | The current plan; deleting an assignment cascades to its blocks |
| `class_meetings` | The weekly class timetable, one row per day a class meets (`day_of_week` 0 = Sunday, `start_minutes`/`end_minutes` after midnight, optional `room`). Entered by hand or from a schedule scan |
| `dismissed_assignments` | Ids you dismissed, so a sync doesn't bring them back |
| `app_meta` | The small key/value state above |
| `pet_state` | Cling's current mood |
| `embeddings` | Cached text vectors |

## Reminders and Google Calendar

- **Reminders** (`src/notifications/reminders.ts`) are local notifications: a day before, two hours before and at each deadline, plus a "Study time" notification at the start of each session. Each reschedule cancels everything and schedules afresh, in parallel and queued so two quick changes can't cancel each other's work.
- **Google Calendar** (`src/sync/calendarPush.ts`, `backend/src/routes/calendar.ts`): after each reschedule the app sends the study blocks to `POST /calendar/study-blocks`. The backend keeps events carrying a private `clingy` marker in step with them (create, rename, delete) and never touches the user's other events. Those events are filtered out when reading the calendar, so a study block can't block itself. It can be switched off in Settings, which removes them.
- **Classes on the calendar:** the same push also sends the next four weeks of class meetings to `POST /calendar/classes`, as single events titled "Class: ..." with the room as location. They carry their own private marker (`clingyClass`), so the study-block sync never deletes them, and they are filtered out when the calendar is read back (the scheduler already knows classes, and a deleted class must not linger as busy time).

## Class schedule and photo scan

The Class tab (`ClassScreen`) lists the timetable by day and reads only SQLite. Classes are added by hand (`ClassFormSheet`) or from a photo or screenshot of any class schedule (a registration form, a timetable, a plain list), behind the `SCHEDULE_SCAN_ENABLED` flag in `src/config.ts`.

```mermaid
sequenceDiagram
  participant App
  participant Backend
  participant Gemini
  App->>App: pick photo, resize to 1600px, JPEG 0.7
  App->>Backend: POST /schedule/parse {imageBase64, mimeType} + access token
  Backend->>Gemini: image + prompt, structured JSON output
  Gemini-->>Backend: {classes: [{subject, days, start, end, room}]}
  Backend-->>App: sanitized classes
  App->>App: parseDays("MWF") to day numbers, show editable list
  App->>App: Save all writes class_meetings, rebuilds the plan
```

`backend/src/routes/schedule.ts` (also served at the older `/cor/parse` path for earlier app releases) checks the Google token, rejects photos over about 4 MB, calls Gemini (`GEMINI_MODEL`, default `gemini-3.1-flash-lite`) with a response schema, and drops unusable rows (missing subject or time, end not after start, more than 30 rows). The Gemini key lives only in the backend environment (`GEMINI_API_KEY`). The route stores nothing and logs only a status code, since a COR holds a student's name and ID. Day patterns are read in the app (`src/classes/parseDays.ts`); if one can't be read, the confirmation screen makes the student pick the days.

## Cling

Three faces of one mascot, sharing frames (`assets/cling`, `src/pet/clingFrames.ts`) and one mood.

- **In-app widget** (`PetFloatingFallback`): draggable, snaps to the nearest edge, animated by frame.
- **Floating overlay** (`app/plugins/overlay/`): a Kotlin foreground service that draws the same sprite over other apps with `WindowManager`. It mirrors the in-app animation timings and snap behaviour, hides itself while the app is open, and has a circular ✕ to drag it onto to dismiss it. The JavaScript side talks to it through the `ClingOverlay` native module (`overlayBridge.ts`).
- **Chat panel** (`ClingPanel`, `clingConversation.ts`): a scripted conversation tree with tap-only replies. Replies can trigger real work (list tasks, plan study time, ask for busy time) or show today's and tomorrow's classes.

### Nudges

Cling speaks up now and then, in a cute, slightly clingy voice. `src/pet/nudgeText.ts` is a pure function (`pickNudge`) that takes the time, upcoming assignments, study blocks and classes and returns one line plus the animation to play; `useClingNudge.ts` calls it on a loose timer (first after about 20 seconds, then every 1.5 to 3 minutes) and never repeats a line back to back. Priority:

1. **Bedtime.** After 11 PM with an exam within 72 hours, Cling plays the `sleep` animation and tells you to stop cramming and sleep. After 8 PM with an exam within 36 hours, it says to do one last light review and sleep early. Late at night with no exam it still asks why you're awake.
2. **Quiet during class.** Nothing is shown while a class is on.
3. **Class starting** within 30 minutes (with the room), a **study session** about to start or running, an **exam** within 72 hours, something **due** within 24 hours.
4. Otherwise a short clingy filler line.

With the app open, the line appears in a fading speech bubble beside the in-app widget (`NudgeBubble.tsx`), which also switches to the matching animation (`reminder`, `happy`, `sleep`). With the app in the background, the same line goes to the overlay through `showOverlayNudge()`, and `OverlayService.kt` shows it in its own window level with the sprite, then removes it after about 8 seconds. Both are no-ops when the overlay is off. Nudges can be turned off in Settings (`cling_nudges` in `app_meta`). They need the app's JavaScript to be alive, so they stop if Android kills the app process.

**Mood** (`moodAggregation.ts`) is derived from the aggregate urgency of upcoming work and saved in `pet_state`; it picks Cling's animation, including the "!" reminder state.

The native pieces are added to the generated Android project by a local Expo config plugin, `app/plugins/overlay/index.js`: it copies the Kotlin sources, the sprite drawables and the model asset, declares the service and permissions in the manifest, and registers the packages. `android/` itself is generated by `npx expo prebuild` and is not committed.

## Startup

The native splash (`expo-splash-screen`, configured in `app.json`) shows the Cling star on the app's dark background. `App.tsx` keeps it up (`preventAutoHideAsync`) until the database has opened and the stored sign-in has been checked, then hides it, so there is no blank white view at launch.

## Offline behaviour

| Works with no connection | Needs a connection |
|---|---|
| Every screen, including the Class tab (they read SQLite) | Signing in |
| Scoring, planning, moving and finishing sessions | Syncing Classroom and Calendar |
| Reminders and the Cling overlay and chat | Refreshing an expired token |
| Staying signed in (tokens are in SecureStore) | Pushing study blocks and classes to Google Calendar |
| Adding, editing and deleting classes by hand | Scanning a schedule photo |

## Download page and releases

```mermaid
flowchart LR
  T["git tag v1.1.0 and push"] --> A["GitHub Actions<br/>builds the arm64 APK"]
  A --> R["GitHub Release<br/>with the APK attached"]
  P["Download page"] -- "GET /api/releases" --> F["Vercel function<br/>(GITHUB_TOKEN, read-only)"]
  F --> R
  P -- "GET /api/download?id=..." --> F
  F -- "302 to a short-lived signed link" --> R
```

The repository is private, so a public page can't read its releases directly. `site/api/releases.js` lists them using a read-only token that only the Vercel function holds, and `site/api/download.js` redirects to GitHub's short-lived signed download link, so the APK itself never passes through Vercel. The page is plain HTML with no build step.

## Build and deploy

| Thing | How |
|---|---|
| App, development | `npx expo prebuild --platform android`, then `./gradlew installDebug` (needs JDK 21), then `npx expo start --dev-client` |
| App, release | Push a `v*` tag, or run `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` locally |
| Backend | Vercel project with root directory `backend`; deploys on every push to `main`. Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` |
| Download page | Vercel project with root directory `site`; env var `GITHUB_TOKEN` |

A debug build loads its JavaScript from the Metro dev server, so it shows a blank screen when Metro isn't running; use `adb reverse tcp:8081 tcp:8081` and `npx expo start --dev-client`, or install the release build, which carries its own code. Expo reads `app/.env.local` before `app/.env`, so a backend address in `.env.local` wins.

The release APK is signed with the standard debug key from the Expo template, which is fine for sideloading but means a proper signing key is needed before distributing updates widely.

## Known limitations

- Android only (the overlay and the build assume it).
- Google's consent screen must list a user as a test user, or the app must be verified, before other people can sign in.
- Classroom's point value is used when the course provides it; otherwise effort comes from the task type alone.
- Task-type detection is keyword-first, so an oddly worded title (for example an exam-results upload) can be mistyped.
- Sign-in tokens pass through a deep link, and the APK uses the debug signing key.
- Schedule scans depend on photo quality and the model; the student always reviews the parsed list before saving, and day patterns the app can't read must be picked by hand.
- Classes appear on Google Calendar for the next four weeks only, and are refreshed whenever the plan is rebuilt.
- No automated tests; the scheduler was exercised with throwaway scripts against real data.
