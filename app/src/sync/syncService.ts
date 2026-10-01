// Owner: Person B
// Fetches from the backend (CONTRACT.md API shapes), calls priority.scorePriority()
// for each assignment, and upserts everything into SQLite (schema.ts).

import { authorizedFetch } from './authorizedFetch';
import {
  deleteAssignment,
  deleteEvent,
  getAllAssignments,
  getAllEvents,
  getAllScheduleBlocks,
  DISMISSALS_KEY_PREFIX,
  getDismissedAssignmentIds,
  getMeta,
  setMeta,
  upsertAssignments,
  upsertCourses,
  upsertEvents,
  updatePetMood,
} from '../db/queries';
import { rescheduleReminders } from '../notifications/reminders';
import { buildProposedSchedule, commitProposedSchedule } from '../scheduling/scheduler';
import { moodFromScores } from '../pet/moodAggregation';
import { scorePriority } from '../priority';
import { TASK_TYPES, type TaskType } from '../priority/taskProfile';
import type { CalendarEventResponse, CourseworkResponse } from '../types';

export const LAST_SYNCED_KEY = 'last_synced_at';

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

    const allCoursework = (await courseworkRes.json()) as CourseworkResponse;
    // Study blocks Cling added to the calendar must not count as busy time (the backend filters them too).
    const events = ((await eventsRes.json()) as CalendarEventResponse).filter(
      (event) => (event.raw as { extendedProperties?: { private?: { clingy?: string } } } | null)?.extendedProperties?.private?.clingy !== '1',
    );

    // Classroom's courseWork.list() returns full history with no date filter,
    // so keep only items with a known due date that's now or later, and skip
    // work the student already handed in.
    const now = Date.now();
    const dismissed = await getDismissedAssignmentIds();
    const coursework = allCoursework.filter(
      (item) =>
        item.dueAt !== null &&
        new Date(item.dueAt).getTime() >= now &&
        !item.turnedIn &&
        !dismissed.has(item.id),
    );

    const courses = new Map<string, string>();
    for (const item of coursework) {
      courses.set(item.courseId, item.courseName);
    }
    await upsertCourses(
      Array.from(courses, ([id, name]) => ({ id, name })),
    );

    // Each dismissal of a task type nudges later tasks of that type down (never below 60%).
    const dismissalFactor = new Map<string, number>();
    for (const type of TASK_TYPES) {
      const count = Number((await getMeta(`${DISMISSALS_KEY_PREFIX}${type}`)) ?? 0);
      dismissalFactor.set(type, Math.max(0.6, Math.pow(0.9, count)));
    }

    const scored = coursework.map((item) => {
      const raw = item.raw as { maxPoints?: number } | null;
      const { urgencyScore, suggestedMinutes, taskType } = scorePriority({
        id: item.id,
        title: item.title,
        description: item.description,
        dueAt: item.dueAt,
        maxPoints: typeof raw?.maxPoints === 'number' ? raw.maxPoints : null,
      });
      return {
        id: item.id,
        course_id: item.courseId,
        title: item.title,
        description: item.description,
        due_at: item.dueAt,
        raw_json: JSON.stringify(item.raw),
        urgency_score: urgencyScore * (dismissalFactor.get(taskType) ?? 1),
        suggested_minutes: suggestedMinutes,
        task_type: taskType,
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

    // Upserts never remove rows, so prune anything the server no longer returns
    // (deleted, handed in, or past due). Study blocks cascade with their assignment.
    const keptAssignmentIds = new Set(scored.map((a) => a.id));
    for (const row of await getAllAssignments()) {
      if (!keptAssignmentIds.has(row.id)) await deleteAssignment(row.id);
    }
    const keptEventIds = new Set(events.map((e) => e.id));
    for (const row of await getAllEvents()) {
      if (!keptEventIds.has(row.id)) await deleteEvent(row.id);
    }

    const mood = moodFromScores(
      scored.map((a) => ({ urgencyScore: a.urgency_score, suggestedMinutes: a.suggested_minutes, taskType: a.task_type as TaskType })),
    );
    await updatePetMood(mood);

    await setMeta(LAST_SYNCED_KEY, new Date().toISOString());
    // Keep an existing schedule in step with the new data (commit also reschedules reminders);
    // with no schedule yet, just refresh the deadline reminders.
    if ((await getAllScheduleBlocks()).length > 0) {
      await commitProposedSchedule(await buildProposedSchedule());
    } else {
      void rescheduleReminders();
    }

    return { ok: true, assignmentCount: scored.length, eventCount: events.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
