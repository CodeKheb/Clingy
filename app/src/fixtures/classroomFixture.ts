// Hardcoded stand-in for GET /classroom/coursework and GET /calendar/events
// (see src/types.ts) for the first launch, before any sync has run.
// syncService.ts reads from here so HomeScreen/priority work isn't blocked
// on the backend.

import type { CalendarEventResponse, CourseworkResponse } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

function daysFromNow(days: number): string {
  return new Date(now + days * DAY_MS).toISOString();
}

// Deliberately varied due-date proximity and text tone (exam/project urgency
// cues vs routine/optional phrasing) so both the heuristic and embedding
// scorers in src/priority have something meaningful to differentiate.
export const CLASSROOM_FIXTURE: CourseworkResponse = [
  {
    id: 'cw-overdue-1',
    courseId: 'course-cs101',
    courseName: 'Intro to Computer Science',
    title: 'Problem Set 4: Recursion',
    description: 'Was due yesterday. Submit as soon as possible for partial credit.',
    dueAt: daysFromNow(-1),
    raw: null,
  },
  {
    id: 'cw-exam-tomorrow',
    courseId: 'course-bio201',
    courseName: 'Cell Biology',
    title: 'Midterm Exam',
    description: 'Cumulative exam covering chapters 1-8. Worth 30% of your grade. Bring a calculator.',
    dueAt: daysFromNow(1),
    raw: null,
  },
  {
    id: 'cw-project-soon',
    courseId: 'course-cs101',
    courseName: 'Intro to Computer Science',
    title: 'Final Project: Build a To-Do App',
    description:
      'High-stakes capstone project, due in three days. Must be demoed live in front of the class.',
    dueAt: daysFromNow(3),
    raw: null,
  },
  {
    id: 'cw-reading-optional',
    courseId: 'course-hist110',
    courseName: 'World History',
    title: 'Optional reading: Chapter 12',
    description: 'Not graded, just recommended background reading for next week\'s lecture.',
    dueAt: daysFromNow(5),
    raw: null,
  },
  {
    id: 'cw-quiz-nextweek',
    courseId: 'course-bio201',
    courseName: 'Cell Biology',
    title: 'Pop Quiz: Mitosis',
    description: 'Short 10-question quiz, low stakes, worth 2% of your grade.',
    dueAt: daysFromNow(7),
    raw: null,
  },
  {
    id: 'cw-essay-nodate',
    courseId: 'course-hist110',
    courseName: 'World History',
    title: 'Essay: Causes of World War I',
    description: 'No firm due date yet, instructor will announce in class.',
    dueAt: null,
    raw: null,
  },
  {
    id: 'cw-lab-twoweeks',
    courseId: 'course-chem150',
    courseName: 'General Chemistry',
    title: 'Lab Report: Titration Experiment',
    description: 'Write up results from last week\'s lab. Due in two weeks, standard formatting rules apply.',
    dueAt: daysFromNow(14),
    raw: null,
  },
];

export const CALENDAR_FIXTURE: CalendarEventResponse = [
  {
    id: 'ev-study-group',
    title: 'Study Group: Cell Biology Midterm',
    startAt: daysFromNow(0.5),
    endAt: daysFromNow(0.55),
    raw: null,
  },
  {
    id: 'ev-office-hours',
    title: 'CS101 Office Hours',
    startAt: daysFromNow(2),
    endAt: daysFromNow(2.1),
    raw: null,
  },
  {
    id: 'ev-free-block-1',
    title: 'Free Block',
    startAt: daysFromNow(1.3),
    endAt: daysFromNow(1.5),
    raw: null,
  },
];
