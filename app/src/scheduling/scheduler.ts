// Owner: Person B
// Greedy allocator: sorts assignments by urgencyScore + dueAt, places suggestedMinutes
// into free slots relative to calendar events, writes schedule_blocks.

import {
  clearScheduleBlocks,
  getUpcomingAssignments,
  getUpcomingEvents,
  upsertScheduleBlocks,
  type Assignment,
} from '../db/queries';
import { rescheduleReminders } from '../notifications/reminders';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SLOT_MINUTES = 15;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;
const LOOKAHEAD_DAYS = 14;

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
 * Builds proposed study-time blocks for upcoming assignments, fit into free
 * time between calendar events over the next LOOKAHEAD_DAYS. Greedy: most
 * urgent assignment first, earliest available free slot first. Does not
 * write anything — call commitProposedSchedule() to persist the result.
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

  const eventWindows: FreeSlot[] = events.map((e) => ({
    start: new Date(e.start_at).getTime(),
    end: new Date(e.end_at).getTime(),
  }));

  const blocks: ProposedBlock[] = [];

  // Blocks already placed for earlier assignments, per day, so later
  // assignments don't double-book the same slot. Shared across all
  // assignments (unlike the per-assignment loop variable below).
  const claimedByDay = new Map<number, FreeSlot[]>();

  for (const assignment of sorted) {
    let minutesLeft = assignment.suggested_minutes;
    if (minutesLeft <= 0) continue;

    const dueMs = assignment.due_at ? new Date(assignment.due_at).getTime() : now + LOOKAHEAD_DAYS * DAY_MS;

    for (let d = 0; d < LOOKAHEAD_DAYS && minutesLeft > 0; d++) {
      const dayStart = dayStarts[d];
      if (dayStart >= dueMs) break;

      const window = dayWindow(dayStart, now);
      if (!window) continue; // today's 08:00–22:00 window is already over

      // Busy = calendar events overlapping this day's window, plus the slots
      // earlier assignments already claimed on this day.
      const busy: FreeSlot[] = [
        ...eventWindows.filter((e) => e.end > window.start && e.start < window.end),
        ...(claimedByDay.get(d) ?? []),
      ];

      for (const slot of subtractBusy(window, busy)) {
        if (minutesLeft <= 0) break;
        const slotMinutes = (slot.end - slot.start) / 60000;
        const take = Math.min(minutesLeft, slotMinutes);
        if (take < MIN_SLOT_MINUTES) continue;

        const blockStart = slot.start;
        const blockEnd = blockStart + take * 60000;
        blocks.push({
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          startAt: new Date(blockStart).toISOString(),
          endAt: new Date(blockEnd).toISOString(),
        });

        // Claim this time so later assignments don't double-book it.
        claimedByDay.set(d, [...(claimedByDay.get(d) ?? []), { start: blockStart, end: blockEnd }]);
        minutesLeft -= take;
      }
    }
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
  await rescheduleReminders().catch((e) => console.warn('[reminders] reschedule failed', e));
}

export type { Assignment };
