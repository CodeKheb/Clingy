// What the floating Cling says, and when. Pure (no database, no clock, no randomness of its own) so
// the rules can be tested; useClingNudge.ts feeds it real data.

import type { ClingAnimationName } from './clingFrames';

export type Nudge = { key: string; text: string; animation: ClingAnimationName };

export type NudgeInput = {
  now: Date;
  assignments: { title: string; due_at: string | null; task_type: string }[];
  blocks: { start_at: string; end_at: string; assignment_title: string }[];
  classes: { subject: string; day_of_week: number; start_minutes: number; end_minutes: number; room: string | null }[];
  /** Key of the last nudge shown, so the same line never repeats back to back. */
  lastKey: string | null;
  rand: () => number;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

function pick<T>(items: T[], rand: () => number): { item: T; index: number } {
  const index = Math.min(items.length - 1, Math.floor(rand() * items.length));
  return { item: items[index], index };
}

/** Turns a list of lines into a nudge, choosing one at random (never the one just shown). */
function say(kind: string, lines: string[], animation: ClingAnimationName, input: NudgeInput): Nudge {
  const options = lines.map((text, i) => ({ text, key: `${kind}:${i}` })).filter((o) => o.key !== input.lastKey);
  const { item } = pick(options.length > 0 ? options : lines.map((text, i) => ({ text, key: `${kind}:${i}` })), input.rand);
  return { key: item.key, text: item.text, animation };
}

const days = (ms: number) => Math.max(1, Math.ceil(ms / (24 * HOUR)));
const clip = (title: string) => (title.length > 34 ? `${title.slice(0, 33)}…` : title);

const FILLER = [
  'Hi. Still here. Still clingy. 🥺',
  "I got lonely for 0.4 seconds, so I'm back.",
  'Psst. You are doing better than you think. Now pet me.',
  "Don't mind me. Just clinging. 🧡",
  'Water check! Drink some, then come back to me.',
  "I'm not saying you should open your tasks. I'm just staring at them.",
  'Stretch your shoulders. I said it nicely. Do it. 😤',
  "Whatever you're doing, I'm proud of you. Tap me!",
];

const SLEEP_EXAM = [
  'Exam soon… which is exactly why you must SLEEP. A tired brain forgets everything. 😴',
  "It's late and you have an exam coming. Bed. Now. I'll cling to you tomorrow.",
  "Cramming at this hour won't stick. Sleep first, shine later. 🌙",
  "Close the books. A rested you beats a tired you who read one more page.",
];

const SLEEP_PLAIN = [
  "It's very late. Why are we awake? Sleep. 😴",
  "My eyes are closing. Yours should too. Goodnight?",
  'Tomorrow-you wants this person to go to bed. Right now.',
];

const WIND_DOWN_EXAM = [
  'Exam tomorrow! One last light review, then lights out early. Promise me. 🌙',
  "Big day tomorrow. Pack your bag, review a little, then SLEEP. I'll check on you. 👀",
  'Tomorrow is exam day. Sleep is part of studying. It counts. It really does.',
];

/** The nudge to show right now, or null to stay quiet this time. */
export function pickNudge(input: NudgeInput): Nudge | null {
  const { now, assignments, blocks, classes } = input;
  const nowMs = now.getTime();
  const hour = now.getHours();
  const minutes = hour * 60 + now.getMinutes();
  const late = hour >= 23 || hour < 5;

  const exams = assignments
    .filter((a) => a.task_type === 'exam' && a.due_at)
    .map((a) => ({ title: a.title, left: new Date(a.due_at!).getTime() - nowMs }))
    .filter((e) => e.left > 0 && e.left <= 72 * HOUR)
    .sort((a, b) => a.left - b.left);
  const exam = exams[0];

  // Bedtime beats everything: sleep is the most useful thing to nag about when an exam is near.
  if (late) return say(exam ? 'sleep-exam' : 'sleep', exam ? SLEEP_EXAM : SLEEP_PLAIN, 'sleep', input);
  if (exam && exam.left <= 36 * HOUR && hour >= 20) return say('wind-down', WIND_DOWN_EXAM, 'sleep', input);

  const todays = classes.filter((c) => c.day_of_week === now.getDay());
  // In class: stay quiet, Cling is clingy, not rude.
  if (todays.some((c) => minutes >= c.start_minutes && minutes < c.end_minutes)) return null;

  const nextClass = todays
    .filter((c) => c.start_minutes > minutes && c.start_minutes - minutes <= 30)
    .sort((a, b) => a.start_minutes - b.start_minutes)[0];
  if (nextClass) {
    const inMin = nextClass.start_minutes - minutes;
    const where = nextClass.room ? ` at ${nextClass.room}` : '';
    return say(
      `class:${nextClass.subject}`,
      [
        `${nextClass.subject} in ${inMin} min${where}! Shoes on, I'm coming with you. 🎒`,
        `Hey hey, ${nextClass.subject} starts in ${inMin} min${where}. Don't be late or I'll cling to your ankle.`,
        `${inMin} minutes until ${nextClass.subject}${where}. Go go go! 🏃`,
      ],
      'reminder',
      input,
    );
  }

  const soonBlock = blocks
    .map((b) => ({ b, start: new Date(b.start_at).getTime(), end: new Date(b.end_at).getTime() }))
    .filter(({ start, end }) => end > nowMs && start - nowMs <= 20 * MIN)
    .sort((a, b) => a.start - b.start)[0];
  if (soonBlock) {
    const title = clip(soonBlock.b.assignment_title);
    const started = soonBlock.start <= nowMs;
    return say(
      `block:${title}`,
      started
        ? [
            `Study time for "${title}" is happening RIGHT NOW. I'm watching. 👀`,
            `"${title}" session started. Open the book, I'll wait… loudly.`,
          ]
        : [
            `"${title}" study session in a few minutes. Get your snacks ready! 🍪`,
            `Almost study time for "${title}". Warm up that brain. 🧠`,
          ],
      'reminder',
      input,
    );
  }

  if (exam) {
    const title = clip(exam.title);
    const left = days(exam.left);
    return say(
      `exam:${title}`,
      [
        `"${title}" is in ${left} day${left > 1 ? 's' : ''}. I believe in you! Also, sleep early, I'll know if you don't. 😴`,
        `${left} day${left > 1 ? 's' : ''} to "${title}". A little review today = less panic later. 🧡`,
        `Exam alert: "${title}" in ${left} day${left > 1 ? 's' : ''}. Water, food, sleep. In that order. Then study.`,
      ],
      'reminder',
      input,
    );
  }

  const due = assignments
    .filter((a) => a.due_at)
    .map((a) => ({ title: a.title, left: new Date(a.due_at!).getTime() - nowMs }))
    .filter((a) => a.left > 0 && a.left <= 24 * HOUR)
    .sort((a, b) => a.left - b.left)[0];
  if (due) {
    const title = clip(due.title);
    const hours = Math.max(1, Math.round(due.left / HOUR));
    return say(
      `due:${title}`,
      [
        `"${title}" is due in ${hours}h. Hello? Hellooo? 👀`,
        `Not to be clingy but "${title}" is due in ${hours}h. (I am clingy.)`,
        `${hours}h left for "${title}". You've got this, start with the easy part!`,
      ],
      'reminder',
      input,
    );
  }

  return say('filler', FILLER, 'happy', input);
}
