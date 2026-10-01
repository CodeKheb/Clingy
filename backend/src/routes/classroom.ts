import { Router } from "express";
import { google } from "googleapis";
import { createOAuthClient } from "../services/googleClient";
import type { CourseworkResponse } from "../types";

export const classroomRouter = Router();

// TODO(Person A): replace header-based token passthrough with real session lookup.
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
