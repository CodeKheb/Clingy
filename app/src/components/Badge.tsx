// Shared status pill used for the section meta badges (sync state, model name,
// focus window, schedule state). Tone maps to the token that colors it.

import { StyleSheet, Text, View } from 'react-native';

import { C } from '../screens/utils/theme';

export type BadgeTone = 'primary' | 'secondary' | 'tertiary' | 'neutral';
export type BadgeSize = 'sm' | 'md';

const TONES: Record<BadgeTone, { background: string; border: string; text: string }> = {
  primary: {
    background: C.primaryContainer + '33',
    border: C.primaryContainer + '4D',
    text: C.primary,
  },
  secondary: {
    background: C.secondary + '26',
    border: C.secondary + '4D',
    text: C.secondary,
  },
  tertiary: {
    background: C.tertiary + '33',
    border: C.tertiary + '4D',
    text: C.tertiary,
  },
  neutral: {
    background: C.surfaceContainerHigh,
    border: C.outlineVariant + '4D',
    text: C.onSurfaceVariant,
  },
};

export function Badge({
  label,
  tone = 'neutral',
  size = 'sm',
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: string;
}) {
  const t = TONES[tone];
  return (
    <View
      style={[
        styles.badge,
        size === 'md' && styles.badgeMd,
        { backgroundColor: t.background, borderColor: t.border },
      ]}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeMd: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  icon: {
    fontSize: 11,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
