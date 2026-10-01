// Full-screen states for the COR scan: reading the photo, and a friendly failure.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ClingFace } from '../components/ClingFace';
import { C } from './utils/theme';

export function ScanLoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <View style={styles.scrim}>
        <ClingFace size={72} backgroundColor={C.surfaceContainerHighest} borderColor={C.primary + '4D'} borderWidth={1} />
        <Text style={styles.title}>Reading your COR...</Text>
        <Text style={styles.hint}>This takes a few seconds.</Text>
      </View>
    </Modal>
  );
}

export function ScanError({
  visible,
  message,
  onRetry,
  onManual,
}: {
  visible: boolean;
  message: string;
  onRetry: () => void;
  onManual: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onManual}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>Couldn&apos;t read that one</Text>
          <Text style={styles.hint}>{message}</Text>
          <View style={styles.buttons}>
            <Pressable style={styles.secondary} onPress={onManual}>
              <Text style={styles.secondaryText}>Add manually</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={onRetry}>
              <Text style={styles.primaryText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: 'rgba(15, 19, 28, 0.92)' },
  card: { width: '100%', maxWidth: 360, padding: 22, borderRadius: 24, gap: 10, backgroundColor: C.surfaceContainerHigh },
  title: { fontSize: 18, fontWeight: '700', color: C.onSurface, textAlign: 'center' },
  hint: { fontSize: 14, color: C.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 10 },
  secondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceContainerHighest },
  secondaryText: { fontSize: 14, fontWeight: '600', color: C.onSurface },
  primary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryContainer },
  primaryText: { fontSize: 14, fontWeight: '700', color: C.white },
});
