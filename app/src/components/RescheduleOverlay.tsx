// "Rescheduling…" spinner over the whole window (status and navigation bars included) that also
// blocks taps while the schedule is being rebuilt. It is its own Modal window so it can't be
// clipped by whatever screen or sheet it is shown from.

import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { C } from '../screens/utils/theme';

export function RescheduleOverlay({ visible, label = 'Rescheduling…' }: { visible: boolean; label?: string }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {}} // the back button can't dismiss it mid-reschedule
    >
      <View style={styles.scrim}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.text}>{label}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 30,
    borderRadius: 20,
    backgroundColor: C.surfaceContainerHigh,
  },
  text: { fontSize: 14, fontWeight: '600', color: C.onSurface },
});
