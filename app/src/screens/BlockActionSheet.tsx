// Bottom sheet opened from a study block's three dots: drag it on the timeline, pick a new time,
// say you can't make it, or hand a pinned block back to the scheduler.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from './utils/theme';

type Action = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  onPress: () => void;
  danger?: boolean;
};

export function BlockActionSheet({
  visible,
  title,
  subtitle,
  pinned,
  onClose,
  onDrag,
  onPickTime,
  onCantSlot,
  onCantDay,
  onUnpin,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  pinned: boolean;
  onClose: () => void;
  onDrag: () => void;
  onPickTime: () => void;
  onCantSlot: () => void;
  onCantDay: () => void;
  onUnpin: () => void;
}) {
  const insets = useSafeAreaInsets();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const actions: Action[] = [
    { icon: 'move-outline', title: 'Drag on timeline', hint: 'See the whole day and drag this block where you want it', onPress: run(onDrag) },
    { icon: 'time-outline', title: 'Pick a new time', hint: 'Choose an exact day and time', onPress: run(onPickTime) },
    { icon: 'close-circle-outline', title: "Can't make this time", hint: 'Move it to another slot', onPress: run(onCantSlot), danger: true },
    { icon: 'calendar-clear-outline', title: "Can't make this day", hint: 'Move all of today’s sessions to other days', onPress: run(onCantDay), danger: true },
    ...(pinned
      ? [{ icon: 'pin-outline' as const, title: 'Unpin', hint: 'Let Cling place this block again', onPress: run(onUnpin) }]
      : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {actions.map((a) => (
          <Pressable key={a.title} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={a.onPress}>
            <View style={[styles.rowIcon, a.danger && styles.rowIconDanger]}>
              <Ionicons name={a.icon} size={20} color={a.danger ? C.error : C.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{a.title}</Text>
              <Text style={styles.rowHint}>{a.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.onSurfaceVariant} />
          </Pressable>
        ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  sheet: {
    backgroundColor: C.surfaceContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.outlineVariant, marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '700', color: C.onSurface, paddingHorizontal: 4 },
  subtitle: { fontSize: 13, color: C.onSurfaceVariant, paddingHorizontal: 4, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: C.surfaceContainerHigh,
  },
  rowPressed: { backgroundColor: C.surfaceContainerHighest },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: C.errorContainer + '55' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.onSurface },
  rowHint: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
});
