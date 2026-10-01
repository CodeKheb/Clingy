// Day timeline where study blocks can be dragged to a new time (snapping to 15 minutes) or dropped
// on a day chip to move them to that day. A drop pins the block there and rebuilds the rest of the
// schedule around it (see scheduler.moveBlock).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Assignment, Event as CalendarEvent, ScheduleBlock } from '../db/queries';
import { moveBlock, pinKey } from '../scheduling/scheduler';
import { RescheduleOverlay } from '../components/RescheduleOverlay';
import { C } from './utils/theme';

const START_HOUR = 9;
const END_HOUR = 21;
const HOUR_HEIGHT = 50;
const SNAP_MINUTES = 15;
const DAYS_AHEAD = 14;
// Below this a block can't fit a time line and a title line, so it uses a single line.
const TWO_LINE_MIN_HEIGHT = 44;
const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const timeText = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const at = (day: Date, minutes: number) => {
  const d = new Date(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
};

type DropInfo = { dy: number; moveX: number; moveY: number };

/** How the dragged block should settle once the drop target is known. */
export type Settle = { kind: 'snap'; dy: number } | { kind: 'hide' } | { kind: 'back' };

const snapMinutes = (start: Date, durationMin: number, dy: number) =>
  Math.min(
    END_HOUR * 60 - durationMin,
    Math.max(START_HOUR * 60, Math.round((minutesOfDay(start) + (dy / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES),
  );

function DraggableBlock({
  block,
  title,
  pinned,
  highlighted,
  onDrop,
}: {
  block: ScheduleBlock;
  title: string;
  pinned: boolean;
  highlighted: boolean;
  onDrop: (block: ScheduleBlock, drop: DropInfo, settle: (s: Settle) => void) => void;
}) {
  const start = new Date(block.start_at);
  const end = new Date(block.end_at);
  const durationMin = (end.getTime() - start.getTime()) / 60000;
  const top = ((minutesOfDay(start) - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(30, (durationMin / 60) * HOUR_HEIGHT);

  const [pan] = useState(() => new Animated.ValueXY());
  const [fade] = useState(() => new Animated.Value(1));
  const [dragging, setDragging] = useState(false);
  const [previewMin, setPreviewMin] = useState<number | null>(null);

  // Live "where it would land" time while dragging.
  useEffect(() => {
    const id = pan.y.addListener(({ value }) => setPreviewMin(snapMinutes(start, durationMin, value)));
    return () => pan.y.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start/duration only change when the block remounts
  }, [pan]);

  // The responder is created once per mount. A block's id changes whenever it moves, so a moved block remounts with fresh props.
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        onDrop(block, { dy: g.dy, moveX: g.moveX, moveY: g.moveY }, (settle) => {
          // Settle onto the snapped time (or away) instead of jumping back, so there's no flicker while the schedule rebuilds.
          if (settle.kind === 'snap') {
            Animated.parallel([
              Animated.timing(pan.y, { toValue: settle.dy, duration: 90, useNativeDriver: false }),
              Animated.timing(pan.x, { toValue: 0, duration: 90, useNativeDriver: false }),
            ]).start();
          } else if (settle.kind === 'hide') {
            Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: false }).start();
          } else {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 8 }).start();
          }
        });
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 8 }).start();
      },
    }),
  );

  const shownStart = dragging && previewMin !== null ? at(start, previewMin) : start;
  const shownEnd = dragging && previewMin !== null ? new Date(shownStart.getTime() + durationMin * 60000) : end;

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.block,
        { top, height, opacity: fade, transform: pan.getTranslateTransform() },
        highlighted && styles.blockHighlight,
        dragging && styles.blockDragging,
      ]}
    >
      {height >= TWO_LINE_MIN_HEIGHT ? (
        <>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTime} numberOfLines={1}>
              {timeText(shownStart)} – {timeText(shownEnd)}
            </Text>
            {pinned ? <Ionicons name="pin" size={11} color={C.white} /> : null}
          </View>
          <Text style={styles.blockTitle} numberOfLines={height > 66 ? 2 : 1}>
            {title}
          </Text>
        </>
      ) : (
        // Too short for two lines: time and title share one line instead of cutting the title off.
        <View style={styles.blockHeader}>
          <Text style={styles.blockTitle} numberOfLines={1}>
            <Text style={styles.blockTime}>{timeText(shownStart)}</Text>
            {'  '}
            {title}
          </Text>
          {pinned ? <Ionicons name="pin" size={11} color={C.white} /> : null}
        </View>
      )}
    </Animated.View>
  );
}

