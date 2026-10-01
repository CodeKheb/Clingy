// Design tokens — the single source of truth for the app's Material You dark
// theme. Screens and shared components import `C` instead of
// hardcoding hex strings, so every screen stays visually consistent.

export const C = {
  background: '#0f131c',
  surface: '#0f131c',
  surfaceContainer: '#1c2029',
  surfaceContainerLow: '#181c24',
  surfaceContainerHigh: '#262a33',
  surfaceContainerHighest: '#31353e',
  surfaceContainerLowest: '#0a0e17',
  onSurface: '#dfe2ef',
  onSurfaceVariant: '#e1bfb5',
  primary: '#ffb59d',
  primaryContainer: '#ff6b35',
  onPrimary: '#5d1900',
  secondary: '#44e2cd',
  secondaryContainer: '#03c6b2',
  tertiary: '#f9bd22',
  tertiaryContainer: '#c39200',
  onTertiary: '#402d00',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  outlineVariant: '#594139',
  white: '#ffffff',
} as const;

export type ColorToken = keyof typeof C;

// ---------------------------------------------------------------------------
// Urgency → token mappings (shared by Home and Schedule)
// ---------------------------------------------------------------------------

/** Accent color for a 0–1 urgency score. */
export function urgencyColor(score: number): string {
  if (score >= 0.8) return C.errorContainer;
  if (score >= 0.5) return C.primaryContainer;
  if (score >= 0.3) return C.tertiaryContainer;
  return C.surfaceContainerHigh;
}

/** Short human label for a 0–1 urgency score. */
export function urgencyLabel(score: number): string {
  if (score >= 0.8) return 'High Leverage';
  if (score >= 0.5) return 'Medium';
  if (score >= 0.3) return 'Low';
  return 'Routine';
}
