# Frontend Plan — Clingy

Status snapshot as of this session. Branch: `design/frontend-stitch`.

## Where things stand

- **Home** and **Schedule** screens got a full visual redesign upstream (`feature/Screens-implementation`, merged into `main`): shared `AppHeader`, `BottomNav`, `Badge`, `EmptyState`, `EventTimeline`, `SectionHeader` components, plus `screens/utils/theme.ts` and `utils/format.ts` for consistent tokens/formatting.
- **Login** and the **ClingPanel** modal are still bare functional wiring (`Button`, no styling) — explicitly marked `TODO: design pass` in the code.
- A Stitch project was started (`Clingy` design system: warm orange `#ff8c3b`, rounded, playful) with Login, Home, and ClingPanel mockups generated as visual references. Schedule mockup never completed (timed out twice). **Paused** — not wired into code yet, purely a reference.
- This session fixed a real merge conflict (stale WIP vs. the redesign) and a few bugs along the way (see "Bugs fixed" below). Typecheck is currently clean.

## Dead buttons — plan per button

Checked the data model (`src/db/queries.ts`) and backend (`src/scheduling/scheduler.ts`, `src/pet/clingConversation.ts`) to ground this — not guessing. **Two tiers: wireable now vs. needs new backend first.**

### Tier 1 — wire now, backend already exists

**1. `ScheduleScreen.tsx` `PlanSummaryCard` → "🔁 Re-run Scheduler"** (line ~104)
- Backend: `buildProposedSchedule()` + `commitProposedSchedule()`, both in `src/scheduling/scheduler.ts`, already imported and used in the old duplicate `ScheduleScreen` implementation deleted this session — the exact call pattern to copy is preserved in git history (`git show HEAD~1:app/src/screens/ScheduleScreen.tsx`, the `onGenerate` callback).
- Plan: add `refreshing` state, `onPress` runs `buildProposedSchedule()` → `commitProposedSchedule()` → reload `blocks`/`assignmentsById`/`nextLabel` (the same three calls already in the mount `useEffect`). Show a spinner/disabled state on the button while running, surface errors inline (the old code did `setError(e.message)`).
- **Highest value, lowest effort** — do this first.

**2. `AppHeader.tsx` profile circle "👤"** (currently a static `View`, not even `Pressable`)
- Backend: `signOut()` already exists in `src/auth/googleAuth.ts` and is imported in `App.tsx` but never called anywhere.
- Plan: make it a `Pressable`, add an `onSignOut` prop to `AppHeader` (threaded from `HomeScreen`/`ScheduleScreen` → `App.tsx`, which already owns `setSignedIn`). Simplest version: tap → native `Alert.alert` confirm → `signOut()` + `setSignedIn(false)`. No new screen needed.
- Do this second — closes the "can't sign out at all" gap noted above.

### Tier 2 — in scope (needs a decision, but no new backend/schema)

**3. `HomeScreen.tsx` `HeroTaskCard` → "🎯 Start Task" CTA** (line ~186)
- No backend concept of "in progress" exists — `assignments` table only has `urgency_score`/`suggested_minutes`, no status field.
- Cheapest real wiring: open `ClingPanel` (it already has a conversation tree with `show_tasks`/`offer_schedule`/`schedule_confirmed` nodes — "Start Task" could just jump straight into that flow for the given assignment). No schema change needed.
- Needs: a decision on whether "Start Task" should do anything beyond opening the chat panel for now.

**7. `HomeScreen.tsx` `HeroTaskCard` → "⋮" more-menu button** (line ~135)
- No menu content defined. Candidates given what the schema *does* support: edit urgency/duration (`updateAssignmentPriority` exists), or delete (`deleteAssignment` exists). Needs a decision on what the menu should contain before implementing.

### Out of scope for this pass — no backend exists at all

These three need real feature work (new schema/state, not just an `onPress`), so they're explicitly **not** part of this polish pass. Visually disable them (lower opacity, remove or disable the `Pressable`) rather than leave them tappable-but-dead:

- `HomeScreen.tsx` `GreetingCard` → "▶ Start 25m Focus Block" chip (line ~77) — no timer feature/component/session-tracking table exists anywhere in the codebase.
- `HomeScreen.tsx` `GreetingCard` → "💤 Snooze 15m" chip (line ~81) — no snooze concept in the data model, no scheduled-notification system.
- `HomeScreen.tsx` `GreetingCard` → "☕ Re-charge" chip (line ~85) — undefined behavior, never specified; the Stitch-era copy didn't define what it should do.

## Missing: sign-out has no UI

The old `HomeScreen` had a visible "Sign out" button; the new redesign's `AppHeader` has a profile icon but it's not tappable and there's no sign-out affordance anywhere in the app now. `App.tsx` still has the `getStoredTokens`/sign-in flow wired, but nothing calls `signOut()`. Needs a decision: tap profile icon → small menu/sheet with sign-out, or a dedicated row somewhere.

## Screens still needing the design pass

1. **LoginScreen** — currently a bare `<Button title="Sign in with Google">`. Stitch mockup exists as a reference (warm hero, mascot, single Google button, ToS caption).
2. **ClingPanel** — currently bare chat-bubble wiring (orange pill buttons, no card/sheet styling). Stitch mockup exists as a reference (bottom-sheet, mood badge, "needs attention" list, quick-action pills).
3. **Schedule screen** — already redesigned, but double check against Home for visual consistency (spacing, card radius) since they were supposed to share a design system per the file's own header comment.

## Bugs fixed this session (context for next time)

- `app.json` had invalid JSON (duplicate `"package"` and `"predictiveBackGestureEnabled"` keys with a missing comma) — blocked every build. Fixed.
- `expo-background-task` was referenced in `app.json`'s `plugins` but never installed as a dependency — blocked every build. Installed via `npx expo install`.
- `android/local.properties` was missing / `ANDROID_HOME` pointed at the wrong (near-empty) SDK path (`/opt/android-sdk` vs. the real one at `~/Android/Sdk`). Fixed locally — **this is a local machine config issue, not committed, so whoever builds next needs the same fix** (or get `ANDROID_HOME` set correctly in their shell profile).
- Merge conflict in `App.tsx`/`HomeScreen.tsx` between a stale WIP (manual tab bar, inline `Button` sign-out) and the real redesign — resolved in favor of the redesign; restored tab switching via `BottomNav`'s `onSelectTab` prop (now wired through both `HomeScreen` and `ScheduleScreen`).
- `ScheduleScreen.tsx` had a leftover **duplicate `export function ScheduleScreen()`** (dead pre-redesign implementation with its own imports) sitting after the real one — this would have been a hard compile error. Deleted.
- Hook-order bug in `App.tsx`: a `useState` call was placed after a conditional `return`, violating Rules of Hooks. Fixed by moving state/effects above all early returns.

## Suggested order for next session (given limited time)

1. Wire dead button #1 — "Re-run Scheduler" on `ScheduleScreen` (backend exists).
2. Wire dead button #2 — sign-out via `AppHeader` profile circle (backend exists).
3. Style `LoginScreen` using the Stitch mockup as reference (highest visibility — it's the first thing every new user sees).
4. Style `ClingPanel` using its Stitch mockup.
5. Wire #3 and #7 (decide behavior, then implement — no new backend needed for either). Visually disable the three out-of-scope chips (focus block, snooze, re-charge) so they don't look tappable.
6. Resume the paused Stitch Schedule-screen generation if a fourth mockup is still wanted, though Schedule is already functionally designed.
