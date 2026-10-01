// Owner: Person B
// Greedy allocator: sorts assignments by urgencyScore + dueAt, places suggestedMinutes
// into free slots relative to calendar events, writes schedule_blocks.

import {
  clearScheduleBlocks,
  getMeta,
  getUpcomingAssignments,
  getUpcomingEvents,
  setMeta,
  upsertScheduleBlocks,
  type Assignment,
} from '../db/queries';
import { rescheduleReminders } from '../notifications/reminders';
import { pushStudyBlocksToCalendar } from '../sync/calendarPush';
import { planSessions } from '../priority/taskProfile';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SLOT_MINUTES = 15;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
const SESSION_GAP_MINUTES = 10; // breathing room after each session
const MAX_DAY_MINUTES = 240; // don't cram more than 4h of study into one day
const HOUR_MS = 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 14;

const UNAVAILABLE_KEY = 'unavailable_windows';

async function loadUnavailable(now: number): Promise<FreeSlot[]> {
  try {
    const parsed = JSON.parse((await getMeta(UNAVAILABLE_KEY)) ?? '[]') as FreeSlot[];
    return parsed.filter((w) => w.end > now); // past windows no longer matter
  } catch {
    return [];
  }
}

/**
 * Remembers a time range the student can't study in, then rebuilds the whole
 * schedule around it. Windows persist, so the automatic rebuild after each
 * sync won't put work back there.
 */
export async function markUnavailableAndReschedule(startAt: string, endAt: string): Promise<void> {
  const windows = await loadUnavailable(Date.now());
  windows.push({ start: new Date(startAt).getTime(), end: new Date(endAt).getTime() });
  await setMeta(UNAVAILABLE_KEY, JSON.stringify(windows));
  await commitProposedSchedule(await buildProposedSchedule());
}

// --- Pinned blocks: times the student chose themselves ----------------------------

const PINS_KEY = 'pinned_blocks';

export type BusyWindow = { start: number; end: number };

/** Saved busy times that haven't ended yet, soonest first. */
export async function getUnavailableWindows(): Promise<BusyWindow[]> {
  return (await loadUnavailable(Date.now())).sort((a, b) => a.start - b.start);
}

/** Removes the given busy times (all of them when none are given) and rebuilds the schedule. */
export async function removeUnavailableWindows(toRemove?: BusyWindow[]): Promise<void> {
  const keep = toRemove
    ? (await loadUnavailable(Date.now())).filter((w) => !toRemove.some((r) => r.start === w.start && r.end === w.end))
    : [];
  await setMeta(UNAVAILABLE_KEY, JSON.stringify(keep));
  await commitProposedSchedule(await buildProposedSchedule());
}

export type Pin = { assignmentId: string; start: number; end: number };

type BlockRef = { assignment_id: string; start_at: string; end_at: string };

export const pinKey = (assignmentId: string, start: number | string) =>
  `${assignmentId}|${typeof start === 'number' ? start : new Date(start).getTime()}`;

async function loadPins(now: number): Promise<Pin[]> {
  try {
    const parsed = JSON.parse((await getMeta(PINS_KEY)) ?? '[]') as Pin[];
    return parsed.filter((p) => p.end > now);
  } catch {
    return [];
  }
}

/** Keys (see pinKey) of the blocks the student has pinned, for showing a pin on them. */
export async function getPinnedKeys(): Promise<Set<string>> {
  return new Set((await loadPins(Date.now())).map((p) => pinKey(p.assignmentId, p.start)));
}

/**
 * Moves one block to a new start time (keeping its length), pins it there, and rebuilds the rest of
 * the schedule around it. Pinned blocks are never moved by later rebuilds, and they count toward
 * their assignment's study time, so no extra session is added to make up for them.
 */
export async function moveBlock(block: BlockRef, newStartMs: number): Promise<void> {
  const oldStart = new Date(block.start_at).getTime();
  const durationMs = new Date(block.end_at).getTime() - oldStart;
  const pins = (await loadPins(Date.now())).filter(
    (p) => !(p.assignmentId === block.assignment_id && p.start === oldStart),
  );
  pins.push({ assignmentId: block.assignment_id, start: newStartMs, end: newStartMs + durationMs });
  await setMeta(PINS_KEY, JSON.stringify(pins));
  await commitProposedSchedule(await buildProposedSchedule());
}

/** Hands a pinned block back to the scheduler. */
export async function unpinBlock(block: BlockRef): Promise<void> {
  const start = new Date(block.start_at).getTime();
  const pins = (await loadPins(Date.now())).filter(
    (p) => !(p.assignmentId === block.assignment_id && p.start === start),
  );
  await setMeta(PINS_KEY, JSON.stringify(pins));
  await commitProposedSchedule(await buildProposedSchedule());
}

// --- Finished sessions -----------------------------------------------------------

