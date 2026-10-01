// Weekly class timetable. Reads only from SQLite (class_meetings); every change rebuilds the study
// plan so blocks never land on class time.

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { BottomNav, type NavTab } from '../components/BottomNav';
import { RescheduleOverlay } from '../components/RescheduleOverlay';
import { CorScanError, pickCorImage, scanCor, type ScanSource } from '../classes/corScan';
import { DAYS, draftToMeetings, formatMinutes, meetingToDraft, type ClassDraft } from '../classes/time';
import { COR_SCAN_ENABLED } from '../config';
import {
  deleteClassMeeting,
  getAllClassMeetings,
  insertClassMeetings,
  updateClassMeeting,
  type ClassMeeting,
} from '../db/queries';
import { schemaReady } from '../db/schema';
import { rescheduleAfterClassChange } from '../scheduling/scheduler';
import { ClassAddSheet } from './ClassAddSheet';
import { ClassFormSheet } from './ClassFormSheet';
import { CorConfirmModal } from './CorConfirmModal';
import { ScanError, ScanLoadingOverlay } from './ScanStates';
import { C } from './utils/theme';

const newDraft = (dow: number): ClassDraft => ({ key: 'new', subject: '', days: [dow], start: 9 * 60, end: 10 * 60 + 30, room: '' });

type FormTarget = { mode: 'add'; draft: ClassDraft } | { mode: 'edit'; draft: ClassDraft };
type ScanState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'confirm'; drafts: ClassDraft[] };

