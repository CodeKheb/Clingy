import { Router } from "express";
import { google } from "googleapis";
import { createOAuthClient } from "../services/googleClient";
import type { CourseworkResponse } from "../types";

export const classroomRouter = Router();

// Stateless by design: the app sends its Google access token on every request and nothing is stored server-side.
classroomRouter.get("/coursework", async (req, res) => {
  const accessToken = req.headers.authorization?.replace("Bearer ", "");
  if (!accessToken) {
    res.status(401).json({ error: "missing access token" });
    return;
  }

  try {
    const client = createOAuthClient();
    client.setCredentials({ access_token: accessToken });
    const classroom = google.classroom({ version: "v1", auth: client });

    const courses = await classroom.courses.list();
    const result: CourseworkResponse = [];

    for (const course of courses.data.courses ?? []) {
      const coursework = await classroom.courses.courseWork.list({ courseId: course.id! });

      // courseWorkId "-" lists the student's submissions across the whole course in one call.
      // Best-effort: if it fails, nothing is marked handed in rather than failing the request.
      const handedIn = new Set<string>();
      try {
        const submissions = await classroom.courses.courseWork.studentSubmissions.list({
          courseId: course.id!,
          courseWorkId: "-",
          userId: "me",
        });
        for (const sub of submissions.data.studentSubmissions ?? []) {
          if (sub.courseWorkId && (sub.state === "TURNED_IN" || sub.state === "RETURNED")) {
            handedIn.add(sub.courseWorkId);
          }
        }
      } catch (error: any) {
        console.error("Error fetching submissions:", error?.message || error);
      }
      for (const work of coursework.data.courseWork ?? []) {
        let dueAt: string | null = null;
        if (work.dueDate) {
          const year = work.dueDate.year!;
          const month = (work.dueDate.month ?? 1) - 1;
          const day = work.dueDate.day!;
          const hours = work.dueTime?.hours ?? 23;
          const minutes = work.dueTime?.minutes ?? 59;
          dueAt = new Date(Date.UTC(year, month, day, hours, minutes)).toISOString();
        }

        result.push({
          id: work.id!,
          courseId: course.id!,
          courseName: course.name ?? "",
          title: work.title ?? "",
          description: work.description ?? null,
          dueAt,
          turnedIn: handedIn.has(work.id!),
          raw: work,
        });
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error fetching coursework:", error?.message || error);
    res.status(error?.code === 401 ? 401 : 500).json({ error: "Failed to fetch coursework from Google Classroom" });
  }
});
