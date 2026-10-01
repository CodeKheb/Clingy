# StudyPet

A privacy-first Android app that syncs Google Classroom assignments and Google Calendar events, works fully offline once synced, and uses an on-device prioritization model plus a floating "pet" widget to remind you of deadlines and suggest how to spend your time.

## Stack

- **App**: React Native (Expo, dev client), Android target, `expo-sqlite` for local storage
- **Backend**: Node.js (Express) — handles Google OAuth2 and proxies Classroom/Calendar APIs only; no business-logic database

## Repo layout

```
/backend   Node/Express OAuth + Classroom/Calendar proxy  (owner: Person A)
/app       Expo React Native app                          (owners: Person B, Person C)
CONTRACT.md  Shared schema/API/interface contract — read this before writing integration code
TASKS.md     Live checklist of what's done / in progress, split by owner
```

## Team split

| Person | Owns | Key paths |
|---|---|---|
| **A** | Backend + Google OAuth | `/backend`, `app/src/auth/` |
| **B** | App core: data, sync, scheduling, notifications | `app/src/db/`, `app/src/sync/`, `app/src/scheduling/`, `app/src/notifications/` |
| **C** | On-device prioritization model + pet widget | `app/src/priority/`, `app/src/pet/` |

Full plan, architecture, and rationale: see the plan doc shared with the team (`make-a-plan-we-re-tingly-crayon.md`).

## Getting started

### Backend (Person A)
```bash
cd backend
npm install
cp .env.example .env   # fill in Google OAuth client id/secret
npm run dev
```

### App (Person B / C)
```bash
cd app
npm install
npx expo prebuild       # only needed once native modules (overlay, tflite) are added
npx expo run:android
```

## Branching workflow

- `main` stays always-demoable.
- Each person works on their own branch: `feat/backend-auth`, `feat/app-core`, `feat/ml-pet`.
- Merge to `main` at the agreed integration checkpoints (hour 1, midpoint, final pass) — not continuously.
- Before merging to `main`, run the relevant quick check from the plan's Verification section.

## Demo script

1. Fresh login via Google OAuth.
2. Sync Classroom + Calendar data.
3. Turn off network — show deadline list still renders, sorted by urgency, with suggested time blocks.
4. Show a deadline reminder notification firing.
5. Tap the pet widget — app opens to the relevant screen.
