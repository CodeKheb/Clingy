// Every so often, picks something for the floating Cling to say (see nudgeText.ts). In the app it is held as a
// bubble for a few seconds; with the app in the background it is handed to the overlay over other apps.

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getAllClassMeetings, getMeta, getUpcomingAssignments, getUpcomingScheduleBlocks, setMeta } from '../db/queries';
import { pickNudge, type Nudge } from './nudgeText';
import { showOverlayNudge } from './overlayBridge';

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
        if (await isNudgesEnabled()) {
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
            if (AppState.currentState === 'active') {
              setNudge(next);
              hideTimer = setTimeout(() => setNudge(null), SHOW_MS);
            } else {
              // App is in the background: the floating Cling over other apps says it instead (no-op if it's off).
              showOverlayNudge(next.text, next.animation);
            }
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
