// Wires moodAggregation.ts up to real data for the app shell.
//
// syncService.ts computes mood (via moodFromScores) and persists it to
// SQLite's pet_state row on every sync; this hook just reads that back and
// polls for changes, so there's one source of truth for mood instead of
// computing it twice. Before the first sync (e.g. not signed in yet) falls
// back to scoring the classroom fixture so Cling isn't just stuck neutral.

import { useEffect, useState } from 'react';

import { CLASSROOM_FIXTURE } from '../fixtures/classroomFixture';
import { getAllAssignments, getPetState } from '../db/queries';
import { initPriorityScorer, scorePriority } from '../priority';
import { moodFromScores } from './moodAggregation';
import type { ClingMood } from './PetWidget';

const POLL_INTERVAL_MS = 30 * 1000;

async function fixtureFallbackMood(): Promise<ClingMood> {
  const scores = CLASSROOM_FIXTURE.map((item) =>
    scorePriority({
      id: item.id,
      title: item.title,
      description: item.description,
      dueAt: item.dueAt,
    }),
  );
  return moodFromScores(scores);
}

export function useClingMood(): ClingMood {
  const [mood, setMood] = useState<ClingMood>('neutral');

  useEffect(() => {
    let cancelled = false;

    const recompute = async () => {
      const assignments = await getAllAssignments();
      const nextMood =
        assignments.length > 0 ? (await getPetState()).mood : await fixtureFallbackMood();
      if (!cancelled) setMood(nextMood);
    };

    void initPriorityScorer().finally(() => void recompute());

    const interval = setInterval(() => void recompute(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return mood;
}
