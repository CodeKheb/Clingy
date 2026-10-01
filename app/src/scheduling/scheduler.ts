// Owner: Person B
// Greedy allocator: sorts assignments by urgencyScore + dueAt, places suggestedMinutes
// into free slots relative to calendar events, writes schedule_blocks.

import { getUpcomingAssignments, getUpcomingEvents, upsertScheduleBlocks, type Assignment } from '../db/queries';

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

function dayWindow(dayStartMs: number): FreeSlot {
  const day = new Date(dayStartMs);
  const start = new Date(day);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  const end = new Date(day);
  end.setHours(DAY_END_HOUR, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
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

  const busyByDay = new Map<number, FreeSlot[]>();
  for (let d = 0; d < LOOKAHEAD_DAYS; d++) {
    const dayStart = now + d * DAY_MS;
    busyByDay.set(
      d,
      events
        .map((e) => ({ start: new Date(e.start_at).getTime(), end: new Date(e.end_at).getTime() }))
        .filter((e) => e.end > dayStart && e.start < dayStart + DAY_MS),
    );
  }

  const blocks: ProposedBlock[] = [];

  for (const assignment of sorted) {
    let minutesLeft = assignment.suggested_minutes;
    if (minutesLeft <= 0) continue;

    const dueMs = assignment.due_at ? new Date(assignment.due_at).getTime() : now + LOOKAHEAD_DAYS * DAY_MS;

    for (let d = 0; d < LOOKAHEAD_DAYS && minutesLeft > 0; d++) {
      const dayStart = now + d * DAY_MS;
      if (dayStart >= dueMs) break;

      const free = subtractBusy(dayWindow(dayStart), busyByDay.get(d) ?? []);
      for (const slot of free) {
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
        busyByDay.set(d, [...(busyByDay.get(d) ?? []), { start: blockStart, end: blockEnd }]);
        minutesLeft -= take;
      }
    }
  }

  return blocks;
}

export async function commitProposedSchedule(blocks: ProposedBlock[]): Promise<void> {
  await upsertScheduleBlocks(
    blocks.map((b, i) => ({
      id: `${b.assignmentId}-${i}-${b.startAt}`,
      assignment_id: b.assignmentId,
      start_at: b.startAt,
      end_at: b.endAt,
    })),
  );
}

export type { Assignment };
