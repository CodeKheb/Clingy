// Owner: Person C — heuristic baseline implementation of scorePriority().
// Kept as the permanent fallback (and used before the TFLite model finishes
// loading): days-until-due decay + keyword cues. Zero dependencies, fully sync.

import type { PriorityInput, PriorityOutput } from './index';

const DAY_MS = 24 * 60 * 60 * 1000;

// Ordered: first matching class wins. LOW beats URGENT so "optional exam
// reading" doesn't read as urgent; URGENT beats HIGH so "exam tomorrow" wins
// over generic "submit" phrasing.
const CUES: { pattern: RegExp; urgency: number; baseMinutes: number }[] = [
  { pattern: /\b(optional|not graded|extra credit|recommended background|no (firm )?due date|due date (yet|tbd|to be)|will (be )?announc|announced (in|at) class)\b/, urgency: 0.1, baseMinutes: 30 },
  { pattern: /\b(exam|midterm|final|overdue|urgent|asap|tonight)\b/, urgency: 0.95, baseMinutes: 90 },
  { pattern: /\b(project|essay|presentation|demo|deadline|submit)\b/, urgency: 0.7, baseMinutes: 120 },
  { pattern: /\b(quiz|homework|problem set|lab report|worksheet|assignment)\b/, urgency: 0.5, baseMinutes: 60 },
];

const MINUTES_MIN = 15;
const MINUTES_MAX = 240;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function scorePriorityHeuristic(input: PriorityInput): PriorityOutput {
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();

  const daysUntil =
    input.dueAt === null ? null : (new Date(input.dueAt).getTime() - Date.now()) / DAY_MS;
  const dueUrgency = daysUntil === null ? 0 : daysUntil <= 0 ? 1 : Math.exp(-daysUntil / 7);

  const cue = CUES.find(({ pattern }) => pattern.test(text)) ?? { urgency: 0.3, baseMinutes: 45 };

  // Same blend shape as tfliteScorer.combineUrgency() so the two implementations
  // produce comparable scores and the swap stays invisible to Person B.
  const urgencyScore =
    input.dueAt === null
      ? clamp01(0.05 + 0.25 * cue.urgency)
      : clamp01(0.7 * dueUrgency + 0.3 * cue.urgency);

  const suggestedMinutes = Math.min(
    MINUTES_MAX,
    Math.max(MINUTES_MIN, Math.round(cue.baseMinutes * (0.6 + 0.8 * urgencyScore)))
  );

  return { urgencyScore, suggestedMinutes };
}
