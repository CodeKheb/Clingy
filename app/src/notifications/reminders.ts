// Owner: Person B — expo-notifications scheduled from SQLite deadlines.
//
// Local (device-only) notifications, no push/server round-trip: one for each
// upcoming assignment's due date, one for each proposed study block's start
// time. Re-synced from scratch on every call (cancel-all then
// reschedule-all) rather than diffed, since the data volumes here are small
// (a handful of assignments/blocks) and this avoids tracking which
// notification ids correspond to which row across syncs.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getUpcomingAssignments, getUpcomingScheduleBlocks } from '../db/queries';
import { sessionLabels, type TaskType } from '../priority/taskProfile';

const CHANNEL_ID = 'deadlines';

const HOUR_MS = 60 * 60 * 1000;
// A heads-up a day out, a nudge two hours out, and the deadline itself.
const DEADLINE_REMINDERS = [
  { beforeMs: 24 * HOUR_MS, title: 'Due tomorrow' },
  { beforeMs: 2 * HOUR_MS, title: 'Due in 2 hours' },
  { beforeMs: 0, title: 'Due now' },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Deadlines & study blocks',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** Requests notification permission if not already granted/denied. Returns whether reminders can be scheduled. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function dateTrigger(date: Date): Notifications.DateTriggerInput {
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID };
}

async function runReschedule(): Promise<void> {
  const [assignments, blocks] = await Promise.all([getUpcomingAssignments(), getUpcomingScheduleBlocks()]);
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = Date.now();
  const types = new Map(assignments.map((a) => [a.id, a.task_type as TaskType]));
  const labels = sessionLabels(blocks, types);

  const requests: { title: string; body: string; at: Date }[] = [];
  for (const assignment of assignments) {
    if (!assignment.due_at) continue;
    const dueMs = new Date(assignment.due_at).getTime();
    for (const reminder of DEADLINE_REMINDERS) {
      const fireAt = dueMs - reminder.beforeMs;
      if (fireAt > now) requests.push({ title: reminder.title, body: assignment.title, at: new Date(fireAt) });
    }
  }
  for (const block of blocks) {
    const startAt = new Date(block.start_at);
    if (startAt.getTime() > now) {
      requests.push({
        title: 'Study time',
        body: `${labels.get(block.id) ?? 'Study session'}: ${block.assignment_title}`,
        at: startAt,
      });
    }
  }

  // Each call is a native round trip; doing ~50 of them one by one took seconds.
  await Promise.all(
    requests.map((r) =>
      Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body },
        trigger: dateTrigger(r.at),
      }),
    ),
  );
}

// Runs queued one after another: an overlapping run would cancel notifications the other just scheduled.
let queue: Promise<void> = Promise.resolve();

/**
 * Cancels every previously scheduled reminder and schedules fresh ones from
 * SQLite: each upcoming assignment's due date and each saved study block's
 * start time. Reading both from the DB (rather than taking arguments) means
 * it's safe to call after syncNow() and after commitProposedSchedule()
 * without one wiping the other's reminders. Silently no-ops if permission
 * isn't granted. Callers shouldn't await it: reminders never block the UI.
 */
export function rescheduleReminders(): Promise<void> {
  queue = queue.then(runReschedule).catch((e) => console.warn('[reminders] reschedule failed', e));
  return queue;
}
