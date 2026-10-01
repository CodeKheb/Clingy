# DONT_LOOK_VIBECODED.md

A plan to make Clingy read like a product someone shipped on purpose, not like a
demo that grew one badge at a time.

Scope: **frontend only** (`app/`). No backend, no schema, no new dependencies
except possibly one icon set. The strategy is **subtraction**: cut features,
cut fake data, cut decoration, and let two or three things be good instead of
ten things being loud.

---

## 1. The diagnosis — why it reads as vibecoded

This isn't a feeling; it's a list of specific tells, each with a receipt.

### 1a. Fake or invented data on screen

| What the UI shows | Where | Reality |
|---|---|---|
| `Rank #1` on every hero task | `HomeScreen.tsx` `HeroTaskCard` | Hardcoded — the hero is just `assignments[0]`, not ranked against anything. |
| `Progress 40%` | `HeroTaskCard` | `suggested_minutes > 0 ? 0.4 : 0` — a literal placeholder. The schema has **no** progress/status field. |
| `Local Gemma-2B` badge | `AIPriorityQueue` | The model is **all-MiniLM-L6-v2** (see `.tflite` asset + `[priority] MiniLM ready` log). The badge names a model that was never used. |
| `"98%"` on the Cling Pet nav tab | `BottomNav.tsx` | A hardcoded string with no meaning. |
| `"Hey Alex!"`, `"CS 106B"`, `"before 5 PM"`, `"offline bio-rhythm"` | `GreetingCard` | All hardcoded copy. There is no user-name field, no bio-rhythm feature, no dynamic course. |
| `"Google Classroom"` source label | `HeroTaskCard` | Hardcoded, shown even for non-Classroom items. |
| `"Offline bio-rhythm shows optimal energy"` | `GreetingCard` | A feature that does not exist anywhere in the app. |
| Fake `✅` "cached" icon on every secondary card | `SecondaryTaskCard` | Decoration; conveys no sync state. |

A real app never shows a number it can't compute. Every one of these is an
instant "this was generated" signal.

### 1b. Dead or non-existent features presented as finished

- **Two of four bottom-nav tabs are dead.** `BottomNav` renders `Home`,
  `Schedule`, `Cling Pet`, `Offline & Sync`, but `App.tsx` only routes
  `home`/`schedule` — tapping `Cling Pet` or `Offline & Sync` falls through to
  Home. The nav advertises two products that don't exist.
- **Three disabled chips on Home** (`Start 25m Focus Block`, `Snooze 15m`,
  `Re-charge`) — literally rendered at `opacity: 0.45` and `disabled`. Shipping
  visibly greyed-out buttons is the loudest vibecode tell there is.
- **`⋮` more-menu** that only offers "Dismiss task" — a menu with one item.
- **PetScreen** is a debug gallery: it renders all eight `ClingSprite`
  animations in a grid with mood-test buttons. That's a developer tool on a
  user screen.
- **ToS caption** on Login has no links.

### 1c. Decoration standing in for design

- **Emoji as the entire icon system**: 🏠 📅 🐾 🔒 🚩 📆 ⏱ 🧩 🤖 🧠 🛡️ 👤 🎯 💡 ▶ 💤 ☕ — across every component.
- **A badge on almost every section header**: `GCal Offline Sync`,
  `Auto-scheduled`, `Local Gemma-2B`, `Peak Focus Window`, `Vault Encrypted`,
  `N blocks`. Status pills are a seasoning, not a base ingredient.
- **Decorative glows**: absolutely-positioned blurred circles in `GreetingCard`
  and `PlanSummaryCard`.
- **Nested cards**: card-inside-a-card-inside-a-section, each with its own
  border + radius + tinted background.

### 1d. Naming the implementation in the UI

`"Local Gemma-2B"`, `"GCal Offline Sync"`, `"Vault Encrypted"`,
`"AUTO-SCHEDULED STUDY PLAN"`, `"AI Priority Queue"`. Users don't care what's
running; they care what to do next. This is the single most "README leaked into
the product" habit in the app.

### 1e. Three design systems fighting

- `screens/utils/theme.ts` — **dark** Material You (`#0f131c` bg, `#ff6b35` accent).
- `ClingPanel.tsx` — white bg, `#ff8c3b` accent, `#fff3e8` bubbles.
- `PetScreen.tsx` — light grey (`#eee` / `#333`) with `#ff8c3b`.
- The Stitch mockups were **warm/orange/light** (`FRONTEND_PLAN.md`).

So the app has a dark Home/Schedule, a white chat panel, and a light pet gallery,
none of which agree. Pick **one** theme and make everything obey it.

### 1f. Duplication

Home shows `Today's Schedule Snapshot`; Schedule shows `Today's Calendar`.
Both render the same `EventTimeline`. Two screens are doing the same job, which
makes the nav feel redundant and the app feel bigger than it is.

### 1g. Tone

`"ready to crush CS 106B?"`, `"high-leverage"`, `"Peak Focus Window"`,
`"Your week, organised"`, `"Re-run Scheduler"`. It's marketing voice wrapped
around a study app. Real productivity tools are calm and literal.

