// Owner: Person C — the scripted conversation tree for the Cling panel.
// No free text from the user: every turn is Cling "saying" something plus a
// small set of tappable replies, like the sprite sheet's chat-bubble
// interaction example (idle -> tap -> "Hey! What can I help with?" with
// canned options).

import { getUpcomingAssignments } from '../db/queries';
import { buildProposedSchedule, commitProposedSchedule, type ProposedBlock } from '../scheduling/scheduler';

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

export type ConversationSideEffectResult = {
  assignmentSummary?: string[];
  proposedBlocks?: ProposedBlock[];
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
    const summary =
      nodeId === 'whats_next'
        ? [assignments[0].title]
        : assignments.slice(0, 5).map((a) => a.title);
    return { assignmentSummary: summary };
  }

  if (nodeId === 'schedule_confirmed') {
    const blocks = await buildProposedSchedule();
    await commitProposedSchedule(blocks);
    return { proposedBlocks: blocks };
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
