// Every so often, picks something for the floating Cling to say (see nudgeText.ts) and holds it for a few seconds.

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getAllClassMeetings, getMeta, getUpcomingAssignments, getUpcomingScheduleBlocks, setMeta } from '../db/queries';
import { pickNudge, type Nudge } from './nudgeText';

const ENABLED_KEY = 'cling_nudges';
const FIRST_NUDGE_MS = 20_000;
const MIN_GAP_MS = 90_000;
const EXTRA_GAP_MS = 110_000; // the gap is random between MIN_GAP_MS and MIN_GAP_MS + this
const SHOW_MS = 8_000;

export async function isNudgesEnabled(): Promise<boolean> {
  return (await getMeta(ENABLED_KEY)) !== 'off';
}

export async function setNudgesEnabled(enabled: boolean): Promise<void> {
  await setMeta(ENABLED_KEY, enabled ? 'on' : 'off');
}

export function useClingNudge(): Nudge | null {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        if (AppState.currentState === 'active' && (await isNudgesEnabled())) {
          const [assignments, blocks, classes] = await Promise.all([
            getUpcomingAssignments(),
            getUpcomingScheduleBlocks(),
            getAllClassMeetings(),
          ]);
          const next = pickNudge({
            now: new Date(),
            assignments,
            blocks,
            classes,
            lastKey: lastKey.current,
            rand: Math.random,
          });
          if (next && !cancelled) {
            lastKey.current = next.key;
            setNudge(next);
            hideTimer = setTimeout(() => setNudge(null), SHOW_MS);
          }
        }
      } catch (err) {
        console.warn('[nudge] skipped:', err instanceof Error ? err.message : err);
      }
      if (!cancelled) nextTimer = setTimeout(() => void tick(), MIN_GAP_MS + Math.random() * EXTRA_GAP_MS);
    };

    nextTimer = setTimeout(() => void tick(), FIRST_NUDGE_MS);
    return () => {
      cancelled = true;
      clearTimeout(nextTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return nudge;
}
