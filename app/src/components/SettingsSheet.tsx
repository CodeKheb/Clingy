// Bottom sheet opened from the header's gear: floating-Cling switch and sign out.

import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { enableOverlay, isOverlayRunning, isOverlaySupported, stopOverlay } from '../pet/overlayBridge';
import { C } from '../screens/utils/theme';

export function SettingsSheet({
  visible,
  onClose,
  onSignOut,
}: {
  visible: boolean;
  onClose: () => void;
  onSignOut?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [overlayOn, setOverlayOn] = useState(false);

  // The overlay can be dismissed from outside the app (dragged onto the X), so read the live state on open.
  useEffect(() => {
    if (!visible || !isOverlaySupported) return;
    let active = true;
    void isOverlayRunning().then((running) => {
      if (active) setOverlayOn(running);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const toggleOverlay = async (next: boolean) => {
    if (!next) {
      stopOverlay();
      setOverlayOn(false);
      return;
    }
    // Resolves false when the permission page had to be opened first; the switch then stays off.
    setOverlayOn(await enableOverlay());
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'Sign out of Clingy?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          onClose();
          onSignOut?.();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close settings" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Settings</Text>

        {isOverlaySupported && (
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="sparkles-outline" size={20} color={C.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Floating Cling</Text>
              <Text style={styles.rowHint}>Show Cling over other apps. Drag it to the ✕ to hide it.</Text>
            </View>
            <Switch
              value={overlayOn}
              onValueChange={(next) => void toggleOverlay(next)}
              trackColor={{ false: C.surfaceContainerHighest, true: C.primaryContainer }}
              thumbColor={C.white}
            />
          </View>
        )}

        {onSignOut && (
          <Pressable style={[styles.row, styles.rowDanger]} onPress={confirmSignOut}>
            <View style={[styles.rowIcon, styles.rowIconDanger]}>
              <Ionicons name="log-out-outline" size={20} color={C.error} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: C.error }]}>Sign out</Text>
            </View>
          </Pressable>
        )}
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
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.outlineVariant,
    marginBottom: 6,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.onSurface, paddingHorizontal: 4, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.surfaceContainerHigh,
  },
  rowDanger: { backgroundColor: C.errorContainer + '40' },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: C.errorContainer + '66' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.onSurface },
  rowHint: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
});
