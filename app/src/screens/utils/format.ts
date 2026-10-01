// Date/duration formatting shared by the Home and Schedule screens.

/** "9:05 AM" for an ISO timestamp. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** "45m" / "1h 30m" elapsed between two ISO timestamps. */
export function durationLabel(startIso: string, endIso: string): string {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000,
  );
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

/** "45m" / "1h 30m" for a minute count (0–negative renders an em dash). */
export function durationEstimate(mins: number): string {
  if (mins <= 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

/** Relative due-date label: "Overdue" | "Due today" | "Tomorrow" | "In 3 days" | "Oct 12". */
export function dueLabel(dueAt: string | null): string {
  if (!dueAt) return 'No due date';
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const diffDays = Math.round((due - now) / (24 * 60 * 60_000));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return new Date(dueAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Day section label: "Today" | "Tomorrow" | "Yesterday" | "Mon, Oct 6". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(d) - startOfDay(now)) / (24 * 60 * 60_000),
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** True when the ISO timestamp falls on the current calendar day. */
export function isToday(iso: string): boolean {
  return dayLabel(iso) === 'Today';
}