const DONE_KEY = 'done_minutes';

async function loadDone(): Promise<Record<string, number>> {
  try {
    return JSON.parse((await getMeta(DONE_KEY)) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** Study minutes already finished per assignment id, for showing progress. */
export async function getDoneMinutes(): Promise<Record<string, number>> {
  return loadDone();
}

/**
 * Marks a session as finished: its minutes count toward the assignment's total, the block leaves the
 * schedule, and the remaining sessions re-plan around what's left (no more sessions once it's covered).
 */
export async function markBlockDone(block: BlockRef): Promise<void> {
  const start = new Date(block.start_at).getTime();
  const minutes = Math.round((new Date(block.end_at).getTime() - start) / 60000);
  const done = await loadDone();
  done[block.assignment_id] = (done[block.assignment_id] ?? 0) + minutes;
  await setMeta(DONE_KEY, JSON.stringify(done));
  // A pinned block that is now finished must not be placed again.
  const pins = (await loadPins(Date.now())).filter(
    (p) => !(p.assignmentId === block.assignment_id && p.start === start),
  );
  await setMeta(PINS_KEY, JSON.stringify(pins));
  await commitProposedSchedule(await buildProposedSchedule());
}

export type ProposedBlock = {
  assignmentId: string;
  assignmentTitle: string;
  startAt: string;
  endAt: string;
};

type FreeSlot = { start: number; end: number };

/**
 * The schedulable window for a calendar day (local midnight `dayStartMs`):
 * 08:00–22:00, clipped to `now` so we never propose a block in the past.
 * Returns null once the whole window is behind us.
 */
function dayWindow(dayStartMs: number, now: number): FreeSlot | null {
  const start = new Date(dayStartMs);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  const end = new Date(dayStartMs);
  end.setHours(DAY_END_HOUR, 0, 0, 0);

  const windowStart = Math.max(start.getTime(), now);
  if (windowStart >= end.getTime()) return null;
  return { start: windowStart, end: end.getTime() };
}

// Subtracts busy event windows from the day's free window, returning the
// remaining free sub-ranges in order.
function subtractBusy(free: FreeSlot, busy: FreeSlot[]): FreeSlot[] {
  let remaining = [free];
  for (const b of busy) {
    const next: FreeSlot[] = [];
    for (const slot of remaining) {
      if (b.end <= slot.start || b.start >= slot.end) {
        next.push(slot);
        continue;
      }
      if (b.start > slot.start) next.push({ start: slot.start, end: Math.min(b.start, slot.end) });
      if (b.end < slot.end) next.push({ start: Math.max(b.end, slot.start), end: slot.end });
    }
    remaining = next;
  }
  return remaining.filter((s) => s.end - s.start >= MIN_SLOT_MINUTES * 60 * 1000);
}

/**
 * Builds proposed study sessions for upcoming assignments. Each assignment's
 * estimated effort is split into roughly hour-long sessions (planSessions),
 * spread evenly from today up to a day before it's due (so there's a buffer),
 * and fit into free time between calendar events, with a gap after each
 * session and at most MAX_DAY_MINUTES of study per day. Most urgent
 * assignment first. Does not write anything — call commitProposedSchedule()
 * to persist the result.
 */
export async function buildProposedSchedule(now: number = Date.now()): Promise<ProposedBlock[]> {
  const [assignments, events] = await Promise.all([getUpcomingAssignments(), getUpcomingEvents()]);

  const sorted = [...assignments].sort((a, b) => {
    if (b.urgency_score !== a.urgency_score) return b.urgency_score - a.urgency_score;
    const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return aDue - bDue;
  });

  // Calendar-day anchors at local midnight (via setDate, so DST shifts don't
  // drift the window off the day it belongs to).
  const dayStarts: number[] = [];
  for (let d = 0; d < LOOKAHEAD_DAYS; d++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d);
    dayStarts.push(day.getTime());
  }

  const eventWindows: FreeSlot[] = [
    ...events.map((e) => ({
      start: new Date(e.start_at).getTime(),
      end: new Date(e.end_at).getTime(),
    })),
    ...(await loadUnavailable(now)),
  ];

  const blocks: ProposedBlock[] = [];
  const pins = await loadPins(now);
  const doneMinutes = await loadDone();

  // Time already claimed per day (earlier assignments' sessions plus gaps),
  // and minutes of study per day, shared across all assignments.
  const claimedByDay = new Map<number, FreeSlot[]>();
  const loadByDay = new Map<number, number>();

  // First free slot on day `d` that fits `minutes` (or, when relaxed, at
  // least MIN_SLOT_MINUTES), finishing no later than `finishBy`.
  function findSlot(d: number, minutes: number, finishBy: number, relaxed: boolean): FreeSlot | null {
    const window = dayWindow(dayStarts[d], now);
    if (!window) return null;
    window.end = Math.min(window.end, finishBy);
    if (window.end - window.start < MIN_SLOT_MINUTES * 60000) return null;
    if (!relaxed && (loadByDay.get(d) ?? 0) + minutes > MAX_DAY_MINUTES) return null;
    const busy: FreeSlot[] = [
      ...eventWindows.filter((e) => e.end > window.start && e.start < window.end),
      ...(claimedByDay.get(d) ?? []),
    ];
    const need = (relaxed ? MIN_SLOT_MINUTES : minutes) * 60000;
    return subtractBusy(window, busy).find((slot) => slot.end - slot.start >= need) ?? null;
  }

  // Pinned blocks go in first, exactly where the student put them, so everything else plans around them.
  const assignmentById = new Map(sorted.map((a) => [a.id, a]));
  const pinnedMinutes = new Map<string, number>();
  for (const pin of pins) {
    const assignment = assignmentById.get(pin.assignmentId);
    if (!assignment) continue; // its assignment is gone (handed in, dismissed, past due)
    const minutes = (pin.end - pin.start) / 60000;
    blocks.push({
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      startAt: new Date(pin.start).toISOString(),
      endAt: new Date(pin.end).toISOString(),
    });
    pinnedMinutes.set(assignment.id, (pinnedMinutes.get(assignment.id) ?? 0) + minutes);
    const d = dayStarts.findIndex((dayStart, i) => pin.start >= dayStart && pin.start < (dayStarts[i + 1] ?? dayStart + DAY_MS));
    if (d >= 0) {
      claimedByDay.set(d, [...(claimedByDay.get(d) ?? []), { start: pin.start, end: pin.end + SESSION_GAP_MINUTES * 60000 }]);
      loadByDay.set(d, (loadByDay.get(d) ?? 0) + minutes);
    }
  }

  for (const assignment of sorted) {
    const remainingMinutes =
      assignment.suggested_minutes - (pinnedMinutes.get(assignment.id) ?? 0) - (doneMinutes[assignment.id] ?? 0);
    if (remainingMinutes < MIN_SLOT_MINUTES) continue;
    const sessions = planSessions(remainingMinutes);

    const dueMs = assignment.due_at ? new Date(assignment.due_at).getTime() : now + LOOKAHEAD_DAYS * DAY_MS;
    // Aim to finish a day early when there's room for that; otherwise an hour before it's due.
    let finishBy = dueMs - (dueMs - now > 36 * HOUR_MS ? 24 * HOUR_MS : HOUR_MS);
    if (finishBy <= now) finishBy = dueMs;

    let lastDay = 0;
    for (let d = 0; d < LOOKAHEAD_DAYS; d++) if (dayStarts[d] < finishBy) lastDay = d;

    sessions.forEach((sessionMinutes, k) => {
      // Spread sessions evenly across the days available; a lone session goes as early as possible.
      const preferred = sessions.length === 1 ? 0 : Math.round((k * lastDay) / (sessions.length - 1));
      const order = [
        ...Array.from({ length: lastDay - preferred + 1 }, (_, i) => preferred + i),
        ...Array.from({ length: preferred }, (_, i) => preferred - 1 - i),
      ];

      for (const relaxed of [false, true]) {
        for (const d of order) {
          const slot = findSlot(d, sessionMinutes, finishBy, relaxed);
          if (!slot) continue;
          const take = Math.min(sessionMinutes, (slot.end - slot.start) / 60000);
          const blockStart = slot.start;
          const blockEnd = blockStart + take * 60000;
          blocks.push({
            assignmentId: assignment.id,
            assignmentTitle: assignment.title,
            startAt: new Date(blockStart).toISOString(),
            endAt: new Date(blockEnd).toISOString(),
          });
          claimedByDay.set(d, [
            ...(claimedByDay.get(d) ?? []),
            { start: blockStart, end: blockEnd + SESSION_GAP_MINUTES * 60000 },
          ]);
          loadByDay.set(d, (loadByDay.get(d) ?? 0) + take);
          return; // this session is placed
        }
      }
    });
  }

  return blocks;
}

export async function commitProposedSchedule(blocks: ProposedBlock[]): Promise<void> {
  // The proposal is a full rebuild of every block, so wipe the old rows first.
  // Without this, re-running the scheduler appends a second set alongside the
  // previous one whenever the generated ids change (they embed the array index
  // and the slot time, both of which shift as time/data change).
  await clearScheduleBlocks();
  await upsertScheduleBlocks(
    blocks.map((b, i) => ({
      id: `${b.assignmentId}-${i}-${b.startAt}`,
      assignment_id: b.assignmentId,
      start_at: b.startAt,
      end_at: b.endAt,
    })),
  );
  // Background: neither dozens of notifications nor Google Calendar calls should hold up the UI.
  void rescheduleReminders();
  void pushStudyBlocksToCalendar();
}

export type { Assignment };
