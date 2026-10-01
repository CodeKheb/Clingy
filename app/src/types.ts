// Mirrors backend/src/types.ts and CONTRACT.md — keep in sync.

export type CourseworkResponse = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  /** Absent when talking to a backend deployed before this field existed. */
  turnedIn?: boolean;
  raw: unknown;
}[];

export type CalendarEventResponse = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  raw: unknown;
}[];

export type AuthUrlResponse = { url: string };

export type AuthTokenResponse = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string | null;
};
