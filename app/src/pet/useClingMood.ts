// Owner: Person C — wires moodAggregation.ts up to real data for the app shell.
//
// Today this scores the classroom fixture (CONTRACT.md section 1 shape);
// once Person B's SQLite `assignments` table is populated by the sync
// service, swap the `items` source here for a query against it — the
// CourseworkResponse shape already matches PriorityInput's fields, and
// scorePriority()/moodFromScores() don't change either way.

import { useEffect, useState } from 'react';

import { CLASSROOM_FIXTURE } from '../fixtures/classroomFixture';
import { initPriorityScorer, scorePriority } from '../priority';
import { moodFromScores } from './moodAggregation';
import type { ClingMood } from './PetWidget';

// Re-aggregate periodically so due-date decay (today -> overdue, etc.) moves
// Cling's mood over time without needing an app restart.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function useClingMood(): ClingMood {
  const [mood, setMood] = useState<ClingMood>('neutral');

  useEffect(() => {
    let cancelled = false;

    const recompute = () => {
      const scores = CLASSROOM_FIXTURE.map((item) =>
        scorePriority({
          id: item.id,
          title: item.title,
          description: item.description,
          dueAt: item.dueAt,
        }),
      );
      if (!cancelled) setMood(moodFromScores(scores));
    };

    void initPriorityScorer().finally(recompute);

    const interval = setInterval(recompute, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return mood;
}
