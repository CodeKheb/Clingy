// The scripted conversation tree for the Cling panel.
// No free text from the user: every turn is Cling "saying" something plus a
// small set of tappable replies, like the sprite sheet's chat-bubble
// interaction example (idle -> tap -> "Hey! What can I help with?" with
// canned options).

import { formatMinutes } from '../classes/time';
import { getAllClassMeetings, getUpcomingAssignments } from '../db/queries';
import {
  buildProposedSchedule,
  commitProposedSchedule,
  markUnavailableAndReschedule,
  type ProposedBlock,
} from '../scheduling/scheduler';
import { pickBusyRange } from '../screens/utils/pickDateTime';

export type ConversationOption = {
  label: string;
  next: string; // id of the next node
};

export type ConversationNode = {
  id: string;
  clingSays: string;
  options: ConversationOption[];
};

export const ROOT_NODE_ID = 'root';

export const CONVERSATION: Record<string, ConversationNode> = {
  root: {
    id: 'root',
    clingSays: "Hey! What can I help with?",
    options: [
      { label: 'Show my tasks', next: 'show_tasks' },
      { label: 'I need to study', next: 'offer_schedule' },
      { label: "What's next?", next: 'whats_next' },
      { label: 'My classes', next: 'classes_today' },
      { label: "I'm busy at a certain time", next: 'busy_intro' },
    ],
  },
  classes_today: {
    id: 'classes_today',
    clingSays: "Here are your classes today.", // class list rendered separately, see ClingPanel
    options: [
      { label: "Tomorrow's classes", next: 'classes_tomorrow' },
      { label: 'Back', next: 'root' },
    ],
  },
  classes_tomorrow: {
    id: 'classes_tomorrow',
    clingSays: "Here are your classes tomorrow.",
    options: [
      { label: "Today's classes", next: 'classes_today' },
      { label: 'Back', next: 'root' },
    ],
  },
  busy_intro: {
    id: 'busy_intro',
    clingSays: "Tell me when you can't study and I'll move your sessions around it.",
    options: [
      { label: 'Pick the day and time', next: 'busy_done' },
      { label: 'Back', next: 'root' },
    ],
  },
  busy_done: {
    id: 'busy_done',
    clingSays: "Done! I've moved your study sessions around that time.", // replaced if the picker is dismissed, see resolveNodeEffects
    options: [
      { label: 'Another time', next: 'busy_done' },
      { label: 'Thanks!', next: 'root' },
    ],
  },
  show_tasks: {
    id: 'show_tasks',
    clingSays: "Here's what you've got coming up.", // task list rendered separately, see ClingPanel
    options: [
      { label: 'Schedule study time for these', next: 'offer_schedule' },
      { label: 'Back', next: 'root' },
    ],
  },
  whats_next: {
    id: 'whats_next',
    clingSays: "Let me check your most urgent thing.", // resolved dynamically, see ClingPanel
    options: [
      { label: 'Schedule study time', next: 'offer_schedule' },
      { label: 'Back', next: 'root' },
    ],
  },
  offer_schedule: {
    id: 'offer_schedule',
    clingSays: "Want me to find free time on your calendar and block it off for studying?",
    options: [
      { label: 'Yes, go ahead', next: 'schedule_confirmed' },
      { label: 'Not now', next: 'root' },
    ],
  },
  schedule_confirmed: {
    id: 'schedule_confirmed',
    clingSays: "Done! I've blocked out study time around your classes.", // actual commit happens on entering this node
    options: [{ label: 'Thanks!', next: 'root' }],
  },
  no_tasks: {
    id: 'no_tasks',
    clingSays: "You're all caught up — nothing upcoming!",
    options: [{ label: 'Nice', next: 'root' }],
  },
};

export type TaskSummary = { title: string; dueAt: string | null; urgency: number; minutes: number };

export type ClassSummary = { subject: string; time: string; room: string | null };

export type ConversationSideEffectResult = {
  assignmentSummary?: TaskSummary[];
  classSummary?: ClassSummary[];
  proposedBlocks?: ProposedBlock[];
  /** Replaces the node's static line when what happened differs from the happy path. */
  clingSaysOverride?: string;
};

/**
 * Runs whatever data-fetch/side-effect a node implies before it's shown.
 * Keeps the CONVERSATION tree above purely declarative (static strings),
 * with the dynamic parts (task lists, scheduling) resolved here.
 */
export async function resolveNodeEffects(nodeId: string): Promise<ConversationSideEffectResult> {
  if (nodeId === 'show_tasks' || nodeId === 'whats_next') {
    const assignments = await getUpcomingAssignments();
    if (assignments.length === 0) return {};
    const shown = nodeId === 'whats_next' ? assignments.slice(0, 1) : assignments.slice(0, 5);
    return {
      assignmentSummary: shown.map((a) => ({
        title: a.title,
        dueAt: a.due_at,
        urgency: a.urgency_score,
        minutes: a.suggested_minutes,
      })),
    };
  }

  if (nodeId === 'classes_today' || nodeId === 'classes_tomorrow') {
    const day = new Date();
    if (nodeId === 'classes_tomorrow') day.setDate(day.getDate() + 1);
    const classes = (await getAllClassMeetings())
      .filter((c) => c.day_of_week === day.getDay())
      .sort((a, b) => a.start_minutes - b.start_minutes);
    if (classes.length === 0) {
      const when = nodeId === 'classes_today' ? 'today' : 'tomorrow';
      return { clingSaysOverride: `No classes ${when}. Free day!` };
    }
    return {
      classSummary: classes.map((c) => ({
        subject: c.subject,
        time: `${formatMinutes(c.start_minutes)} – ${formatMinutes(c.end_minutes)}`,
        room: c.room,
      })),
    };
  }

  if (nodeId === 'schedule_confirmed') {
    const blocks = await buildProposedSchedule();
    await commitProposedSchedule(blocks);
    return { proposedBlocks: blocks };
  }

  if (nodeId === 'busy_done') {
    const range = await pickBusyRange();
    if (!range) return { clingSaysOverride: 'No problem, I left your schedule as it was.' };
    if (range.end <= range.start) {
      return { clingSaysOverride: 'That ends before it starts, so I left your schedule as it was.' };
    }
    await markUnavailableAndReschedule(range.start.toISOString(), range.end.toISOString());
    return {};
  }

  return {};
}

/** show_tasks/whats_next redirect here instead if there's nothing upcoming. */
export async function resolveEntryNode(requestedNodeId: string): Promise<string> {
  if (requestedNodeId === 'show_tasks' || requestedNodeId === 'whats_next') {
    const assignments = await getUpcomingAssignments();
    if (assignments.length === 0) return 'no_tasks';
  }
  return requestedNodeId;
}
