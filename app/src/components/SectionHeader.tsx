// Shared section header: leading icon + title, with an optional right slot so
// every section across the app lines up the same way. Icons come from
// @expo/vector-icons so they render identically on every device.

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { C } from '../screens/utils/theme';

export function SectionHeader({
  icon,
  title,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderLeft}>
        <Ionicons name={icon} size={18} color={C.onSurfaceVariant} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.onSurface,
  },
});
