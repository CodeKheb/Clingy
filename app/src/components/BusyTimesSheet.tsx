// Lists the busy times saved from "Can't make it" and the busy-time picker, so they can be removed.

import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getUnavailableWindows, removeUnavailableWindows, type BusyWindow } from '../scheduling/scheduler';
import { C } from '../screens/utils/theme';
import { RescheduleOverlay } from './RescheduleOverlay';

const dayText = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const timeText = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function describe(w: BusyWindow): { title: string; detail: string } {
  const sameDay = new Date(w.start).toDateString() === new Date(w.end).toDateString();
  const wholeDays = new Date(w.start).getHours() === 0 && new Date(w.end).getHours() === 23;
  if (sameDay && wholeDays) return { title: dayText(w.start), detail: 'All day' };
  if (sameDay) return { title: dayText(w.start), detail: `${timeText(w.start)} – ${timeText(w.end)}` };
  return { title: `${dayText(w.start)} → ${dayText(w.end)}`, detail: wholeDays ? 'All day' : `${timeText(w.start)} – ${timeText(w.end)}` };
}

export function BusyTimesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [windows, setWindows] = useState<BusyWindow[]>([]);
  const [working, setWorking] = useState(false);

  const reload = useCallback(async () => setWindows(await getUnavailableWindows()), []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void getUnavailableWindows().then((w) => {
      if (active) setWindows(w);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const remove = async (toRemove?: BusyWindow[]) => {
    setWorking(true);
    try {
      await removeUnavailableWindows(toRemove);
      await reload();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close busy times" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>Busy times</Text>
            {windows.length > 0 && (
              <Pressable onPress={() => void remove()} hitSlop={8}>
                <Text style={styles.clearAll}>Clear all</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.hint}>Cling won&apos;t schedule study sessions during these times.</Text>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
            {windows.length === 0 ? (
              <Text style={styles.empty}>Nothing blocked off right now.</Text>
            ) : (
              windows.map((w) => {
                const { title, detail } = describe(w);
                return (
                  <View key={`${w.start}-${w.end}`} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{title}</Text>
                      <Text style={styles.rowDetail}>{detail}</Text>
                    </View>
                    <Pressable style={styles.trash} onPress={() => void remove([w])} hitSlop={8} accessibilityLabel="Remove busy time">
                      <Ionicons name="trash-outline" size={18} color={C.error} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
      <RescheduleOverlay visible={working} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: C.surfaceContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.outlineVariant, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { fontSize: 20, fontWeight: '700', color: C.onSurface },
  clearAll: { fontSize: 14, fontWeight: '600', color: C.error },
  hint: { fontSize: 12, color: C.onSurfaceVariant, paddingHorizontal: 4, marginTop: 2, marginBottom: 12 },
  list: { flexGrow: 0 },
  empty: { fontSize: 14, color: C.onSurfaceVariant, textAlign: 'center', paddingVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: C.surfaceContainerHigh },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.onSurface },
  rowDetail: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
  trash: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.errorContainer + '55' },
});
