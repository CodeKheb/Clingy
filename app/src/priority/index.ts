// Owner: Person C
// Contract: see CONTRACT.md section 3. Person B calls scorePriority() after sync.
//
// TFLite scorer (tfliteScorer.ts) is feature-flagged behind USE_TFLITE and only
// used once initPriorityScorer() has resolved; until then (or if the flag is off
// or the model fails to load) scorePriority() transparently uses the heuristic.
// The signature stays synchronous either way — zero changes on Person B's side.

import { scorePriorityHeuristic } from './heuristic';
import { initPriorityScorer, isPriorityScorerReady, scorePriorityTflite } from './tfliteScorer';

export type PriorityInput = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null; // ISO 8601
};

export type PriorityOutput = {
  urgencyScore: number; // 0-1, higher = more urgent
  suggestedMinutes: number;
};

// Set false to force the heuristic everywhere (e.g. if the model misbehaves on-device).
const USE_TFLITE = true;

export { initPriorityScorer };

export function scorePriority(input: PriorityInput): PriorityOutput {
  if (USE_TFLITE && isPriorityScorerReady()) {
    try {
      return scorePriorityTflite(input);
    } catch (e) {
      console.warn('[priority] TFLite scoring failed, falling back to heuristic:', e);
    }
  }
  return scorePriorityHeuristic(input);
}
