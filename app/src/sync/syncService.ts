// Owner: Person B
// Fetches from the backend (CONTRACT.md API shapes), calls priority.scorePriority()
// for each assignment, and upserts everything into SQLite (schema.ts).

import { getStoredTokens, refreshAccessToken } from '../auth/googleAuth';
import { upsertAssignments, upsertCourses, upsertEvents, updatePetMood } from '../db/queries';
import { moodFromScores } from '../pet/moodAggregation';
import { scorePriority } from '../priority';
import type { CalendarEventResponse, CourseworkResponse } from '../types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function requireBackendUrl(): string {
  if (!BACKEND_URL) {
    throw new Error('[sync] EXPO_PUBLIC_BACKEND_URL is not set — see app/.env.example');
  }
  return BACKEND_URL;
}

async function authorizedFetch(path: string): Promise<Response> {
  const backendUrl = requireBackendUrl();
  let tokens = await getStoredTokens();
  if (!tokens) {
    throw new Error('[sync] not signed in — no stored tokens');
  }

  let response = await fetch(`${backendUrl}${path}`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });

  // Access tokens expire; retry once after a refresh (CONTRACT.md /auth/refresh).
  if (response.status === 401 && tokens.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      tokens = refreshed;
      response = await fetch(`${backendUrl}${path}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
    }
  }

  return response;
}

export type SyncResult =
  | { ok: true; assignmentCount: number; eventCount: number }
  | { ok: false; error: string };

/**
 * Fetches coursework + calendar events from the backend, scores each
 * assignment, upserts everything into SQLite, and persists Cling's mood
 * from the aggregate urgency — the full CONTRACT.md data pipeline in one
 * call. Call this after sign-in and on whatever interval backgroundSync.ts
 * decides.
 */
export async function syncNow(): Promise<SyncResult> {
  try {
    const [courseworkRes, eventsRes] = await Promise.all([
      authorizedFetch('/classroom/coursework'),
      authorizedFetch('/calendar/events'),
    ]);

    if (!courseworkRes.ok) {
      return { ok: false, error: `coursework fetch failed (${courseworkRes.status})` };
    }
    if (!eventsRes.ok) {
      return { ok: false, error: `events fetch failed (${eventsRes.status})` };
    }

    const coursework = (await courseworkRes.json()) as CourseworkResponse;
    const events = (await eventsRes.json()) as CalendarEventResponse;

    const courses = new Map<string, string>();
    for (const item of coursework) {
      courses.set(item.courseId, item.courseName);
    }
    await upsertCourses(
      Array.from(courses, ([id, name]) => ({ id, name })),
    );

    const scored = coursework.map((item) => {
      const { urgencyScore, suggestedMinutes } = scorePriority({
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
        raw_json: JSON.stringify(item.raw),
        urgency_score: urgencyScore,
        suggested_minutes: suggestedMinutes,
      };
    });
    await upsertAssignments(scored);

    await upsertEvents(
      events.map((event) => ({
        id: event.id,
        title: event.title,
        start_at: event.startAt,
        end_at: event.endAt,
        raw_json: JSON.stringify(event.raw),
      })),
    );

    const mood = moodFromScores(
      scored.map((a) => ({ urgencyScore: a.urgency_score, suggestedMinutes: a.suggested_minutes })),
    );
    await updatePetMood(mood);

    return { ok: true, assignmentCount: scored.length, eventCount: events.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