export function ArrangeModal({
  initialDay,
  highlightBlockId,
  onClose,
  blocks,
  events,
  assignmentsById,
  pinnedKeys,
  onMoved,
}: {
  initialDay: Date;
  highlightBlockId?: string;
  onClose: () => void;
  blocks: ScheduleBlock[];
  events: CalendarEvent[];
  assignmentsById: Map<string, Assignment>;
  pinnedKeys: Set<string>;
  onMoved: () => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState(() => Math.max(0, days.findIndex((d) => sameDay(d, initialDay))));
  const chipRefs = useRef<(View | null)[]>([]);
  const day = days[selected];

  const dayBlocks = useMemo(() => blocks.filter((b) => sameDay(new Date(b.start_at), day)), [blocks, day]);
  const dayEvents = useMemo(
    () => events.filter((e) => sameDay(new Date(e.start_at), day)),
    [events, day],
  );
  const countByDay = useMemo(
    () => days.map((d) => blocks.filter((b) => sameDay(new Date(b.start_at), d)).length),
    [blocks, days],
  );

  const measureChips = () =>
    Promise.all(
      days.map(
        (_, i) =>
          new Promise<{ x: number; y: number; w: number; h: number } | null>((resolve) => {
            const ref = chipRefs.current[i];
            if (!ref) return resolve(null);
            ref.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
          }),
      ),
    );

  const handleDrop = async (block: ScheduleBlock, { dy, moveX, moveY }: DropInfo, settle: (s: Settle) => void) => {
    const start = new Date(block.start_at);
    const durationMin = (new Date(block.end_at).getTime() - start.getTime()) / 60000;

    // Dropped on a day chip: same time of day, that day. Otherwise: same day, snapped to the nearest slot.
    let targetDay = new Date(start);
    targetDay.setHours(0, 0, 0, 0);
    let minutes = snapMinutes(start, durationMin, dy);
    const chips = await measureChips();
    const hit = chips.findIndex((c) => c && moveX >= c.x && moveX <= c.x + c.w && moveY >= c.y && moveY <= c.y + c.h);
    if (hit >= 0 && !sameDay(days[hit], start)) {
      targetDay = days[hit];
      minutes = snapMinutes(start, durationMin, 0);
    }

    const newStart = at(targetDay, minutes);
    if (newStart.getTime() === start.getTime()) {
      settle({ kind: 'back' });
      return;
    }
    if (newStart.getTime() < Date.now()) {
      settle({ kind: 'back' });
      ToastAndroid.show('That time has already passed', ToastAndroid.SHORT);
      return;
    }

    settle(sameDay(newStart, start) ? { kind: 'snap', dy: ((minutes - minutesOfDay(start)) / 60) * HOUR_HEIGHT } : { kind: 'hide' });
    setWorking(true);
    try {
      await moveBlock(block, newStart.getTime());
      ToastAndroid.show(
        `Moved to ${newStart.toLocaleDateString([], { weekday: 'short', day: 'numeric' })}, ${timeText(newStart)}`,
        ToastAndroid.SHORT,
      );
    } catch (e) {
      ToastAndroid.show(e instanceof Error ? e.message : 'Could not move that block', ToastAndroid.LONG);
    } finally {
      await onMoved();
      setWorking(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Arrange schedule</Text>
            <Text style={styles.hint}>Hold a block and drag it to a new time, or drop it on a day above.</Text>
          </View>
          <Pressable style={styles.doneButton} onPress={onClose} hitSlop={10}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
          {days.map((d, i) => (
            <View
              key={d.toISOString()}
              ref={(r) => {
                chipRefs.current[i] = r;
              }}
              collapsable={false}
            >
              <Pressable style={[styles.chip, i === selected && styles.chipActive]} onPress={() => setSelected(i)}>
                <Text style={[styles.chipDay, i === selected && styles.chipTextActive]}>
                  {d.toLocaleDateString([], { weekday: 'short' })}
                </Text>
                <Text style={[styles.chipDate, i === selected && styles.chipTextActive]}>{d.getDate()}</Text>
                <View style={[styles.chipDot, countByDay[i] === 0 && { opacity: 0 }]} />
              </Pressable>
            </View>
          ))}
        </ScrollView>

        <View style={styles.gridWrap}>
          <View style={styles.hours}>
            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
              <Text key={i} style={[styles.hourLabel, { top: i * HOUR_HEIGHT - 7 }]}>
                {at(day, (START_HOUR + i) * 60).toLocaleTimeString([], { hour: 'numeric' })}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
              <View key={i} style={[styles.gridLine, { top: i * HOUR_HEIGHT }]} />
            ))}
            {dayEvents.map((e) => {
              const s = new Date(e.start_at);
              const en = new Date(e.end_at);
              const top = Math.max(0, ((minutesOfDay(s) - START_HOUR * 60) / 60) * HOUR_HEIGHT);
              const bottom = Math.min(GRID_HEIGHT, ((minutesOfDay(en) - START_HOUR * 60) / 60) * HOUR_HEIGHT);
              if (bottom <= 0 || top >= GRID_HEIGHT || bottom <= top) return null;
              return (
                <View key={e.id} style={[styles.event, { top, height: bottom - top }]}>
                  <Text style={styles.eventText} numberOfLines={1}>
                    {e.title}
                  </Text>
                </View>
              );
            })}
            {dayBlocks.map((b) => (
              <DraggableBlock
                key={b.id}
                block={b}
                title={assignmentsById.get(b.assignment_id)?.title ?? 'Study block'}
                pinned={pinnedKeys.has(pinKey(b.assignment_id, b.start_at))}
                highlighted={b.id === highlightBlockId}
                onDrop={(blk, drop, settle) => void handleDrop(blk, drop, settle)}
              />
            ))}
            {dayBlocks.length === 0 && (
              <Text style={styles.empty}>No study blocks on this day.</Text>
            )}
          </View>
        </View>
        <RescheduleOverlay visible={working} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '700', color: C.onSurface },
  hint: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  doneButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.primaryContainer },
  doneText: { color: C.white, fontWeight: '700', fontSize: 14 },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  chip: {
    width: 52,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: C.surfaceContainerHigh,
  },
  chipActive: { backgroundColor: C.primaryContainer },
  chipDay: { fontSize: 11, color: C.onSurfaceVariant, fontWeight: '600' },
  chipDate: { fontSize: 18, color: C.onSurface, fontWeight: '700', marginTop: 2 },
  chipTextActive: { color: C.white },
  chipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.secondary, marginTop: 4 },
  gridWrap: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12 },
  hours: { width: 44, height: GRID_HEIGHT },
  hourLabel: { position: 'absolute', right: 8, fontSize: 10, color: C.onSurfaceVariant },
  grid: { flex: 1, height: GRID_HEIGHT },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.outlineVariant },
  event: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: C.surfaceContainerHighest,
    opacity: 0.8,
  },
  eventText: { fontSize: 11, color: C.onSurfaceVariant },
  block: {
    position: 'absolute',
    left: 8,
    right: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: C.primaryContainer,
    overflow: 'hidden',
    borderWidth: 2, // always present (transparent) so picking a block up doesn't change its size
    borderColor: 'transparent',
  },
  blockHighlight: { borderColor: C.secondary },
  blockDragging: { elevation: 8, zIndex: 20, borderColor: C.white },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockTime: { fontSize: 11, fontWeight: '700', color: C.white },
  blockTitle: { flexShrink: 1, fontSize: 12, color: C.white },
  empty: { position: 'absolute', top: 20, left: 16, right: 16, fontSize: 12, color: C.onSurfaceVariant, textAlign: 'center' },
});
