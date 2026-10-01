//
// What the on-device model does here: when the keywords in a title/description
// can't tell what kind of work it is (exam, project, writing, ...), MiniLM
// matches the text against example sentences per type (tfliteScorer.ts).
// Everything after that (effort, stakes, urgency) is plain math in
// taskProfile.ts. The signature stays synchronous; before the model has loaded
// (or if it fails to) classification just uses keywords.

import {
  classifyByKeywords,
  estimateMinutes,
  stakesFor,
  urgencyFrom,
  type TaskType,
} from './taskProfile';
import { classifyTypeTflite, initPriorityScorer, isPriorityScorerReady } from './tfliteScorer';

export type PriorityInput = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null; // ISO 8601
  /** Classroom point value, when the course sets one. */
  maxPoints?: number | null;
};

export type PriorityOutput = {
  urgencyScore: number; // 0-1, higher = more urgent
  suggestedMinutes: number;
  taskType: TaskType;
};

export { initPriorityScorer };
export type { TaskType };

export function classifyTask(input: Pick<PriorityInput, 'title' | 'description'>): TaskType {
  const byKeyword = classifyByKeywords(input.title, input.description);
  if (byKeyword) return byKeyword;
  if (isPriorityScorerReady()) {
    try {
      const byModel = classifyTypeTflite(input.title, input.description);
      if (byModel) return byModel;
    } catch (e) {
      console.warn('[priority] model classification failed, using keywords only:', e);
    }
  }
  return 'general';
}

export function scorePriority(input: PriorityInput): PriorityOutput {
  const taskType = classifyTask(input);
  const maxPoints = input.maxPoints ?? null;
  const suggestedMinutes = estimateMinutes(taskType, maxPoints, input.description);
  const urgencyScore = urgencyFrom(input.dueAt, suggestedMinutes, stakesFor(taskType, maxPoints));
  return { urgencyScore, suggestedMinutes, taskType };
}
