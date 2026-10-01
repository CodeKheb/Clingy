// Shared day and time helpers for the class timetable. day_of_week follows Date.getDay(): 0 = Sunday.

import type { ClassMeeting, ClassMeetingInput } from '../db/queries';

/** Monday-first, as students read a week. */
export const DAYS: { dow: number; chip: string; short: string }[] = [
  { dow: 1, chip: 'M', short: 'Mon' },
  { dow: 2, chip: 'T', short: 'Tue' },
  { dow: 3, chip: 'W', short: 'Wed' },
  { dow: 4, chip: 'Th', short: 'Thu' },
  { dow: 5, chip: 'F', short: 'Fri' },
  { dow: 6, chip: 'S', short: 'Sat' },
  { dow: 0, chip: 'Su', short: 'Sun' },
];

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A class as the form edits it: one subject and time on any number of days. */
export type ClassDraft = {
  key: string;
  subject: string;
  days: number[];
  start: number;
  end: number;
  room: string;
};

export function draftError(d: ClassDraft): string | null {
  if (!d.subject.trim()) return 'Add a subject';
  if (d.days.length === 0) return 'Pick at least one day';
  if (d.end <= d.start) return 'End time must be after start';
  return null;
}

export function draftToMeetings(d: ClassDraft): ClassMeetingInput[] {
  return d.days.map((dow) => ({
    subject: d.subject.trim(),
    day_of_week: dow,
    start_minutes: d.start,
    end_minutes: d.end,
    room: d.room.trim() || null,
  }));
}

export function meetingToDraft(m: ClassMeeting): ClassDraft {
  return {
    key: String(m.id),
    subject: m.subject,
    days: [m.day_of_week],
    start: m.start_minutes,
    end: m.end_minutes,
    room: m.room ?? '',
  };
}
