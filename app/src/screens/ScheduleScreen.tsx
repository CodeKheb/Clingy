// Renders proposed time blocks from scheduling/scheduler.ts.
//
// Reads schedule_blocks/events from SQLite and joins blocks to their assignment
// for title + urgency. Layout reuses the shared design
// system (src/theme.ts + src/components/) so it matches HomeScreen exactly.

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { Badge } from '../components/Badge';
import { BottomNav } from '../components/BottomNav';
import { EmptyState } from '../components/EmptyState';
import { EventTimeline } from '../components/EventTimeline';
import { SectionHeader } from '../components/SectionHeader';
import {
  type Assignment,
  type ClassMeeting,
  type Event as CalEvent,
  type ScheduleBlock,
  getAllAssignments,
  getAllClassMeetings,
  getAllScheduleBlocks,
  getUpcomingEvents,
} from '../db/queries';
import { findClassOverlap } from '../classes/occurrences';
import { schemaReady } from '../db/schema';
import {
  buildProposedSchedule,
  commitProposedSchedule,
  getDoneMinutes,
  getPinnedKeys,
  markBlockDone,
  markUnavailableAndReschedule,
  moveBlock,
  pinKey,
  unpinBlock,
} from '../scheduling/scheduler';
import { sessionLabels, type TaskType } from '../priority/taskProfile';
import { ArrangeModal } from './ArrangeModal';
import { RescheduleOverlay } from '../components/RescheduleOverlay';
import { BlockActionSheet } from './BlockActionSheet';
import { pickMoment } from './utils/pickDateTime';
import { C, urgencyColor, urgencyLabel } from './utils/theme';
import {
  dayLabel,
  durationEstimate,
  durationLabel,
  formatTime,
  isToday,
} from './utils/format';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blockMinutes(block: ScheduleBlock): number {
  return Math.max(
    0,
    Math.round(
      (new Date(block.end_at).getTime() - new Date(block.start_at).getTime()) /
        60_000,
    ),
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlanSummaryCard({
  blockCount,
  plannedMinutes,
  nextLabel,
  onRerun,
  rerunning,
  rerunError,
}: {
  blockCount: number;
  plannedMinutes: number;
  nextLabel: string | null;
  onRerun: () => void;
  rerunning: boolean;
  rerunError: string | null;
}) {
  return (
    <View style={styles.summaryCard}>
      {/* Decorative glow */}
      <View style={styles.summaryGlow} />

      <View style={styles.summaryHeaderRow}>
        <View style={styles.summaryTitleWrap}>
          <Text style={styles.summaryEyebrow}>AUTO-SCHEDULED STUDY PLAN</Text>
          <Text style={styles.summaryTitle}>Your week, organised</Text>
        </View>
        <Badge tone="primary" label="Auto-scheduled" />
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statPill}>
          <Text style={styles.statIcon}>🧩</Text>
          <View style={styles.statTextWrap}>
            <Text style={styles.statLabel}>BLOCKS</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {blockCount}
            </Text>
          </View>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statIcon}>⏱</Text>
          <View style={styles.statTextWrap}>
            <Text style={styles.statLabel}>PLANNED</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {durationEstimate(plannedMinutes)}
            </Text>
          </View>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statIcon}>⏭</Text>
          <View style={styles.statTextWrap}>
            <Text style={styles.statLabel}>NEXT UP</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {nextLabel ?? '—'}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        style={[styles.ctaButton, rerunning && styles.ctaButtonDisabled]}
        onPress={onRerun}
        disabled={rerunning}
      >
        {rerunning ? (
          <ActivityIndicator size="small" color={C.white} />
        ) : (
          <Text style={styles.ctaIcon}>🔁</Text>
        )}
        <Text style={styles.ctaText}>
          {rerunning ? 'Scheduling…' : 'Re-run Scheduler'}
        </Text>
      </Pressable>
      {rerunError && <Text style={styles.summaryError}>{rerunError}</Text>}
    </View>
  );
}

