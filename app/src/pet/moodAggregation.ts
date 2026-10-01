// Derives Cling's mood from the aggregate urgencyScore across upcoming
// assignments. Takes already-scored items (PriorityOutput, i.e. whatever
// scorePriority() returned) rather than re-scoring, so it works the same
// whether the caller reads from the classroom fixture today or SQLite's
// `assignments` table once the sync pipeline is wired up — the
// shape (urgency_score REAL) matches the assignments table either way.

import type { PriorityOutput } from '../priority';
import type { ClingMood } from './PetWidget';

// A completed/empty worklist should read as happy, not neutral.
const EMPTY_MOOD: ClingMood = 'happy';

// Bias the aggregate toward the single most urgent item (one looming deadline
// should dominate mood) while still letting a pile of moderately-urgent items
// push the mood up on their own.
const MAX_WEIGHT = 0.7;
const MEAN_WEIGHT = 1 - MAX_WEIGHT;

const URGENT_THRESHOLD = 0.75;
const STRESSED_THRESHOLD = 0.45;
const HAPPY_THRESHOLD = 0.15;

/** Combines per-assignment urgency scores into a single 0-1 aggregate. */
export function aggregateUrgency(scores: number[]): number {
  if (scores.length === 0) return 0;
  const max = Math.max(...scores);
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return MAX_WEIGHT * max + MEAN_WEIGHT * mean;
}

/** Maps an aggregate urgency (0-1) onto Cling's mood states. */
export function moodFromAggregateUrgency(aggregate: number): ClingMood {
  if (aggregate >= URGENT_THRESHOLD) return 'urgent';
  if (aggregate >= STRESSED_THRESHOLD) return 'stressed';
  if (aggregate <= HAPPY_THRESHOLD) return 'happy';
  return 'neutral';
}

/**
 * Computes Cling's mood from a set of already-scored upcoming assignments.
 * An empty list (nothing upcoming / everything done) reads as happy.
 */
export function moodFromScores(scores: PriorityOutput[]): ClingMood {
  if (scores.length === 0) return EMPTY_MOOD;
  return moodFromAggregateUrgency(aggregateUrgency(scores.map((s) => s.urgencyScore)));
}
