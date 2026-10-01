# Clingy: how this project works

Clingy is a study-assistant Android app. It pulls assignments and calendar events from Google Classroom and Google Calendar, scores how urgent each one is, schedules study time into free calendar slots, reminds you, and shows all of it through **Cling**, a mascot whose mood reflects how urgent things are.

Repo layout: `app/` (Expo / React Native app), `backend/` (Express API deployed on Vercel). `CONTRACT.md` defines the API and DB shapes shared between them.

---

## What happens in the app, end to end

1. **Sign in.** `LoginScreen` calls `signInWithGoogle()` (`app/src/auth/googleAuth.ts`). The app asks the backend for a Google consent URL (`GET /auth/google/url`) and opens it in the browser.
2. **Google consent.** Google redirects to the backend's `/auth/google/callback?code=...`. The backend (which holds the client secret) exchanges the code for tokens and redirects into the app via the `clingy://` deep link with the tokens attached.
3. **Tokens stored.** The app saves access token, refresh token and expiry in SecureStore (Android Keystore-backed).
4. **Sync.** `syncNow()` (`app/src/sync/syncService.ts`) calls the backend's `/classroom/coursework` and `/calendar/events`, drops anything with no due date or already past due, scores every assignment, and upserts everything into SQLite.
5. **Scoring.** `scorePriority()` (`app/src/priority/`) gives each assignment an `urgency_score` (0 to 1) and `suggested_minutes`. It combines due-date decay (70%) with a text signal (30%): the on-device MiniLM model matches the title/description to urgency anchors, falling back to keyword heuristics if the model fails to load.
6. **Mood.** The scores are aggregated into one of `happy / neutral / stressed / urgent` (`moodAggregation.ts`) and saved to the `pet_state` table. `useClingMood()` reads it back and drives Cling's animation.
7. **Scheduling.** `buildProposedSchedule()` (`app/src/scheduling/scheduler.ts`) greedily places each assignment's `suggested_minutes` into free slots (08:00 to 22:00, next 14 days, around calendar events), most urgent first. `commitProposedSchedule()` saves the blocks to `schedule_blocks`.
8. **Reminders.** After every sync and every commit, `rescheduleReminders()` (`app/src/notifications/reminders.ts`) cancels all pending notifications and schedules new local ones: one at each assignment's due time, one at each study block's start.
9. **Cling.** Two forms of the mascot:
   - In-app floating widget (`PetFloatingFallback`): draggable, snaps to the nearest screen edge, animated.
   - System-wide overlay (Android only): a native foreground service draws the same animated Cling over other apps, and hides itself while Clingy is open. Tapping it opens `ClingPanel`, a scripted chat with canned replies ("Show my tasks", "I need to study", "What's next?") that can trigger scheduling.

---

## Offline: what works and what doesn't

**Short answer: reading works offline; getting new data does not.**

Stored on the phone (survives no network, app restarts):
- SQLite (`expo-sqlite`): `courses`, `assignments` (with urgency score and suggested minutes), `events`, `schedule_blocks`, `pet_state`, `embeddings`.
- SecureStore: Google tokens, so you stay signed in offline.

Fully on-device, no network needed: every screen reads from SQLite only; scoring (TFLite model ships in the app); mood; the scheduler; scheduled notifications; the Cling widget and chat panel.

Needs network:
- **Signing in** (backend + Google).
- **Syncing** new assignments/events from Classroom/Calendar.
- **Refreshing an expired access token.**

Known gaps (verified in code):
- **Nothing re-syncs after first sign-in.** `syncNow()` is only called from `App.tsx` right after sign-in. The earlier pull-to-refresh was removed in the UI rewrite, and `app/src/sync/backgroundSync.ts` is an empty stub (`expo-background-task` is installed but unused). Until one of these is added, data goes stale.
- No "last synced" indicator and no offline banner; a failed sync just returns an error to the caller.
- Assignments are filtered to future due dates at sync time, so past-due work is never stored.

---

## Technologies and what each one does

