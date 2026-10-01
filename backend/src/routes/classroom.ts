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

  const client = createOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const classroom = google.classroom({ version: "v1", auth: client });

  const courses = await classroom.courses.list();
  const result: CourseworkResponse = [];

  for (const course of courses.data.courses ?? []) {
    const coursework = await classroom.courses.courseWork.list({ courseId: course.id! });
    for (const work of coursework.data.courseWork ?? []) {
      result.push({
        id: work.id!,
        courseId: course.id!,
        courseName: course.name ?? "",
        title: work.title ?? "",
        description: work.description ?? null,
        dueAt:
          work.dueDate && work.dueTime
            ? new Date(
                work.dueDate.year!,
                (work.dueDate.month ?? 1) - 1,
                work.dueDate.day!,
                work.dueTime.hours ?? 0,
                work.dueTime.minutes ?? 0
              ).toISOString()
            : null,
        raw: work,
      });
    }
  }

  res.json(result);
});
