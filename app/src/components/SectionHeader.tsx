// Shared section header: leading emoji + title, with an optional right slot
// (usually a <Badge />) so every section across the app lines up the same way.

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C } from '../screens/utils/theme';

export function SectionHeader({
  icon,
  title,
  right,
}: {
  icon: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={styles.sectionIcon}>{icon}</Text>
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
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.onSurface,
  },
});
