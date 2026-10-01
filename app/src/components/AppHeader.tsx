// Shared top app bar: Cling mascot + screen subtitle on the left, profile
// settings gear on the right. Every screen renders it with its own subtitle so the
// header stays identical across the app.

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { C } from '../screens/utils/theme';
import { ClingFace } from './ClingFace';
import { SettingsSheet } from './SettingsSheet';


export function AppHeader({
  subtitle,
  syncing = false,
  onSignOut,
}: {
  subtitle: string;
  /** Shows a small spinner beside the subtitle while a sync runs. */
  syncing?: boolean;
  onSignOut?: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {/* Left: Mascot + Title */}
        <View style={styles.headerLeft}>
          <ClingFace
            size={36}
            backgroundColor={C.surfaceContainerHighest + 'CC'}
            borderColor={C.primary + '4D'}
            borderWidth={1}
          />
          <View>
            <Text style={styles.headerTitle}>Cling</Text>
            <View style={styles.subtitleRow}>
              {syncing ? <ActivityIndicator size={16} color={C.primary} accessibilityLabel="Syncing" /> : null}
              <Text style={styles.headerSubtitle}>{subtitle}</Text>
            </View>
          </View>
        </View>

        {/* Right: settings */}
        <View style={styles.headerRight}>
          <Pressable
            style={styles.profileCircle}
            onPress={() => setSettingsOpen(true)}
            hitSlop={8}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={18} color={C.white} />
          </Pressable>
        </View>
      </View>
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} onSignOut={onSignOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: C.surface + 'E6', // /90 opacity
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.surfaceContainerHigh + '99',
  },
  headerInner: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.onSurface,
    letterSpacing: -0.3,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerSubtitle: {
    fontSize: 11,
    color: C.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  profileCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