function BlockCard({
  block,
  assignment,
  sessionLabel,
  pinned,
  doneMinutes,
  canMarkDone,
  onDone,
  onMenu,
}: {
  block: ScheduleBlock;
  assignment?: Assignment;
  sessionLabel?: string;
  pinned?: boolean;
  doneMinutes?: number;
  canMarkDone?: boolean;
  onDone?: (block: ScheduleBlock) => void;
  onMenu?: (block: ScheduleBlock) => void;
}) {
  const accent = assignment
    ? urgencyColor(assignment.urgency_score)
    : C.outlineVariant;

  return (
    <View style={styles.blockCard}>
      {/* Urgency accent */}
      <View style={[styles.blockAccent, { backgroundColor: accent }]} />

      {/* Time column */}
      <View style={styles.blockTimeCol}>
        <Text style={styles.blockTime}>{formatTime(block.start_at)}</Text>
        <Text style={styles.blockDuration}>
          {durationLabel(block.start_at, block.end_at)}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.blockBody}>
        {sessionLabel || pinned ? (
          <View style={styles.blockSessionRow}>
            {sessionLabel ? <Text style={styles.blockSession}>{sessionLabel}</Text> : null}
            {pinned ? <Ionicons name="pin" size={12} color={C.primary} /> : null}
          </View>
        ) : null}
        <Text style={styles.blockTitle} numberOfLines={2}>
          {assignment?.title ?? 'Study block'}
        </Text>
        <View style={styles.blockMetaRow}>
          <View style={styles.blockMetaItem}>
            <View style={[styles.blockDot, { backgroundColor: accent }]} />
            <Text style={styles.blockMetaText}>
              {assignment ? urgencyLabel(assignment.urgency_score) : 'Scheduled'}
            </Text>
          </View>
          {assignment && assignment.suggested_minutes > 0 ? (
            <Text style={styles.blockMetaText}>
              {doneMinutes
                ? `${durationEstimate(doneMinutes)} done of ${durationEstimate(assignment.suggested_minutes)}`
                : `Est. ${durationEstimate(assignment.suggested_minutes)}`}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.blockSide}>
        {onMenu ? (
          <Pressable
            style={styles.blockMenuButton}
            onPress={() => onMenu(block)}
            hitSlop={8}
            accessibilityLabel="Block options"
          >
            <Ionicons name="ellipsis-vertical" size={18} color={C.onSurfaceVariant} />
          </Pressable>
        ) : null}
        {canMarkDone && onDone ? (
          <Pressable
            style={styles.doneButton}
            onPress={() => onDone(block)}
            hitSlop={6}
            accessibilityLabel="Mark this session as done"
          >
            <Ionicons name="checkmark" size={16} color={C.onTertiary} />
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DayGroup({
  label,
  blocks,
  assignmentsById,
  sessionLabels: labels,
  pinnedKeys,
  doneMinutes,
  firstBlockId,
  onDone,
  onMenu,
}: {
  label: string;
  blocks: ScheduleBlock[];
  assignmentsById: Map<string, Assignment>;
  sessionLabels: Map<string, string>;
  pinnedKeys: Set<string>;
  doneMinutes: Record<string, number>;
  firstBlockId: string | null;
  onDone?: (block: ScheduleBlock) => void;
  onMenu?: (block: ScheduleBlock) => void;
}) {
  return (
    <View style={styles.dayGroup}>
      <Text style={styles.dayLabel}>{label}</Text>
      {blocks.map((block) => (
        <BlockCard
          key={block.id}
          block={block}
          assignment={assignmentsById.get(block.assignment_id)}
          sessionLabel={labels.get(block.id)}
          pinned={pinnedKeys.has(pinKey(block.assignment_id, block.start_at))}
          doneMinutes={doneMinutes[block.assignment_id]}
          canMarkDone={block.id === firstBlockId}
          onDone={onDone}
          onMenu={onMenu}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export type ScheduleScreenProps = {
  onSelectTab?: (tab: import('../components/BottomNav').NavTab) => void;
  onSignOut?: () => void;
};

export function ScheduleScreen({ onSelectTab, onSignOut }: ScheduleScreenProps) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [classes, setClasses] = useState<ClassMeeting[]>([]);
  const [assignmentsById, setAssignmentsById] = useState<Map<string, Assignment>>(
    new Map(),
  );
  const sessionLabelsById = useMemo(() => {
    const types = new Map<string, TaskType>();
    for (const a of assignmentsById.values()) types.set(a.id, a.task_type as TaskType);
    return sessionLabels(blocks, types);
  }, [blocks, assignmentsById]);
  const [menuBlock, setMenuBlock] = useState<ScheduleBlock | null>(null);
  const [arrangeTarget, setArrangeTarget] = useState<{ day: Date; blockId?: string } | null>(null);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const [doneMinutes, setDoneMinutes] = useState<Record<string, number>>({});
  const [firstBlockId, setFirstBlockId] = useState<string | null>(null);
  const [nextLabel, setNextLabel] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const loadFromDb = useCallback(async () => {
    await schemaReady;
    const [b, e, c, a, pins, done] = await Promise.all([
      getAllScheduleBlocks(),
      getUpcomingEvents(),
      getAllClassMeetings(),
      getAllAssignments(),
      getPinnedKeys(),
      getDoneMinutes(),
    ]);
    setPinnedKeys(pins);
    setDoneMinutes(done);
    setBlocks(b);
    setEvents(e);
    setClasses(c);
    setAssignmentsById(
      new Map(a.map((assignment) => [assignment.id, assignment])),
    );

    // "Now" is read here (not during render) to keep the component pure.
    const now = Date.now();
    const next =
      b.find((block) => new Date(block.end_at).getTime() >= now) ?? null;
    setFirstBlockId(next?.id ?? null);
    setNextLabel(
      next ? `${dayLabel(next.start_at)} ${formatTime(next.start_at)}` : null,
    );
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadFromDb is async; its setState calls run after the microtask queue, not synchronously in this effect body.
    loadFromDb().catch((err) => {
      if (active) console.warn('[ScheduleScreen] Failed to load data:', err);
    });
    return () => {
      active = false;
    };
  }, [loadFromDb]);

  // Every reschedule action goes through here so the spinner shows and the buttons lock until the screen has reloaded.
  const runReschedule = useCallback(
    async (action: () => Promise<void>) => {
      setRerunning(true);
      setRerunError(null);
      try {
        await action();
        await loadFromDb();
      } catch (err) {
        setRerunError(err instanceof Error ? err.message : String(err));
      } finally {
        setRerunning(false);
      }
    },
    [loadFromDb],
  );

  const applyUnavailable = useCallback(
    (startAt: string, endAt: string) => runReschedule(() => markUnavailableAndReschedule(startAt, endAt)),
    [runReschedule],
  );

  const onCantSlot = useCallback(
    (block: ScheduleBlock) => void applyUnavailable(block.start_at, block.end_at),
    [applyUnavailable],
  );

  // Blocking just one slot puts the next session in the slot beside it, so "this day" is its own choice.
  const onCantDay = useCallback(
    (block: ScheduleBlock) => {
      const dayStart = new Date(block.start_at);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(block.start_at);
      dayEnd.setHours(23, 59, 59, 0);
      void applyUnavailable(dayStart.toISOString(), dayEnd.toISOString());
    },
    [applyUnavailable],
  );

  const onMove = useCallback(
    async (block: ScheduleBlock) => {
      const target = await pickMoment(new Date(block.start_at));
      if (!target) return;
      const durationMs = new Date(block.end_at).getTime() - new Date(block.start_at).getTime();
      const clash = findClassOverlap(classes, target.getTime(), target.getTime() + durationMs);
      if (clash) {
        ToastAndroid.show(`That overlaps your ${clash.subject} class`, ToastAndroid.SHORT);
        return;
      }
      await runReschedule(() => moveBlock(block, target.getTime()));
    },
    [runReschedule, classes],
  );

  const onDone = useCallback((block: ScheduleBlock) => runReschedule(() => markBlockDone(block)), [runReschedule]);

  const onUnpin = useCallback((block: ScheduleBlock) => runReschedule(() => unpinBlock(block)), [runReschedule]);

  const onRerun = useCallback(
    () =>
      runReschedule(async () => {
        await commitProposedSchedule(await buildProposedSchedule());
      }),
    [runReschedule],
  );

  const plannedMinutes = useMemo(
    () => blocks.reduce((sum, block) => sum + blockMinutes(block), 0),
    [blocks],
  );

  // Blocks are ordered by start_at, so a single pass groups consecutive days.
  const dayGroups = useMemo(() => {
    const groups: { label: string; blocks: ScheduleBlock[] }[] = [];
    for (const block of blocks) {
      const label = dayLabel(block.start_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.blocks.push(block);
      } else {
        groups.push({ label, blocks: [block] });
      }
    }
    return groups;
  }, [blocks]);

  const todayEvents = useMemo(
    () => events.filter((event) => isToday(event.start_at)),
    [events],
  );

  return (
    <View style={styles.root}>
      <AppHeader subtitle="Study Schedule" onSignOut={onSignOut} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan summary */}
        <PlanSummaryCard
          blockCount={blocks.length}
          plannedMinutes={plannedMinutes}
          nextLabel={nextLabel}
          onRerun={onRerun}
          rerunning={rerunning}
          rerunError={rerunError}
        />

        {/* Proposed study blocks */}
        <View style={styles.section}>
          <SectionHeader
            icon="grid-outline"
            title="Proposed Study Blocks"
            right={
              <Badge
                tone="neutral"
                label={blocks.length === 1 ? '1 block' : `${blocks.length} blocks`}
              />
            }
          />
          {dayGroups.length === 0 ? (
            <EmptyState text="No study blocks yet. Sync your assignments and run the scheduler to see proposed time blocks here." />
          ) : (
            dayGroups.map((group) => (
              <DayGroup
                key={group.blocks[0].start_at}
                label={group.label}
                blocks={group.blocks}
                assignmentsById={assignmentsById}
                sessionLabels={sessionLabelsById}
                pinnedKeys={pinnedKeys}
                doneMinutes={doneMinutes}
                firstBlockId={firstBlockId}
                onDone={(block) => void onDone(block)}
                onMenu={setMenuBlock}
              />
            ))
          )}
        </View>

        {/* Today's calendar */}
        <View style={styles.section}>
          <SectionHeader
            icon="calendar-outline"
            title="Today's Calendar"
            right={<Badge tone="secondary" label="GCal Offline Sync" />}
          />
          <EventTimeline
            events={todayEvents}
            emptyText="No calendar events synced for today."
          />
        </View>
      </ScrollView>

      <BottomNav active="Schedule" onSelectTab={onSelectTab} />

      <RescheduleOverlay visible={rerunning} />

      <BlockActionSheet
        visible={menuBlock !== null}
        title={menuBlock ? (assignmentsById.get(menuBlock.assignment_id)?.title ?? 'Study block') : ''}
        subtitle={menuBlock ? `${dayLabel(menuBlock.start_at)} · ${formatTime(menuBlock.start_at)} · ${durationLabel(menuBlock.start_at, menuBlock.end_at)}` : ''}
        pinned={menuBlock ? pinnedKeys.has(pinKey(menuBlock.assignment_id, menuBlock.start_at)) : false}
        onClose={() => setMenuBlock(null)}
        onDrag={() => menuBlock && setArrangeTarget({ day: new Date(menuBlock.start_at), blockId: menuBlock.id })}
        onPickTime={() => menuBlock && void onMove(menuBlock)}
        onCantSlot={() => menuBlock && onCantSlot(menuBlock)}
        onCantDay={() => menuBlock && onCantDay(menuBlock)}
        onUnpin={() => menuBlock && void onUnpin(menuBlock)}
      />

      {arrangeTarget && (
        <ArrangeModal
          initialDay={arrangeTarget.day}
          highlightBlockId={arrangeTarget.blockId}
          onClose={() => setArrangeTarget(null)}
          blocks={blocks}
          events={events}
          classes={classes}
          assignmentsById={assignmentsById}
          pinnedKeys={pinnedKeys}
          onMoved={() => void loadFromDb()}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles (screen-specific — shared tokens/components live in src/theme.ts and
// src/components/)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  blockSide: { alignItems: 'flex-end', gap: 6 },
  doneButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, marginRight: 6, borderRadius: 999, backgroundColor: C.tertiary },
  doneButtonText: { fontSize: 12, fontWeight: '700', color: C.onTertiary },
  blockMenuButton: { alignSelf: 'flex-start', padding: 10 },
  blockSessionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  blockSession: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: C.secondary },
  // Root
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
    marginTop: 64,
    marginBottom: 80,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 24,
  },

  // Plan summary card
  summaryCard: {
    borderRadius: 16,
    backgroundColor: C.surfaceContainer,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    padding: 16,
    overflow: 'hidden',
    marginTop: 8,
    gap: 12,
  },
  summaryGlow: {
    position: 'absolute',
    right: -32,
    top: -32,
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: C.primaryContainer + '33',
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  summaryEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: C.onSurfaceVariant,
    letterSpacing: 1,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.onSurface,
    marginTop: 2,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: C.surfaceContainerLowest + 'CC',
    borderWidth: 1,
    borderColor: C.surfaceContainerHighest + '99',
  },
  statIcon: {
    fontSize: 16,
  },
  statTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.onSurfaceVariant,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '600',
    color: C.onSurface,
    letterSpacing: 0.2,
  },

  // CTA
  ctaButton: {
    height: 44,
    borderRadius: 999,
    backgroundColor: C.primaryContainer,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaButtonDisabled: {
    opacity: 0.7,
  },
  ctaIcon: {
    fontSize: 16,
    color: C.white,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.1,
  },
  summaryError: {
    marginTop: 8,
    fontSize: 12,
    color: C.error,
    textAlign: 'center',
  },

  // Sections (shared layout)
  section: {
    gap: 8,
  },

  // Day groups
  dayGroup: {
    gap: 8,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.onSurfaceVariant,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 4,
  },

  // Block card
  blockCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.surfaceContainerLow,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    overflow: 'hidden',
  },
  blockAccent: {
    width: 4,
    borderRadius: 2,
  },
  blockTimeCol: {
    width: 56,
    justifyContent: 'center',
    gap: 2,
  },
  blockTime: {
    fontSize: 12,
    fontWeight: '700',
    color: C.onSurface,
    letterSpacing: 0.2,
  },
  blockDuration: {
    fontSize: 10,
    color: C.onSurfaceVariant,
  },
  blockBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 6,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.onSurface,
    lineHeight: 20,
  },
  blockMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  blockMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  blockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  blockMetaText: {
    fontSize: 11,
    color: C.onSurfaceVariant,
    letterSpacing: 0.4,
  },
});