### App (`app/`)
| Tech | Role here |
|---|---|
| **Expo SDK 57 / React Native 0.86** | The app framework. Expo handles the native build, config plugins and JS tooling. We use a custom **dev client** (not Expo Go) because of native modules. |
| **React 19 / TypeScript** | UI components and all app logic. |
| **expo-sqlite** | Local database; the app's single source of truth for UI (`db/schema.ts`, `db/queries.ts`). |
| **expo-secure-store** | Encrypted storage for Google tokens. |
| **expo-auth-session / expo-web-browser / expo-linking** | Opens the Google consent page in a browser and catches the `clingy://` redirect back into the app. Also receives `clingy://cling-panel` from the overlay bubble. |
| **react-native-fast-tflite** | Runs the TensorFlow Lite MiniLM model on-device to embed assignment text. |
| **MiniLM (all-MiniLM-L6-v2, quantized) + `tokenizer.ts` + `vocab.json`** | The ML part of scoring: a hand-written BERT WordPiece tokenizer feeds the model, which produces a 384-number embedding compared against urgency "anchor" sentences. The model file has its input shape patched to `[1,128]` (see `HANDOFF.md`). |
| **`heuristic.ts`** | Keyword and due-date scorer; the permanent fallback if the model is off or fails. |
| **expo-notifications** | Local scheduled notifications for deadlines and study blocks. Native module: needs a dev-client rebuild after install. |
| **expo-background-task** | Installed for periodic background sync; not wired up yet. |
| **react-native-safe-area-context** | Keeps UI clear of the status bar/notch and bottom navigation bar. |
| **@expo/vector-icons** | Icons in the polished UI. |
| **Local config plugin `plugins/overlay/`** | Injects the native overlay into the generated Android project at prebuild: copies `OverlayService.kt` / `OverlayModule.kt` / `OverlayPackage.kt`, the sprite frames, manifest permissions and the service declaration. |
| **Kotlin `OverlayService`** | Foreground service that draws the animated, draggable, edge-snapping Cling over other apps using `WindowManager` (needs the "display over other apps" permission). Mirrors the in-app sprite timing and snap behaviour. |
| **Kotlin `OverlayModule` (`ClingOverlay`)** | JS-to-native bridge: permission check/request, start/stop, `setMood`, `setAppForeground`. Wrapped by `pet/overlayBridge.ts`. |
| **Sprite system (`assets/cling/*.png`, `clingFrames.ts`, `ClingSprite.tsx`)** | Frame-by-frame animation (idle, blink, poke, drag, snap, reminder, happy, sleep) from a cropped sprite sheet. |
| **`clingConversation.ts` / `ClingPanel.tsx`** | Scripted conversation tree with tap-only replies; side effects (fetch tasks, schedule) run when a node is entered. |

### Backend (`backend/`)
| Tech | Role here |
|---|---|
| **Express** | HTTP API: `/auth/*`, `/classroom/coursework`, `/calendar/events`, `/health`. |
| **googleapis** | Google OAuth2 client plus Classroom and Calendar API calls. |
| **dotenv** | Loads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` locally. On Vercel these come from project environment variables instead. |
| **Vercel (`@vercel/node`, `vercel.json`)** | Hosts the backend as a serverless function at `https://api.getclingy.download`. The `builds` entry in `vercel.json` overrides dashboard build settings. |
| **Google Cloud OAuth client** | Identity and consent. Its authorized redirect URI must exactly match `GOOGLE_REDIRECT_URI` (`https://api.getclingy.download/auth/google/callback`). |

### Why the backend exists
The Google client secret must never ship inside an app, so the backend does the code-for-token exchange and proxies Classroom/Calendar. The app only ever holds the user's tokens.

---

## Config worth knowing
- `app/.env` / `app/.env.local`: `EXPO_PUBLIC_BACKEND_URL` (`.env.local` overrides; currently the deployed API).
- Native rebuild needed whenever a native module or the overlay plugin changes: `npx expo prebuild --platform android`, then `gradlew installDebug` with `JAVA_HOME=/usr/lib/jvm/java-21-openjdk` and `ANDROID_SDK_ROOT` unset (JDK 25 breaks the build).
- JS-only changes reload through Metro with no rebuild.
