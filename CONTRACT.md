# Shared Contract

**Fill this in together in the first 15-60 minutes.** This is the interface boundary between Person A (backend), Person B (app core), and Person C (priority/pet). Once agreed, don't change it without a quick group sync — everyone else is coding against it.

## 1. Backend API response shapes

### `GET /classroom/coursework`
```ts
type CourseworkResponse = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  description: string | null;
  dueAt: string | null; // ISO 8601, null if no due date
  raw: unknown;         // original Classroom API object, for debugging
}[];
```

### `GET /calendar/events`
```ts
type CalendarEventResponse = {
  id: string;
  title: string;
  startAt: string; // ISO 8601
  endAt: string;   // ISO 8601
  raw: unknown;
}[];
```

### Auth
- `GET /auth/google/url` → `{ url: string }` (redirect target for the OAuth consent screen)
- `GET /auth/google/callback?code=...` → `{ accessToken: string, refreshToken: string, expiresAt: string }`
- `POST /auth/refresh` body `{ refreshToken: string }` → `{ accessToken: string, expiresAt: string }`

## 2. SQLite schema (app-side, owned by Person B)

```sql
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,              -- ISO 8601, nullable
  raw_json TEXT,
  urgency_score REAL,        -- written by Person C's priority module
  suggested_minutes INTEGER  -- written by Person C's priority module
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  raw_json TEXT
);

CREATE TABLE schedule_blocks (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL
);

CREATE TABLE pet_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- singleton row
  mood TEXT NOT NULL DEFAULT 'neutral'   -- 'happy' | 'neutral' | 'stressed' | 'urgent'
);
```

## 3. Priority module interface (owned by Person C, consumed by Person B)

```ts
// app/src/priority/index.ts
export type PriorityInput = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null; // ISO 8601
};

export type PriorityOutput = {
  urgencyScore: number;     // 0-1, higher = more urgent
  suggestedMinutes: number; // estimated time to allocate
};

export function scorePriority(input: PriorityInput): PriorityOutput;
```

Person B calls `scorePriority()` for each assignment after sync and writes the result into `assignments.urgency_score` / `assignments.suggested_minutes`. Person C can swap the heuristic implementation for a TFLite-backed one behind this same function signature with zero changes needed on Person B's side.

## 4. Pet widget contract (owned by Person C)

- Exposes a `PetWidget` component (overlay or in-app fallback, same props either way):
  ```ts
  type PetWidgetProps = {
    mood: 'happy' | 'neutral' | 'stressed' | 'urgent';
    onPress: () => void; // navigates into the app
  };
  ```
- `mood` is derived from aggregate `urgency_score` across upcoming assignments — Person B or C can compute this, agree on who owns the aggregation function when wiring it up.
