// Owner: Person C
// Contract: see CONTRACT.md section 4.

export type PetMood = "happy" | "neutral" | "stressed" | "urgent";

export type PetWidgetProps = {
  mood: PetMood;
  onPress: () => void;
};

// TODO(Person C): build PetFloatingFallback (in-app, no permissions) first,
// then attempt the native SYSTEM_ALERT_WINDOW overlay bubble, timeboxed.
