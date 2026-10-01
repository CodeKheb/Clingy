// Add/edit form for a class: subject, meeting days, start/end time, optional room.
// Shared by the Class tab and the COR confirmation list.

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DAYS, draftError, formatMinutes, type ClassDraft } from '../classes/time';
import { pickTimeOfDay } from './utils/pickDateTime';
import { C } from './utils/theme';

export function ClassFormSheet({
  visible,
  title,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  initial: ClassDraft;
  onSave: (draft: ClassDraft) => void;
  onClose: () => void;
}) {
  // The parent remounts this per target (key), so the initial draft seeds state once.
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ClassDraft>(initial);
  const [showError, setShowError] = useState(false);
  const error = draftError(draft);

  const toggleDay = (dow: number) =>
    setDraft((d) => ({ ...d, days: d.days.includes(dow) ? d.days.filter((x) => x !== dow) : [...d.days, dow] }));

  const pickTime = async (field: 'start' | 'end') => {
    const minutes = await pickTimeOfDay(draft[field], field === 'start' ? 'Class starts at?' : 'Class ends at?');
    if (minutes !== null) setDraft((d) => ({ ...d, [field]: minutes }));
  };

  const submit = () => {
    if (error) {
      setShowError(true);
      return;
    }
    onSave(draft);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={styles.label}>Subject</Text>
            <TextInput
              style={styles.input}
              value={draft.subject}
              onChangeText={(subject) => setDraft((d) => ({ ...d, subject }))}
              placeholder="e.g. CS 101"
              placeholderTextColor={C.onSurfaceVariant + '99'}
              maxLength={60}
            />

            <Text style={styles.label}>Days</Text>
            <View style={styles.dayRow}>
              {DAYS.map(({ dow, chip }) => {
                const on = draft.days.includes(dow);
                return (
                  <Pressable
                    key={dow}
                    style={[styles.dayChip, on && styles.dayChipOn]}
                    onPress={() => toggleDay(dow)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>{chip}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timeRow}>
              <Pressable style={styles.timeBox} onPress={() => void pickTime('start')}>
                <Text style={styles.label}>Starts</Text>
                <Text style={styles.timeText}>{formatMinutes(draft.start)}</Text>
              </Pressable>
              <Pressable style={styles.timeBox} onPress={() => void pickTime('end')}>
                <Text style={styles.label}>Ends</Text>
                <Text style={styles.timeText}>{formatMinutes(draft.end)}</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Room (optional)</Text>
            <TextInput
              style={styles.input}
              value={draft.room}
              onChangeText={(room) => setDraft((d) => ({ ...d, room }))}
              placeholder="e.g. RM 204"
              placeholderTextColor={C.onSurfaceVariant + '99'}
              maxLength={40}
            />

            {showError && error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.save} onPress={submit}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.outlineVariant, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', color: C.onSurface, paddingHorizontal: 4, marginBottom: 4 },
  body: { gap: 8, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '700', color: C.onSurfaceVariant, letterSpacing: 0.5, marginTop: 4 },
  input: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.onSurface,
    backgroundColor: C.surfaceContainerHigh,
  },
  dayRow: { flexDirection: 'row', gap: 6 },
  dayChip: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceContainerHigh,
  },
  dayChipOn: { backgroundColor: C.primaryContainer },
  dayChipText: { fontSize: 13, fontWeight: '700', color: C.onSurfaceVariant },
  dayChipTextOn: { color: C.white },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeBox: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: C.surfaceContainerHigh },
  timeText: { fontSize: 17, fontWeight: '700', color: C.onSurface, marginTop: 4 },
  error: { fontSize: 13, color: C.error, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancel: { flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceContainerHigh },
  cancelText: { fontSize: 15, fontWeight: '600', color: C.onSurface },
  save: { flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryContainer },
  saveText: { fontSize: 15, fontWeight: '700', color: C.white },
});
