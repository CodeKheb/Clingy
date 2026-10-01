// Owner: Person C — thin wrapper over the native ClingOverlay module
// (plugins/overlay/native/OverlayModule.kt). Android only; the system-wide
// bubble has no iOS/web equivalent in this app.

import { NativeModules, Platform } from 'react-native';

type ClingOverlayNative = {
  canDrawOverlays(): Promise<boolean>;
  requestPermission(): void;
  startOverlay(): Promise<boolean>;
  stopOverlay(): void;
  setMood(mood: string): void;
  setAppForeground(foreground: boolean): void;
};

const native: ClingOverlayNative | undefined = NativeModules.ClingOverlay;

export const isOverlaySupported = Platform.OS === 'android' && native !== undefined;

export async function canDrawOverlays(): Promise<boolean> {
  if (!native) return false;
  return native.canDrawOverlays();
}

/** Opens the system Settings page for the overlay permission — no in-app dialog is possible. */
export function requestOverlayPermission(): void {
  native?.requestPermission();
}

/** Starts the floating bubble service. Resolves false if permission isn't granted. */
export async function startOverlay(): Promise<boolean> {
  if (!native) return false;
  return native.startOverlay();
}

export function stopOverlay(): void {
  native?.stopOverlay();
}

/** Updates the floating bubble's animation to match the current Cling mood. No-op if the overlay isn't running. */
export function setOverlayMood(mood: string): void {
  native?.setMood(mood);
}

/** Hides the system-wide bubble while the app is foregrounded (PetFloatingFallback covers that case in-app). No-op if the overlay isn't running. */
export function setOverlayAppForeground(foreground: boolean): void {
  native?.setAppForeground(foreground);
}