---

## 2. The cure — principles

1. **Subtract, don't add.** Every change in this plan removes something.
2. **One screen, one job.** If two screens answer the same question, delete one.
3. **Never show a number you can't compute.** No placeholders, no "%", no
   "Rank #1" unless it's derived from real data.
4. **Don't name the stack.** No "Gemma", no "GCal", no "Vault". Say what it
   does for the user, or say nothing.
5. **Emoji are not icons.** Use a real icon set (`@expo/vector-icons`, already
   available via Expo) or no icons. Never mix.
6. **Honesty over polish.** Empty states are a feature. A greyed-out button is
   worse than no button.
7. **One theme.** One background, one accent, everywhere.
8. **Decoration earns its place.** No glows, no badge unless it changes a decision.

---

## 3. Feature ledger

`Cut` = remove entirely · `Simplify` = keep the job, drop the ceremony ·
`Keep` = it's real and useful.

| Feature | Location | Verdict | Why |
|---|---|---|---|
| Tabs `Cling Pet` + `Offline & Sync` | `BottomNav` | **Cut** | Don't route anywhere. Nav should have only destinations that exist. |
| `98%` nav badge | `BottomNav` | **Cut** | Meaningless constant. |
| Disabled quick chips (Focus/Snooze/Re-charge) | `GreetingCard` | **Cut** | Dead buttons are the #1 vibecode signal. |
| `GreetingCard` dynamic copy | `HomeScreen` | **Cut → replace** | Hardcoded name/course/bio-rhythm. Replace with a real one-liner or nothing. |
| Home `Today's Schedule Snapshot` | `HomeScreen` | **Cut** | Duplicates Schedule. Home should not mirror another tab. |
| `AI Priority Queue` label + `Local Gemma-2B` badge | `HomeScreen` | **Simplify** | Call it what it is (`Up next` / `Priority`). Drop the model badge. |
| `Rank #1` badge | `HeroTaskCard` | **Cut** | Not real. |
| Progress bar / `40%` | `HeroTaskCard` | **Cut** | No status data exists. |
| `Google Classroom` source label | `HeroTaskCard` | **Simplify** | Show the real course name if present; else omit. |
| Secondary-card `✅` icon | `SecondaryTaskCard` | **Cut** | Decoration. |
| `⋮` one-item menu | `HeroTaskCard` | **Simplify** | Either build a real menu (edit urgency / delete) or drop the button. |
| `Start Task` CTA | `HeroTaskCard` | **Keep** | Real, opens Cling for that task. |
| Section-header badges (`GCal Offline Sync`, `Auto-scheduled`, `N blocks`) | multiple | **Simplify** | Keep at most the one that reflects live sync state; cut the rest. |
| `Vault Encrypted` shield | `AppHeader` | **Cut** | Marketing claim, no user decision. |
| Header mascot avatar | `AppHeader` | **Cut** | Cling already floats on screen; a second mascot in the header is noise. |
| `AppHeader` profile / sign-out | `AppHeader` | **Keep** | Real function. |
| `PlanSummaryCard` eyebrow + glow + 3 stat pills | `ScheduleScreen` | **Simplify** | Keep the "Re-run scheduler" action; cut the stat theater. |
| `Re-run Scheduler` | `ScheduleScreen` | **Keep** | Real, now de-duplicated. |
| `PetScreen` animation gallery | `PetScreen` | **Cut from nav** | It's a dev tool. Keep the file, don't ship it as a screen. |
| Floating Cling mascot | `PetFloatingFallback` | **Keep (simplify)** | It's the product's identity. Keep, but see §5. |
| Mood states (`happy/neutral/stressed/urgent`) | pet/* | **Simplify** | Real data behind it. Don't surface a mood *label* UI; let the sprite express it. |
| `ClingPanel` conversation | `ClingPanel` | **Keep** | Core interaction. Needs the design pass, not removal. |
| Draggable dock edge, drag/snap animations | `PetFloatingFallback` | **Simplify** | Fine to keep; it's genuinely nice. Don't add more. |

**Target surface area after cuts:** 2 tabs, ~3 screens (Login, Home, Schedule),
1 modal (ClingPanel), 1 floating mascot. That's it.

---

## 4. Screen-by-screen target

### Login (first impression — must be plain)
- Mascot, product name, one sentence of what it is, one button, ToS.
- Keep it dark to match the app (already done). No chips, no "Vault" claims.
- Loading state on the button; inline error. Nothing else.

### Home — "what should I do right now?"
1. One small, honest greeting line (real counts only: "3 due this week").
2. **Next task** card: title, course (if present), due, estimate. One action: **Start**.
3. A short "Also upcoming" list (2–4 items, plain rows — no cards-in-cards).
- **No** second event timeline, **no** progress, **no** rank, **no** disabled chips.
- Empty state: "Nothing synced yet." + a single **Sync** action.

### Schedule — "how is my time laid out?"
1. One header row: how many blocks, next one. A single **Re-run** action.
2. Study blocks grouped by day (keep the existing `DayGroup` — it's good).
3. Today's calendar events (this is where the timeline belongs — not Home).
- Cut the stat-pill trio and the decorative glow.

### Cling (panel + mascot)
- Panel: bottom sheet, chat bubbles, quick-reply pills. Give it the same dark
  theme as the app.
- Mascot: one floating sprite. Do **not** also put a mascot in the header or
  make it a nav tab.

### Pull from the app entirely
- `PetScreen`, the two dead tabs, the disabled chips, the fake metrics.

---

## 5. Copy & tone rules

Rewrite all user-facing text against these rules:

- **Sentence case**, not Title Case or ALL CAPS eyebrows.
- **No exclamation marks.** No "crush", "high-leverage", "peak", "ready to".
- **No invented metrics** ("bio-rhythm", "energy", percentages).
- **No tech names** (Gemma, MiniLM, TFLite, GCal).
- **Literal labels**: "Up next", "Due today", "Suggested for you", "Blocks".
- Prefer **counts and dates** over adjectives.

Before → after examples:
- `"AI Priority Queue"` → `"Up next"`
- `"AUTO-SCHEDULED STUDY PLAN / Your week, organised"` → `"This week"`
- `"Peak Focus Window"` → *(remove)*
- `"Re-run Scheduler"` → `"Rebuild schedule"` (or just "Rebuild")
- `"Local Gemma-2B"` → *(remove)*
- `"Offline bio-rhythm shows optimal energy right now"` → *(remove)*
- `"Vault Encrypted"` → *(remove)*

---

## 6. Visual rules

- **One theme** (`theme.ts` dark) applied to `ClingPanel` and `PetScreen` too.
  Delete the white/light palettes and the `#ff8c3b` duplicate accent.
- **One icon system**: `@expo/vector-icons` (ships with Expo — no new install
  beyond what Expo provides). Replace every emoji used as an icon. Emoji are
  allowed only if they're genuinely part of copy, never as UI glyphs.
- **Badge budget**: at most one status badge per screen, and only if it reflects
  live state the user can act on.
- **Remove all decorative `*Glow` absolute-positioned circles.**
- **One card level**: stop nesting bordered cards inside bordered sections.
- **Restrained motion**: keep the mascot drag/snap; drop any decorative
  animation that isn't the mascot.

---

## 7. Flows that should feel natural

The app should answer these questions in this order, with nothing in the way:

1. **Not signed in** → Login → clear single action.
2. **Signed in, nothing synced** → honest empty states with one Sync action.
3. **Synced** → Home shows the single next thing; Schedule shows the plan;
   Cling floats quietly and answers when tapped.
4. **Sign out** → from the header profile, confirm, back to Login.

No dead ends, no greyed buttons, no numbers that don't exist, no tab that
leads nowhere. That's what "flows naturally" means here.

---

## 8. Phased execution (frontend only)

**Phase 0 — Decisions (no code).**
Confirm the cut list in §3 and the single theme. Resolve: does Cling keep a nav
tab? (Recommended: no — floating mascot only.)

**Phase 1 — Remove fake data & dead UI.**
Highest ratio of payoff to effort. Delete: `40%` progress, `Rank #1`,
`Local Gemma-2B`, `98%`, `Vault Encrypted`, the three disabled chips, the `✅`
icon, hardcoded greeting copy. (`FRONTEND_PLAN.md` already tracks some of these.)

**Phase 2 — Cut scope/duplication.**
Reduce `BottomNav` to real destinations; remove Home's duplicate event
timeline; remove `PetScreen` from the shipped surface.

**Phase 3 — Unify the visual system.**
Apply `theme.ts` everywhere; swap emoji icons for `@expo/vector-icons`; remove
glows and nested cards; cap badges.

**Phase 4 — Rewrite copy** per §5.

**Phase 5 — Tighten flows & empty states** per §7.

**Phase 6 — Consistency pass.** Home ↔ Schedule spacing, radii, and typography
should be indistinguishable in style.

---

## 9. Non-goals

- No backend or schema changes.
- No new product features. This plan only removes and simplifies.
- No new heavy dependencies (an Expo-provided icon set is the ceiling).
- Not a full visual rebrand — the dark theme already exists; we're making
  everything obey it.

---

## 10. Acceptance test — "does it still look vibecoded?"

Run this checklist on a fresh build. Any "yes" means keep cutting.

- [ ] No screen shows a number that isn't computed from real data.
- [ ] No button on screen is disabled or would do nothing.
- [ ] No nav tab leads to a screen that doesn't exist.
- [ ] No emoji is used as an icon.
- [ ] No screen names a model, library, or vendor.
- [ ] At most one status badge per screen.
- [ ] Every screen uses the same background/accent.
- [ ] Every empty state offers exactly one next action.
- [ ] The same information does not appear on two tabs.
- [ ] A stranger could describe what each of the 2–3 screens is for in one sentence.

If all ten pass, it stops looking generated and starts looking designed.
