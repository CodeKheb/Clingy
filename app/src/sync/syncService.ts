/**
 * @module sync/syncService
 *
 * Core sync engine. Each run fetches coursework and calendar data from the
 * backend, validates the payloads against the shared API contract (`types.ts`),
 * scores each assignment's priority, and upserts everything into the local
 * SQLite database.
 *
 * Typical lifecycle:
 *  1. Call {@link configureSync} once at startup with the backend URL, a token
 *     provider, and the database used by scheduled/background runs.
 *  2. Call {@link syncNow} for manual syncs (e.g. a Sync button), or let
 *     `backgroundSync.ts` call it on an OS-managed schedule.
 *
 * The network calls are read-only and both responses are fetched and validated
 * *before* the database is touched, so a failed or malformed response leaves
 * existing offline data intact. Writes happen per collection via transactional
 * upserts in `db/queries.ts`.
 *
 * Owner: Person B.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertAssignments, upsertCourses, upsertEvents } from '../db/queries';
import type { AssignmentInput, CourseInput, EventInput } from '../db/queries';
import { scorePriority } from '../priority';
import type { CalendarEventResponse, CourseworkResponse } from '../types';

/** Fallback backend base URL (`EXPO_PUBLIC_API_URL` wins when set). */
const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

/** Default per-request network timeout, in milliseconds. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Summary of a completed sync. `syncedAt` is a fresh ISO 8601 timestamp, and
 * the counts reflect how many records were written during this run (not the
 * total number stored locally).
 */
export type SyncResult = {
  syncedAt: string;
  assignmentCount: number;
  eventCount: number;
};

/**
 * Configuration shared across sync runs. Values registered here act as the
 * defaults for every {@link syncNow} call; per-call {@link SyncOptions} take
 * precedence. Set this once via {@link configureSync}.
 */
export type SyncConfig = {
  apiUrl?: string;
  /** Supplies the bearer token for background runs. Manual syncs can instead pass `accessToken` to {@link syncNow}. */
  getAccessToken?: () => Promise<string | null>;
  database?: SQLiteDatabase;
  requestTimeoutMs?: number;
};

/**
 * Per-call overrides for {@link syncNow}. Typically supplied for manual syncs,
 * where the caller already holds a fresh access token and database handle.
 */
export type SyncOptions = {
  accessToken?: string;
  database?: SQLiteDatabase;
};

let config: SyncConfig = {};
/** In-flight sync used to coalesce concurrent {@link syncNow} calls. */
let activeSync: Promise<SyncResult> | null = null;

/**
 * Merge new values into the global sync configuration. Call this once at app
 * startup, before scheduling background sync, so a token is available during a
 * headless run (there is no caller to supply one then). Partial updates are
 * supported and existing keys are preserved.
 */
export function configureSync(nextConfig: SyncConfig): void {
  config = { ...config, ...nextConfig };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function assertIsoDate(value: unknown, field: string, nullable = false): asserts value is string | null {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Backend returned an invalid ${field}.`);
  }
}

function parseCoursework(value: unknown): CourseworkResponse {
  if (!Array.isArray(value)) throw new TypeError('Coursework response must be an array.');
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.courseId !== 'string' ||
      typeof item.courseName !== 'string' ||
      typeof item.title !== 'string' ||
      !isNullableString(item.description) ||
      !Object.hasOwn(item, 'dueAt') ||
      !isNullableString(item.dueAt) ||
      !Object.hasOwn(item, 'raw')
    ) {
      throw new TypeError('Backend returned coursework that does not match the API contract.');
    }
    assertIsoDate(item.dueAt, 'coursework dueAt', true);
  }
  return value as CourseworkResponse;
}

function parseCalendarEvents(value: unknown): CalendarEventResponse {
  if (!Array.isArray(value)) throw new TypeError('Calendar events response must be an array.');
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.title !== 'string' ||
      !Object.hasOwn(item, 'raw')
    ) {
      throw new TypeError('Backend returned calendar data that does not match the API contract.');
    }
    assertIsoDate(item.startAt, 'calendar startAt');
    assertIsoDate(item.endAt, 'calendar endAt');
  }
  return value as CalendarEventResponse;
}

function toRawJson(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const serialized = JSON.stringify(raw);
  return serialized ?? null;
}

async function requestJson<T>(url: string, token: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Sync request failed (${response.status} ${response.statusText}).`);
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Sync request timed out after ${timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function performSync(options: SyncOptions): Promise<SyncResult> {
  const token = options.accessToken ?? await config.getAccessToken?.();
  if (!token?.trim()) throw new Error('Google authentication is required before syncing.');

  const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, '');
  const timeoutMs = config.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

  // Fetch and validate both collections before changing the offline database.
  const [courseworkResponse, eventsResponse] = await Promise.all([
    requestJson<unknown>(`${apiUrl}/classroom/coursework`, token, timeoutMs),
    requestJson<unknown>(`${apiUrl}/calendar/events`, token, timeoutMs),
  ]);
  const coursework = parseCoursework(courseworkResponse);
  const calendarEvents = parseCalendarEvents(eventsResponse);

  const coursesById = new Map<string, CourseInput>();
  const assignments: AssignmentInput[] = coursework.map((item) => {
    coursesById.set(item.courseId, { id: item.courseId, name: item.courseName });
    const priority = scorePriority({
      id: item.id,
      title: item.title,
      description: item.description,
      dueAt: item.dueAt,
    });
    return {
      id: item.id,
      course_id: item.courseId,
      title: item.title,
      description: item.description,
      due_at: item.dueAt,
      raw_json: toRawJson(item.raw),
      urgency_score: priority.urgencyScore,
      suggested_minutes: priority.suggestedMinutes,
    };
  });

  const events: EventInput[] = calendarEvents.map((item) => ({
    id: item.id,
    title: item.title,
    start_at: item.startAt,
    end_at: item.endAt,
    raw_json: toRawJson(item.raw),
  }));

  const database = options.database ?? config.database;
  await upsertCourses([...coursesById.values()], database);
  await upsertAssignments(assignments, database);
  await upsertEvents(events, database);

  return {
    syncedAt: new Date().toISOString(),
    assignmentCount: assignments.length,
    eventCount: events.length,
  };
}

/**
 * Run a sync immediately and resolve with the resulting {@link SyncResult}.
 * Call this directly from a manual Sync button, or let `backgroundSync.ts` call
 * it on a schedule.
 *
 * Concurrent calls are coalesced: while a sync is in flight, additional calls
 * return the same promise instead of starting another network round-trip. Call
 * `configureSync` first when relying on the shared config (scheduled runs).
 *
 * @throws If no access token is available, a request fails or times out, or a
 *   response does not match the API contract.
 */
export function syncNow(options: SyncOptions = {}): Promise<SyncResult> {
  if (activeSync) return activeSync;
  activeSync = performSync(options).finally(() => {
    activeSync = null;
  });
  return activeSync;
}
