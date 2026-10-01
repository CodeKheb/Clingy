/**
 * @module sync/backgroundSync
 *
 * Registers an OS-managed periodic data sync using Expo's background task APIs.
 * The OS decides when the task actually runs and may defer it to protect
 * battery, so the configured interval is a *minimum*, not a guarantee.
 *
 * The scheduled task delegates to {@link syncNow} from `syncService`, so
 * `configureSync()` must have been called beforehand to make an access token
 * available during a headless launch (there is no caller to supply one then).
 *
 * Owner: Person B.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { syncNow } from './syncService';

/** Unique name the OS uses to identify the registered background task. */
export const BACKGROUND_SYNC_TASK = 'clingy-background-sync';

/** Default minimum interval, in minutes, between scheduled sync runs. */
export const DEFAULT_SYNC_INTERVAL_MINUTES = 60;

/** Lower bound enforced by {@link startBackgroundSync}; the OS rejects smaller values. */
const MIN_SYNC_INTERVAL_MINUTES = 15;

/**
 * Task body run by the OS. Must be defined at module scope so Expo can resolve
 * it during a headless launch. It reports Success/Failed back to the OS and
 * never throws, so a failed run never crashes the background process.
 */
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await syncNow();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[sync] Scheduled sync failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Register the OS-managed background sync task.
 *
 * Safe to call more than once: if the task is already registered this is a
 * no-op, so it can be invoked on every app launch. Because the OS may defer
 * runs, treat `minimumIntervalMinutes` as a floor rather than an exact schedule.
 *
 * @param minimumIntervalMinutes Minimum minutes between scheduled runs.
 *   Defaults to {@link DEFAULT_SYNC_INTERVAL_MINUTES}.
 * @throws {RangeError} If the interval is not finite or is below the platform minimum.
 * @throws {Error} If background sync is unavailable on this device or platform.
 */
export async function startBackgroundSync(
  minimumIntervalMinutes = DEFAULT_SYNC_INTERVAL_MINUTES,
): Promise<void> {
  if (!Number.isFinite(minimumIntervalMinutes) || minimumIntervalMinutes < MIN_SYNC_INTERVAL_MINUTES) {
    throw new RangeError(`Background sync interval must be at least ${MIN_SYNC_INTERVAL_MINUTES} minutes.`);
  }
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error('Background sync is unavailable on this device or platform.');
  }
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: minimumIntervalMinutes,
  });
}

/**
 * Unregister the scheduled task so no further background runs occur. Work that
 * is already running is not cancelled, and manual `syncNow` calls remain
 * available.
 */
export async function stopBackgroundSync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  }
}