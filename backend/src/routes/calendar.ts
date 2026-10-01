import { Router } from "express";
import { google } from "googleapis";
import { createOAuthClient } from "../services/googleClient";
import type { CalendarEventResponse } from "../types";
import {
  CLASS_WORDING,
  descriptionFor,
  planCalendarChanges,
  summaryFor,
  type DesiredBlock,
  type ExistingEvent,
} from "../services/studyBlockSync";

export const calendarRouter = Router();

// Stateless by design: the app sends its Google access token on every request and nothing is stored server-side.
calendarRouter.get("/events", async (req, res) => {
  const accessToken = req.headers.authorization?.replace("Bearer ", "");
  if (!accessToken) {
    res.status(401).json({ error: "missing access token" });
    return;
  }

  try {
    const client = createOAuthClient();
    client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: client });

    // Fetch events from all calendars (not just primary)
    const calendarList = await calendar.calendarList.list();
    const calendarIds = (calendarList.data.items ?? []).map((cal) => cal.id!);

    const timeMin = new Date().toISOString();
    const allEvents = await Promise.all(
      calendarIds.map((calendarId) =>
        calendar.events.list({
          calendarId,
          timeMin,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 50,
        }).catch(() => null) // skip calendars we can't read
      )
    );

    const result: CalendarEventResponse = allEvents
      .flatMap((res) => res?.data.items ?? [])
      // Study blocks Cling put on the calendar must not come back as busy time, or they'd block themselves.
      .filter((event) => event.extendedProperties?.private?.clingy !== "1" && event.extendedProperties?.private?.clingyClass !== "1")
      .sort((a, b) => {
        const aTime = a.start?.dateTime ?? a.start?.date ?? "";
        const bTime = b.start?.dateTime ?? b.start?.date ?? "";
        return aTime.localeCompare(bTime);
      })
      .map((event) => ({
      id: event.id!,
      title: event.summary ?? "",
      startAt: event.start?.dateTime ?? event.start?.date ?? "",
      endAt: event.end?.dateTime ?? event.end?.date ?? "",
      raw: event,
    }));

    res.json(result);
  } catch (error: any) {
    console.error("Error fetching calendar events:", error?.message || error);
    res.status(error?.code === 401 ? 401 : 500).json({ error: "Failed to fetch events from Google Calendar" });
  }
});

const CLING_FLAG = "clingy";

/**
 * Makes the Cling-made events on the primary calendar match the study blocks in the request body:
 * creates new ones, updates changed titles, and deletes ones that no longer exist (moved, finished).
 * Only events carrying Cling's private marker are ever touched; the student's own events are left alone.
 */
calendarRouter.post("/study-blocks", async (req, res) => {
  const accessToken = req.headers.authorization?.replace("Bearer ", "");
  if (!accessToken) {
    res.status(401).json({ error: "missing access token" });
    return;
  }

  const body = req.body as { blocks?: unknown };
  if (!Array.isArray(body?.blocks) || body.blocks.length > 300) {
    res.status(400).json({ error: "blocks must be an array of at most 300 items" });
    return;
  }
  const desired: DesiredBlock[] = [];
  for (const raw of body.blocks as Partial<DesiredBlock>[]) {
    const start = Date.parse(raw?.startAt ?? "");
    const end = Date.parse(raw?.endAt ?? "");
    if (typeof raw?.key !== "string" || typeof raw.title !== "string" || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      res.status(400).json({ error: "each block needs key, title, startAt and endAt (end after start)" });
      return;
    }
    desired.push({ key: raw.key, title: raw.title.slice(0, 200), label: String(raw.label ?? "").slice(0, 200), startAt: raw.startAt!, endAt: raw.endAt! });
  }

  try {
    const client = createOAuthClient();
    client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: client });

    const existing: ExistingEvent[] = [];
    let pageToken: string | undefined;
    do {
      const page = await calendar.events.list({
        calendarId: "primary",
        privateExtendedProperty: [`${CLING_FLAG}=1`],
        timeMin: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        singleEvents: true,
        maxResults: 250,
        pageToken,
      });
      for (const e of page.data.items ?? []) {
        if (e.id && e.extendedProperties?.private?.key) {
          existing.push({
            id: e.id,
            key: e.extendedProperties.private.key,
            summary: e.summary ?? "",
            description: e.description ?? "",
          });
        }
      }
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken);

    const { toCreate, toDelete, toUpdate } = planCalendarChanges(existing, desired);

    // A few at a time: Google rate-limits bursts of writes per user.
    const runInChunks = async <T>(items: T[], fn: (item: T) => Promise<unknown>) => {
      for (let i = 0; i < items.length; i += 4) await Promise.all(items.slice(i, i + 4).map(fn));
    };
    await runInChunks(toDelete, (e) => calendar.events.delete({ calendarId: "primary", eventId: e.id }).catch(() => null));
    await runInChunks(toUpdate, ({ event, block }) =>
      calendar.events.patch({
        calendarId: "primary",
        eventId: event.id,
        requestBody: { summary: summaryFor(block), description: descriptionFor(block) },
      }),
    );
    await runInChunks(toCreate, (b) =>
      calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: summaryFor(b),
          description: descriptionFor(b),
          start: { dateTime: b.startAt },
          end: { dateTime: b.endAt },
          colorId: "6",
          reminders: { useDefault: false }, // the app sends its own reminders
          extendedProperties: { private: { [CLING_FLAG]: "1", key: b.key } },
        },
      }),
    );

    res.json({ created: toCreate.length, updated: toUpdate.length, deleted: toDelete.length });
  } catch (error: any) {
    console.error("Error syncing study blocks:", error?.message || error);
    res.status(error?.code === 401 ? 401 : 500).json({ error: "Failed to sync study blocks to Google Calendar" });
  }
});

