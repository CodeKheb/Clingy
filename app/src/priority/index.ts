// Owner: Person C
// Contract: see CONTRACT.md section 3. Person B calls scorePriority() after sync.

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

export function scorePriority(input: PriorityInput): PriorityOutput {
  // TODO(Person C): heuristic baseline first, then swap in TFLite behind this signature.
  throw new Error("not implemented");
}
