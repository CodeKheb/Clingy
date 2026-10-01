// Expands the weekly timetable into the concrete dates it falls on, in local time. Pure.

type Meeting = { day_of_week: number; start_minutes: number; end_minutes: number };

export type ClassOccurrence<T extends Meeting> = { meeting: T; start: number; end: number };

export function expandClassOccurrences<T extends Meeting>(meetings: T[], now: number, days: number): ClassOccurrence<T>[] {
  const out: ClassOccurrence<T>[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d); // via setDate so DST shifts don't drift off the day
    for (const meeting of meetings) {
      if (meeting.day_of_week !== day.getDay()) continue;
      const start = new Date(day);
      start.setHours(Math.floor(meeting.start_minutes / 60), meeting.start_minutes % 60, 0, 0);
      const end = new Date(day);
      end.setHours(Math.floor(meeting.end_minutes / 60), meeting.end_minutes % 60, 0, 0);
      out.push({ meeting, start: start.getTime(), end: end.getTime() });
    }
  }
  return out;
}
