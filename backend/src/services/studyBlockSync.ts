// Decides which Google Calendar events to create, update or delete so that the calendar's
// Cling-made events match the app's current study blocks. Pure, so it can be tested without Google.

export type DesiredBlock = {
  /** Stable key for the block: assignment id and start time. */
  key: string;
  title: string;
  label: string;
  startAt: string;
  endAt: string;
};

export type ExistingEvent = {
  id: string;
  key: string;
  summary: string;
  description: string;
};

export const summaryFor = (b: DesiredBlock) => `Study: ${b.title}`;
export const descriptionFor = (b: DesiredBlock) => `${b.label}\nPlanned by Cling`;

export type EventWording = { summary: (b: DesiredBlock) => string; description: (b: DesiredBlock) => string };

const STUDY_WORDING: EventWording = { summary: summaryFor, description: descriptionFor };

export const classSummaryFor = (b: DesiredBlock) => `Class: ${b.title}`;
export const classDescriptionFor = (b: DesiredBlock) => `${b.label ? `${b.label}\n` : ""}Added by Cling`;
export const CLASS_WORDING: EventWording = { summary: classSummaryFor, description: classDescriptionFor };

export function planCalendarChanges(existing: ExistingEvent[], desired: DesiredBlock[], wording: EventWording = STUDY_WORDING) {
  const existingKeys = new Set(existing.map((e) => e.key));
  const desiredByKey = new Map(desired.map((d) => [d.key, d]));

  const toCreate = desired.filter((d) => !existingKeys.has(d.key));

  // Keep one event per wanted key; anything else Cling made (moved, finished, removed, duplicated) goes.
  const kept = new Map<string, ExistingEvent>();
  const toDelete: ExistingEvent[] = [];
  for (const e of existing) {
    if (!desiredByKey.has(e.key) || kept.has(e.key)) toDelete.push(e);
    else kept.set(e.key, e);
  }

  const toUpdate = [...kept.values()]
    .map((event) => ({ event, block: desiredByKey.get(event.key)! }))
    .filter(({ event, block }) => event.summary !== wording.summary(block) || event.description !== wording.description(block));

  return { toCreate, toDelete, toUpdate };
}
