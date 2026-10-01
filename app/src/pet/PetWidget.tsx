// Owner: Person C
// Cling — the app's mascot. Contract: see CONTRACT.md section 4.

export type ClingMood = "happy" | "neutral" | "stressed" | "urgent";

export type ClingWidgetProps = {
  mood: ClingMood;
  onPress: () => void;
};

// TODO(Person C): build ClingFloatingFallback (in-app, no permissions) first,
// then attempt the native SYSTEM_ALERT_WINDOW overlay bubble, timeboxed.