const CLASS_FLAG = "clingyClass";

/**
 * Same idea as /study-blocks, for class meetings: makes the class events Cling put on the primary
 * calendar match the list in the request body. They carry their own marker, so the study-block sync
 * never deletes them and they never count as busy time when the calendar is read back.
 */
calendarRouter.post("/classes", async (req, res) => {
  const accessToken = req.headers.authorization?.replace("Bearer ", "");
  if (!accessToken) {
    res.status(401).json({ error: "missing access token" });
    return;
  }

  const body = req.body as { blocks?: unknown };
  if (!Array.isArray(body?.blocks) || body.blocks.length > 300) {
    res.status(400).json({ error: "blocks must be an array of at most 300 items" });
    return;
  }
  const desired: DesiredBlock[] = [];
  for (const raw of body.blocks as Partial<DesiredBlock>[]) {
    const start = Date.parse(raw?.startAt ?? "");
    const end = Date.parse(raw?.endAt ?? "");
    if (typeof raw?.key !== "string" || typeof raw.title !== "string" || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      res.status(400).json({ error: "each block needs key, title, startAt and endAt (end after start)" });
      return;
    }
    desired.push({ key: raw.key, title: raw.title.slice(0, 200), label: String(raw.label ?? "").slice(0, 200), startAt: raw.startAt!, endAt: raw.endAt! });
  }

  try {
    const client = createOAuthClient();
    client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: client });

    const existing: ExistingEvent[] = [];
    let pageToken: string | undefined;
    do {
      const page = await calendar.events.list({
        calendarId: "primary",
        privateExtendedProperty: [`${CLASS_FLAG}=1`],
        timeMin: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        singleEvents: true,
        maxResults: 250,
        pageToken,
      });
      for (const e of page.data.items ?? []) {
        if (e.id && e.extendedProperties?.private?.key) {
          existing.push({
            id: e.id,
            key: e.extendedProperties.private.key,
            summary: e.summary ?? "",
            description: e.description ?? "",
          });
        }
      }
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken);

    const { toCreate, toDelete, toUpdate } = planCalendarChanges(existing, desired, CLASS_WORDING);

    const runInChunks = async <T>(items: T[], fn: (item: T) => Promise<unknown>) => {
      for (let i = 0; i < items.length; i += 4) await Promise.all(items.slice(i, i + 4).map(fn));
    };
    await runInChunks(toDelete, (e) => calendar.events.delete({ calendarId: "primary", eventId: e.id }).catch(() => null));
    await runInChunks(toUpdate, ({ event, block }) =>
      calendar.events.patch({
        calendarId: "primary",
        eventId: event.id,
        requestBody: { summary: CLASS_WORDING.summary(block), description: CLASS_WORDING.description(block), location: block.label },
      }),
    );
    await runInChunks(toCreate, (b) =>
      calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: CLASS_WORDING.summary(b),
          description: CLASS_WORDING.description(b),
          location: b.label || undefined,
          start: { dateTime: b.startAt },
          end: { dateTime: b.endAt },
          colorId: "2",
          reminders: { useDefault: false },
          extendedProperties: { private: { [CLASS_FLAG]: "1", key: b.key } },
        },
      }),
    );

    res.json({ created: toCreate.length, updated: toUpdate.length, deleted: toDelete.length });
  } catch (error: any) {
    console.error("Error syncing classes:", error?.message || error);
    res.status(error?.code === 401 ? 401 : 500).json({ error: "Failed to sync classes to Google Calendar" });
  }
});
