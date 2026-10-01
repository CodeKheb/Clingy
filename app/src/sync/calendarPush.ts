// Puts the study blocks on the student's Google Calendar (primary) so they show up in every
// calendar app. The backend keeps Cling's events in step with these blocks: new ones created,
// moved or finished ones removed. On by default; Settings can turn it off, which removes them.

import { getMeta, getUpcomingAssignments, getUpcomingScheduleBlocks, setMeta } from '../db/queries';
import { sessionLabels, type TaskType } from '../priority/taskProfile';
import { authorizedFetch } from './authorizedFetch';

const ENABLED_KEY = 'calendar_push';

export async function isCalendarPushEnabled(): Promise<boolean> {
  return (await getMeta(ENABLED_KEY)) !== 'off';
}

async function run(): Promise<void> {
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
