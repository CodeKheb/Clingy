// Shared bottom navigation. Only real destinations — a tab that routes
// nowhere is worse than no tab.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from '../screens/utils/theme';

export type NavTab = 'Home' | 'Schedule';

const TABS: { label: NavTab; icon: string }[] = [
  { label: 'Home', icon: '🏠' },
  { label: 'Schedule', icon: '📅' },
];

export function BottomNav({
  active,
  onSelectTab,
}: {
  active: NavTab;
  onSelectTab?: (tab: NavTab) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      <View style={styles.bottomNavInner}>
        {TABS.map((tab) => {
          const isActive = tab.label === active;
          return (
            <Pressable
              key={tab.label}
              style={styles.bottomNavTab}
              onPress={() => onSelectTab?.(tab.label)}
            >
              <View
                style={[
                  styles.bottomNavIconWrap,
                  isActive && styles.bottomNavIconWrapActive,
                ]}
              >
                <Text style={styles.bottomNavIcon}>{tab.icon}</Text>
              </View>
              <Text
                style={[
                  styles.bottomNavLabel,
                  isActive && styles.bottomNavLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* Home bar indicator */}
      <View style={styles.homeBarWrap}>
        <View style={styles.homeBar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: C.surfaceContainerLow + 'F2', // /95
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.surfaceContainerHigh,
  },
  bottomNavInner: {
    height: 64,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  bottomNavTab: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    minHeight: 48,
    paddingVertical: 4,
  },
  bottomNavIconWrap: {
    width: 56,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNavIconWrapActive: {
    backgroundColor: C.primaryContainer + '40',
  },
  bottomNavIcon: {
    fontSize: 22,
  },
  bottomNavLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.onSurfaceVariant,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  bottomNavLabelActive: {
    color: C.primary,
    fontWeight: '700',
  },
  homeBarWrap: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  homeBar: {
    width: 112,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.outlineVariant + '66',
  },
});
