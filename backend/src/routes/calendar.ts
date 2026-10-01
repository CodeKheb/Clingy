import { Router } from "express";
import { google } from "googleapis";
import { createOAuthClient } from "../services/googleClient";
import type { CalendarEventResponse } from "../types";

export const calendarRouter = Router();

// TODO(Person A): replace header-based token passthrough with real session lookup.
calendarRouter.get("/events", async (req, res) => {
  const accessToken = req.headers.authorization?.replace("Bearer ", "");
  if (!accessToken) {
    res.status(401).json({ error: "missing access token" });
    return;
  }

  const client = createOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: "v3", auth: client });

  const events = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const result: CalendarEventResponse = (events.data.items ?? []).map((event) => ({
    id: event.id!,
    title: event.summary ?? "",
    startAt: event.start?.dateTime ?? event.start?.date ?? "",
    endAt: event.end?.dateTime ?? event.end?.date ?? "",
    raw: event,
  }));

  res.json(result);
});
