// Shown after a COR scan: the parsed classes as editable rows. Nothing is saved until "Save all".

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DAYS, draftError, formatMinutes, type ClassDraft } from '../classes/time';
import { ClassFormSheet } from './ClassFormSheet';
import { C } from './utils/theme';

const daysText = (days: number[]) =>
  DAYS.filter((d) => days.includes(d.dow))
    .map((d) => d.short)
    .join(' ') || 'No days';

export function CorConfirmModal({
  drafts: initialDrafts,
  onSave,
  onClose,
}: {
  drafts: ClassDraft[];
  onSave: (drafts: ClassDraft[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [editing, setEditing] = useState<ClassDraft | null>(null);
  const allValid = drafts.length > 0 && drafts.every((d) => draftError(d) === null);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {drafts.length === 1 ? '1 class found' : `${drafts.length} classes found`}
            </Text>
            <Text style={styles.hint}>Check each one, fix anything that looks off, then save.</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cancel">
            <Ionicons name="close" size={24} color={C.onSurfaceVariant} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {drafts.map((d) => {
            const problem = draftError(d);
            return (
              <Pressable key={d.key} style={[styles.row, problem && styles.rowBad]} onPress={() => setEditing(d)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subject} numberOfLines={1}>
                    {d.subject || 'Untitled'}
                  </Text>
                  <Text style={styles.meta}>
                    {daysText(d.days)} · {formatMinutes(d.start)} – {formatMinutes(d.end)}
                    {d.room ? ` · ${d.room}` : ''}
                  </Text>
                  {problem ? <Text style={styles.problem}>{problem} (tap to fix)</Text> : null}
                </View>
                <Pressable
                  onPress={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}
                  hitSlop={10}
                  accessibilityLabel={`Remove ${d.subject}`}
                >
                  <Ionicons name="trash-outline" size={20} color={C.error} />
                </Pressable>
              </Pressable>
            );
          })}
          {drafts.length === 0 ? <Text style={styles.empty}>Nothing left to save.</Text> : null}
        </ScrollView>

        <Pressable style={[styles.saveAll, !allValid && styles.saveAllOff]} disabled={!allValid} onPress={() => onSave(drafts)}>
          <Text style={styles.saveAllText}>Save all</Text>
        </Pressable>

        {editing ? (
          <ClassFormSheet
            key={editing.key}
            visible
            title="Edit class"
            initial={editing}
            onClose={() => setEditing(null)}
            onSave={(next) => {
              setDrafts((all) => all.map((x) => (x.key === next.key ? next : x)));
              setEditing(null);
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '700', color: C.onSurface },
  hint: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.surfaceContainerLow,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
  },
  rowBad: { borderColor: C.error },
  subject: { fontSize: 15, fontWeight: '700', color: C.onSurface },
  meta: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 3 },
  problem: { fontSize: 12, color: C.error, marginTop: 3 },
  empty: { textAlign: 'center', color: C.onSurfaceVariant, padding: 24 },
  saveAll: { marginHorizontal: 16, marginBottom: 12, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryContainer },
  saveAllOff: { opacity: 0.4 },
  saveAllText: { fontSize: 16, fontWeight: '700', color: C.white },
});
