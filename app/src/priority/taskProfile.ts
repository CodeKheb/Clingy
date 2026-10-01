// What kind of work is this, how long does it really take, how much is riding
// on it, and how should study sessions for it be labelled? Pure logic (no
// native modules) so the scorer, scheduler and reminders can all share it.
//
// Effort depends on the TASK, never on how late you start. Urgency then comes
// from three things: how close the due date is, the stakes, and how crowded
// the remaining time is relative to the effort needed.

export type TaskType = 'admin' | 'exam' | 'project' | 'writing' | 'problemset' | 'reading' | 'general';

export const TASK_TYPES: TaskType[] = ['admin', 'exam', 'project', 'writing', 'problemset', 'reading', 'general'];

type Profile = {
  baseMinutes: number;
  stakes: number; // 0-1, how much is typically riding on this kind of work
  phases: string[]; // session labels, first to last
};

export const TASK_PROFILES: Record<TaskType, Profile> = {
  admin: { baseMinutes: 20, stakes: 0.3, phases: ['Do & submit'] },
  exam: { baseMinutes: 150, stakes: 1.0, phases: ['Review notes', 'Practice problems', 'Mock test', 'Final review'] },
  project: { baseMinutes: 180, stakes: 0.9, phases: ['Plan & scope', 'Build', 'Build', 'Polish & test'] },
  writing: { baseMinutes: 120, stakes: 0.7, phases: ['Outline', 'Draft', 'Draft', 'Revise & proofread'] },
  problemset: { baseMinutes: 75, stakes: 0.55, phases: ['Work through problems', 'Finish & check'] },
  reading: { baseMinutes: 40, stakes: 0.3, phases: ['Read & take notes'] },
  general: { baseMinutes: 60, stakes: 0.5, phases: ['Start', 'Finish & check'] },
};

// Order matters: the first match wins, so an "optional exam reading" is reading.
const KEYWORD_RULES: { type: TaskType; pattern: RegExp }[] = [
  { type: 'reading', pattern: /\b(optional|reading|read|watch|video|review material|reference)\b/i },
  { type: 'admin', pattern: /\b(proof|screenshot|upload|survey|eval|evaluation|attendance|registration|enrollment|certificate|certiport|sign[- ]?up)\b/i },
  { type: 'exam', pattern: /\b(exam|midterm|finals|quiz|test|assessment)\b/i },
  { type: 'project', pattern: /\b(project|presentation|demo|capstone|prototype|portfolio|groupings?)\b/i },
  { type: 'writing', pattern: /\b(essay|paper|report|reflection|write[- ]?up|journal|article|case study)\b/i },
  { type: 'problemset', pattern: /\b(homework|problem set|worksheet|activity|exercise|lab|assignment|drill)\b/i },
];

export function classifyByKeywords(title: string, description: string | null): TaskType | null {
  // Title first: descriptions mention "exam" or "project" in passing far too often.
  // Underscores count as word characters in regexes; titles like "FINAL TERM_Activity 02" need them as spaces.
  for (const text of [title, description ?? ''].map((t) => t.replace(/_/g, ' '))) {
    for (const { type, pattern } of KEYWORD_RULES) {
      if (pattern.test(text)) return type;
    }
  }
  return null;
}

/** Minutes of focused work this task needs: type baseline, scaled by points and brief length. Not urgency. */
export function estimateMinutes(type: TaskType, maxPoints: number | null, description: string | null): number {
  let minutes = TASK_PROFILES[type].baseMinutes;
  if (maxPoints !== null && maxPoints > 0) minutes *= 0.7 + 0.6 * Math.min(maxPoints, 100) / 100;
  const length = description?.length ?? 0;
  if (length > 600) minutes *= 1.15;
  else if (length > 0 && length < 60) minutes *= 0.9;
  return Math.max(20, Math.min(300, Math.round(minutes / 5) * 5));
}

/** 0-1: how much is riding on this, from the kind of work and (when known) its point value. */
export function stakesFor(type: TaskType, maxPoints: number | null): number {
  const base = TASK_PROFILES[type].stakes;
  if (maxPoints === null || maxPoints <= 0) return base;
  return 0.6 * base + 0.4 * Math.min(maxPoints, 100) / 100;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Blend of due-date proximity (50%), stakes (25%) and crunch (25%): the
 * effort still needed versus the time left, assuming roughly 2 usable study
 * hours a day. Overdue work is maximally urgent.
 */
export function urgencyFrom(dueAt: string | null, minutes: number, stakes: number, now: number = Date.now()): number {
  if (dueAt === null) return Math.min(0.3, 0.3 * stakes);
  const daysLeft = (new Date(dueAt).getTime() - now) / DAY_MS;
  if (daysLeft <= 0) return 1;
  const dueUrgency = Math.exp(-daysLeft / 5);
  const crunch = Math.min(1, minutes / (Math.max(daysLeft, 0.25) * 120));
  return Math.min(1, 0.5 * dueUrgency + 0.25 * stakes + 0.25 * crunch);
}

/** Splits an estimate into study sessions of roughly an hour each (30 to 90 min). */
export function planSessions(totalMinutes: number): number[] {
  const count = Math.max(1, Math.round(totalMinutes / 60));
  const each = Math.max(25, Math.ceil(totalMinutes / count / 5) * 5);
  return Array.from({ length: count }, () => each);
}

/** "Session 2 of 3 · Draft" — the phase is spread evenly across however many sessions there are. */
export function sessionLabel(type: TaskType, index: number, count: number): string {
  const phases = TASK_PROFILES[type].phases;
  const phase = count === 1 ? phases[0] : phases[Math.min(phases.length - 1, Math.round((index / (count - 1)) * (phases.length - 1)))];
  return count === 1 ? phase : `Session ${index + 1} of ${count} · ${phase}`;
}

/** Labels for blocks, keyed by block id. Blocks of one assignment are numbered in time order. */
export function sessionLabels<B extends { id: string; assignment_id: string; start_at: string }>(
  blocks: B[],
  typeByAssignment: Map<string, TaskType>,
): Map<string, string> {
  const byAssignment = new Map<string, B[]>();
  for (const block of blocks) {
    byAssignment.set(block.assignment_id, [...(byAssignment.get(block.assignment_id) ?? []), block]);
  }
  const labels = new Map<string, string>();
  for (const [assignmentId, group] of byAssignment) {
    const type = typeByAssignment.get(assignmentId) ?? 'general';
    [...group]
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .forEach((block, i, all) => labels.set(block.id, sessionLabel(type, i, all.length)));
  }
  return labels;
}