export function ClassScreen({
  onSelectTab,
  onSignOut,
}: {
  onSelectTab?: (tab: NavTab) => void;
  onSignOut?: () => void;
}) {
  const [meetings, setMeetings] = useState<ClassMeeting[]>([]);
  const [selectedDow, setSelectedDow] = useState(() => new Date().getDay());
  const [form, setForm] = useState<FormTarget | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });

  const load = useCallback(async () => {
    await schemaReady;
    setMeetings(await getAllClassMeetings());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load is async; setState runs after the await.
    load().catch((err) => console.warn('[ClassScreen] Failed to load classes:', err));
  }, [load]);

  const countByDow = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of meetings) counts.set(m.day_of_week, (counts.get(m.day_of_week) ?? 0) + 1);
    return counts;
  }, [meetings]);

  const dayMeetings = useMemo(
    () => meetings.filter((m) => m.day_of_week === selectedDow).sort((a, b) => a.start_minutes - b.start_minutes),
    [meetings, selectedDow],
  );

  // Writes, then rebuilds the study plan behind the blocking overlay, then reloads the list.
  const mutate = useCallback(
    async (write: () => Promise<void>) => {
      setBusy(true);
      try {
        await write();
        await rescheduleAfterClassChange();
        await load();
      } catch (err) {
        ToastAndroid.show(err instanceof Error ? err.message : 'Could not save that class', ToastAndroid.LONG);
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const saveForm = (target: FormTarget, draft: ClassDraft) => {
    setForm(null);
    void mutate(async () => {
      const rows = draftToMeetings(draft);
      if (target.mode === 'add') {
        await insertClassMeetings(rows);
        return;
      }
      // Editing one row: it takes the first picked day, any extra days become new rows.
      await updateClassMeeting(Number(draft.key), rows[0]);
      if (rows.length > 1) await insertClassMeetings(rows.slice(1));
    });
    if (draft.days.length > 0) setSelectedDow(draft.days[0]);
  };

  const confirmDelete = (m: ClassMeeting) =>
    Alert.alert('Delete class?', `${m.subject} on ${DAYS.find((d) => d.dow === m.day_of_week)?.short}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void mutate(() => deleteClassMeeting(m.id)) },
    ]);

  const openAdd = () => setForm({ mode: 'add', draft: newDraft(selectedDow) });

  const onFab = () => (COR_SCAN_ENABLED ? setAddSheetOpen(true) : openAdd());

  const lastSource = useRef<ScanSource>('camera');
  const scanning = useRef(false); // blocks double-taps while a photo is being read

  const startScan = useCallback(async (source: ScanSource) => {
    if (scanning.current) return;
    scanning.current = true;
    lastSource.current = source;
    try {
      const asset = await pickCorImage(source);
      if (!asset) return;
      setScan({ status: 'loading' });
      setScan({ status: 'confirm', drafts: await scanCor(asset) });
    } catch (err) {
      const message =
        err instanceof CorScanError ? err.message : "Couldn't read that photo. Try again, or add your classes by hand.";
      if (!(err instanceof CorScanError)) console.warn('[ClassScreen] COR scan failed:', err instanceof Error ? err.name : 'unknown');
      setScan({ status: 'error', message });
    } finally {
      scanning.current = false;
    }
  }, []);

  return (
    <View style={styles.root}>
      <AppHeader subtitle="Class schedule" onSignOut={onSignOut} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
          {DAYS.map(({ dow, short }) => {
            const active = dow === selectedDow;
            return (
              <Pressable key={dow} style={[styles.chip, active && styles.chipActive]} onPress={() => setSelectedDow(dow)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{short}</Text>
                <View style={[styles.chipDot, !countByDow.get(dow) && { opacity: 0 }]} />
              </Pressable>
            );
          })}
        </ScrollView>

        {dayMeetings.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="school-outline" size={40} color={C.onSurfaceVariant} />
            <Text style={styles.emptyTitle}>{meetings.length === 0 ? 'No classes yet' : 'Nothing on this day'}</Text>
            <Text style={styles.emptyText}>
              {meetings.length === 0
                ? COR_SCAN_ENABLED
                  ? 'Snap your COR or add one by hand.'
                  : 'Add your classes by hand and Cling will plan around them.'
                : 'Free day. Tap the button to add a class.'}
            </Text>
          </View>
        ) : (
          dayMeetings.map((m) => (
            <Pressable
              key={m.id}
              style={styles.card}
              onPress={() => setForm({ mode: 'edit', draft: meetingToDraft(m) })}
              onLongPress={() => confirmDelete(m)}
              accessibilityHint="Long press to delete"
            >
              <View style={styles.cardAccent} />
              <View style={styles.cardTime}>
                <Text style={styles.cardTimeText}>{formatMinutes(m.start_minutes)}</Text>
                <Text style={styles.cardTimeSub}>{formatMinutes(m.end_minutes)}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardSubject} numberOfLines={2}>
                  {m.subject}
                </Text>
                {m.room ? <Text style={styles.cardRoom}>{m.room}</Text> : null}
              </View>
              <Pressable onPress={() => confirmDelete(m)} hitSlop={10} accessibilityLabel={`Delete ${m.subject}`}>
                <Ionicons name="trash-outline" size={18} color={C.onSurfaceVariant} />
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={onFab} accessibilityLabel={COR_SCAN_ENABLED ? 'Add classes' : 'Add a class'}>
        <Ionicons name={COR_SCAN_ENABLED ? 'camera' : 'add'} size={26} color={C.white} />
      </Pressable>

      <BottomNav active="Class" onSelectTab={onSelectTab} />

      <ClassAddSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onCamera={() => void startScan('camera')}
        onGallery={() => void startScan('gallery')}
        onManual={openAdd}
      />

      {form ? (
        <ClassFormSheet
          key={form.draft.key + form.mode}
          visible
          title={form.mode === 'add' ? 'Add class' : 'Edit class'}
          initial={form.draft}
          onClose={() => setForm(null)}
          onSave={(draft) => saveForm(form, draft)}
        />
      ) : null}

      <ScanLoadingOverlay visible={scan.status === 'loading'} />
      <ScanError
        visible={scan.status === 'error'}
        message={scan.status === 'error' ? scan.message : ''}
        onRetry={() => {
          setScan({ status: 'idle' });
          void startScan(lastSource.current);
        }}
        onManual={() => {
          setScan({ status: 'idle' });
          openAdd();
        }}
      />
      {scan.status === 'confirm' ? (
        <CorConfirmModal
          drafts={scan.drafts}
          onClose={() => setScan({ status: 'idle' })}
          onSave={(drafts) => {
            setScan({ status: 'idle' });
            void mutate(() => insertClassMeetings(drafts.flatMap(draftToMeetings)));
          }}
        />
      ) : null}

      <RescheduleOverlay visible={busy} label="Updating your plan…" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  scrollView: { flex: 1, marginTop: 64, marginBottom: 80 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96, gap: 10 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingBottom: 6 },
  chip: { minWidth: 56, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.surfaceContainerHigh },
  chipActive: { backgroundColor: C.primaryContainer },
  chipText: { fontSize: 14, fontWeight: '700', color: C.onSurfaceVariant },
  chipTextActive: { color: C.white },
  chipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.secondary, marginTop: 4 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.onSurface },
  emptyText: { fontSize: 14, color: C.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.surfaceContainerLow,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    overflow: 'hidden',
  },
  cardAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.secondary },
  cardTime: { width: 74, gap: 2 },
  cardTimeText: { fontSize: 13, fontWeight: '700', color: C.onSurface },
  cardTimeSub: { fontSize: 11, color: C.onSurfaceVariant },
  cardBody: { flex: 1, minWidth: 0, gap: 3 },
  cardSubject: { fontSize: 15, fontWeight: '700', color: C.onSurface },
  cardRoom: { fontSize: 12, color: C.onSurfaceVariant },
  // Sits above the tab bar (64) and home-bar strip (~12) with a 16 margin.
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 92,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primaryContainer,
    elevation: 6,
    zIndex: 40,
  },
});
