// Shared top app bar: Cling mascot + screen subtitle on the left, vault/profile
// badges on the right. Every screen renders it with its own subtitle so the
// header stays identical across the app.

import { Image, StyleSheet, Text, View } from 'react-native';

import { C } from '../screens/utils/theme';

const MASCOT_HEADER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC97rLKyUV9Wq7oaCGF96bKM-ZcZFwDaOf_anr1pkPschcoSZHzOTCWMgO2vHdPdvNBQ4ubL7gkKTnrh-7oCVahglHJFxPzYl2LI6yBs0iEzDWY81DGZwzEo97rkMht-CH8l6fsvu3KRp0Hh8k0uJkHgW0OLzQqFMXLG1hi2HeApmcMZPmp0QxpOuKIqblB6nN-n_JkK-dIQ-3bjoPEE5OeuqkqsT7BvpGojbwl-zsXaKTQAX53DRxjz2htIdVL9IfalA';

export function AppHeader({ subtitle }: { subtitle: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {/* Left: Mascot + Title */}
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatarWrap}>
            <Image source={{ uri: MASCOT_HEADER }} style={styles.headerAvatar} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Cling</Text>
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          </View>
        </View>

        {/* Right: shield badge + profile */}
        <View style={styles.headerRight}>
          <View style={styles.shieldBadge}>
            <Text style={styles.shieldIcon}>🛡️</Text>
            <Text style={styles.shieldLabel}>Vault Encrypted</Text>
          </View>
          <View style={styles.profileCircle}>
            <Text style={styles.profileIcon}>👤</Text>
          </View>
        </View>
      </View>
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
  headerAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaceContainerHighest + 'CC',
    borderWidth: 1,
    borderColor: C.primary + '4D',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.onSurface,
    letterSpacing: -0.3,
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
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: C.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: C.outlineVariant + '4D',
  },
  shieldIcon: {
    fontSize: 12,
  },
  shieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  profileCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIcon: {
    fontSize: 16,
  },
});
