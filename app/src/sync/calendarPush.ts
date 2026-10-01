// Puts the study blocks on the student's Google Calendar (primary) so they show up in every
// calendar app. The backend keeps Cling's events in step with these blocks: new ones created,
// moved or finished ones removed. On by default; Settings can turn it off, which removes them.

import { expandClassOccurrences } from '../classes/occurrences';
import { getAllClassMeetings, getMeta, getUpcomingAssignments, getUpcomingScheduleBlocks, setMeta } from '../db/queries';
import { sessionLabels, type TaskType } from '../priority/taskProfile';
import { authorizedFetch } from './authorizedFetch';

const ENABLED_KEY = 'calendar_push';

export async function isCalendarPushEnabled(): Promise<boolean> {
  return (await getMeta(ENABLED_KEY)) !== 'off';
}

async function pushBlocks(): Promise<void> {
  const enabled = await isCalendarPushEnabled();
  const [assignments, blocks] = enabled
    ? await Promise.all([getUpcomingAssignments(), getUpcomingScheduleBlocks()])
    : [[], []]; // switched off: send nothing, so the backend deletes what Cling added

  const types = new Map(assignments.map((a) => [a.id, a.task_type as TaskType]));
  const labels = sessionLabels(blocks, types);

  const response = await authorizedFetch('/calendar/study-blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: blocks.map((b) => ({
        key: `${b.assignment_id}|${new Date(b.start_at).getTime()}`,
        title: b.assignment_title,
        label: labels.get(b.id) ?? 'Study session',
        startAt: b.start_at,
        endAt: b.end_at,
      })),
    }),
  });
  if (!response.ok) console.warn(`[calendar] could not update Google Calendar (${response.status})`);
}

const CLASS_PUSH_DAYS = 28;

// Class meetings become single events for the next four weeks, re-synced on every reschedule.
async function pushClasses(): Promise<void> {
  const now = Date.now();
  const occurrences = (await isCalendarPushEnabled())
    ? expandClassOccurrences(await getAllClassMeetings(), now, CLASS_PUSH_DAYS).filter((o) => o.end > now)
    : []; // switched off: send nothing, so the backend deletes what Cling added

  const response = await authorizedFetch('/calendar/classes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: occurrences.map((o) => ({
        key: `${o.meeting.id}|${o.start}`,
        title: o.meeting.subject,
        label: o.meeting.room ?? '',
        startAt: new Date(o.start).toISOString(),
        endAt: new Date(o.end).toISOString(),
      })),
    }),
  });
  if (!response.ok) console.warn(`[calendar] could not update classes on Google Calendar (${response.status})`);
}

async function run(): Promise<void> {
  // Independent, so a failure on one doesn't stop the other.
  await pushBlocks().catch((e) => console.warn('[calendar] study block push failed:', e));
  await pushClasses().catch((e) => console.warn('[calendar] class push failed:', e));
}

// One at a time, so two quick reschedules can't race each other's creates and deletes.
let queue: Promise<void> = Promise.resolve();

/** Brings the Google Calendar copy up to date. Callers shouldn't await it: the UI never waits on the network. */
export function pushStudyBlocksToCalendar(): Promise<void> {
  queue = queue.then(run).catch((e) => console.warn('[calendar] push failed:', e));
  return queue;
}

export async function setCalendarPushEnabled(enabled: boolean): Promise<void> {
  await setMeta(ENABLED_KEY, enabled ? 'on' : 'off');
  await pushStudyBlocksToCalendar();
}
