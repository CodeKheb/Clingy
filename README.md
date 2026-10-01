<p align="center">
  <img src="docs/images/icon.png" width="96" alt="Clingy icon: Cling, a smiling orange star">
</p>

<h1 align="center">Clingy</h1>

<p align="center">
  Your Google Classroom deadlines, turned into a study plan.<br>
  An Android app that works offline, with a small star called <b>Cling</b> that nudges you.
</p>

<p align="center">
  <img src="docs/images/home.png" width="230" alt="Home screen">
  &nbsp;
  <img src="docs/images/schedule.png" width="230" alt="Schedule screen">
  &nbsp;
  <img src="docs/images/chat.png" width="230" alt="Chat with Cling">
</p>

## What it does

- **Reads your Classroom and Calendar.** Sign in with Google and your assignments and events come in.
- **Decides what's urgent.** Each assignment is scored on its due date, what's riding on it and how much work it needs. A small language model running on the phone helps tell an exam from a worksheet.
- **Plans your study time.** Work is split into sessions of about an hour and fitted around your calendar. Drag a session to a new time and the rest of the plan rearranges itself. Say you're busy and it plans around that. Mark a session done and the plan shrinks.
- **Keeps your Google Calendar in step.** Study sessions can appear on your calendar too (switchable in Settings).
- **Reminds you.** A day before, two hours before and at each deadline, plus a nudge when a session starts.
- **Works offline.** Everything is stored on the phone; it only goes online to sign in and sync.
- **Cling.** A star that floats over your other apps (drag it to the ✕ to send it away), plus a chat where you can ask what's next.

How all of that fits together is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Get it

Releases are published as GitHub Releases and on the project's download page (`site/`). The APK is for 64-bit Android phones; open it and allow installs from the source when Android asks.

Google only lets listed test users sign in until the app's consent screen is verified, so add anyone who needs to sign in as a test user in Google Cloud Console.

## Run it from source

You need Node 22, JDK 21 (newer JDKs trip the Android build), the Android SDK, and an Android phone with USB debugging.

**1. Backend** (a small Express app; see [why it exists](ARCHITECTURE.md#why-there-is-a-backend-at-all))

```bash
cd backend
npm install
cp .env.example .env     # add your Google OAuth client id and secret
npm run dev              # http://localhost:4000
```

The Google OAuth client needs `http://localhost:4000/auth/google/callback` (or your deployed address) as an authorized redirect URI, and the Classroom and Calendar APIs enabled.

**2. App**

```bash
cd app
npm install
cp .env.example .env     # point EXPO_PUBLIC_BACKEND_URL at your backend
npx expo prebuild --platform android
cd android && ./gradlew installDebug && cd ..
npx expo start --dev-client
```

Android's `adb reverse tcp:8081 tcp:8081` lets the phone reach the dev server over USB. `android/` is generated, not committed; rerun `prebuild` after changing a native module or the plugin in `app/plugins/overlay`.

**3. Checks**

```bash
cd app && npx tsc --noEmit && npx expo lint
cd ../backend && npx tsc --noEmit
```

## Project layout

```
app/                     Expo / React Native app
  src/screens/           Home, Schedule, chat, login, drag-to-arrange
  src/priority/          task type, effort and urgency; the on-device model
  src/scheduling/        the study-session planner
  src/sync/              Classroom/Calendar sync, background sync, calendar push
  src/db/                SQLite schema and queries
  src/pet/               Cling: sprite, mood, chat script, overlay bridge
  plugins/overlay/       Expo config plugin + Kotlin: floating Cling, model asset
backend/                 Express: Google OAuth, Classroom and Calendar proxy
site/                    Download page and two Vercel functions (releases, download)
.github/workflows/       Builds and publishes the APK when a v* tag is pushed
```

## Deploying

- **Backend:** a Vercel project with root directory `backend`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` (your `/auth/google/callback` address).
- **Download page:** a Vercel project with root directory `site`. Set `GITHUB_TOKEN` to a read-only fine-grained token for this repository, because the repository is private.
- **A release:** `git tag v1.0.1 && git push origin v1.0.1`. GitHub Actions builds the APK and attaches it to a new release, and the download page picks it up.

## Notes

- Android only. The floating Cling uses Android's "display over other apps".
- The release APK is signed with the Expo template's debug key, which is fine for sideloading but not for a store listing.
- There are no automated tests yet. `ARCHITECTURE.md` lists the other known limitations.
