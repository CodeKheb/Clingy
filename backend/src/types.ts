export type CourseworkResponse = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  turnedIn: boolean;
  raw: unknown;
}[];

export type CalendarEventResponse = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  raw: unknown;
}[];
