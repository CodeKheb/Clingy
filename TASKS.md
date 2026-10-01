# Tasks

Live checklist. Check items off as you go so everyone can see progress without a separate PM tool.

## Hour 1 — Setup
- [x] Agree on `CONTRACT.md` contents (all three)
- [x] Person A: Google Cloud Console project + OAuth consent screen + scopes
- [x] Person A: publish mock JSON fixture matching `CONTRACT.md` response shapes
- [x] Person B: SQLite schema created, migrations run
- [x] Person C: heuristic priority scorer working against `CONTRACT.md` interface

## P0 — Core data pipeline
- [x] (A) `/auth/google/url`, `/auth/google/callback`, `/auth/refresh`
- [x] (A) `/classroom/coursework`, `/calendar/events`
- [x] (B) app-side Google OAuth screen, token storage
- [x] (B) sync service: fetch from backend, upsert into SQLite
- [ ] (B) background sync interval
- [x] (B) HomeScreen renders assignments/events from SQLite, works offline

## P0 — Reminders & scheduling
- [x] (C) heuristic scorer: `scorePriority()` implemented and unit-tested
- [x] (B) scheduler: allocate `suggestedMinutes` into free calendar slots
- [ ] (B) notifications: scheduled from SQLite deadlines
- [x] (B) ScheduleScreen renders proposed time blocks

## P1 — On-device ML (stretch on top of heuristic)
- [x] (C) TFLite classifier integrated behind `scorePriority()`, feature-flagged
- [x] (C) fallback verified: flag off → heuristic still works

## P1 — Cling (mascot widget)
- [x] (C) in-app floating Cling fallback (build this first)
- [x] (C) native overlay bubble (timeboxed, 2-3 hrs max)
- [x] (C) PetScreen with Cling's mood states/animations
- [x] (B/C) mood aggregation wired to real urgency scores

## P2 — Stretch
- [ ] Manual schedule entry UI

## P3 — Stretch (only if ahead of schedule)
- [ ] COR image scan → OCR → heuristic parser → schedule item

## Integration checkpoints
- [ ] Hour 1: contract committed, mock fixture published
- [ ] Midpoint: each person demos their piece in isolation
- [ ] Final 2-3 hrs: full integration + offline mode confirmed + demo rehearsed
