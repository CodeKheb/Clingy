// Bottom sheet behind the camera button: scan a photo of your schedule or add a class by hand.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from './utils/theme';

type Action = { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; onPress: () => void };

export function ClassAddSheet({
  visible,
  onClose,
  onCamera,
  onGallery,
  onManual,
}: {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
  onManual: () => void;
}) {
  const insets = useSafeAreaInsets();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const actions: Action[] = [
    { icon: 'camera-outline', title: 'Take photo', hint: 'Snap your schedule and Cling reads it', onPress: run(onCamera) },
    { icon: 'images-outline', title: 'Choose from gallery', hint: 'Use a photo or screenshot you already have', onPress: run(onGallery) },
    { icon: 'create-outline', title: 'Add manually', hint: 'Type in a class yourself', onPress: run(onManual) },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add classes</Text>
          {actions.map((a) => (
            <Pressable key={a.title} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={a.onPress}>
              <View style={styles.rowIcon}>
                <Ionicons name={a.icon} size={20} color={C.primary} />
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
  title: { fontSize: 17, fontWeight: '700', color: C.onSurface, paddingHorizontal: 4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, backgroundColor: C.surfaceContainerHigh },
  rowPressed: { backgroundColor: C.surfaceContainerHighest },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.onSurface },
  rowHint: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
});
