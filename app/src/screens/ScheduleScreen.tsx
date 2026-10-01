// Owner: Person B — renders proposed time blocks from scheduling/scheduler.ts.
//
// Reads schedule_blocks/events from SQLite and joins blocks to their assignment
// for title + urgency. Layout follows DESIGN.md and reuses the shared design
// system (src/theme.ts + src/components/) so it matches HomeScreen exactly.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { Badge } from '../components/Badge';
import { BottomNav } from '../components/BottomNav';
import { EmptyState } from '../components/EmptyState';
import { EventTimeline } from '../components/EventTimeline';
import { SectionHeader } from '../components/SectionHeader';
import {
  type Assignment,
  type Event as CalEvent,
  type ScheduleBlock,
  getAllAssignments,
  getAllScheduleBlocks,
  getUpcomingEvents,
} from '../db/queries';
import { schemaReady } from '../db/schema';
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
}: {
  blockCount: number;
  plannedMinutes: number;
  nextLabel: string | null;
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

      <Pressable style={styles.ctaButton}>
        <Text style={styles.ctaIcon}>🔁</Text>
        <Text style={styles.ctaText}>Re-run Scheduler</Text>
      </Pressable>
    </View>
  );
}

function BlockCard({
  block,
  assignment,
}: {
  block: ScheduleBlock;
  assignment?: Assignment;
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
              Est. {durationEstimate(assignment.suggested_minutes)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function DayGroup({
  label,
  blocks,
  assignmentsById,
}: {
  label: string;
  blocks: ScheduleBlock[];
  assignmentsById: Map<string, Assignment>;
}) {
  return (
    <View style={styles.dayGroup}>
      <Text style={styles.dayLabel}>{label}</Text>
      {blocks.map((block) => (
        <BlockCard
          key={block.id}
          block={block}
          assignment={assignmentsById.get(block.assignment_id)}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function ScheduleScreen() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [assignmentsById, setAssignmentsById] = useState<Map<string, Assignment>>(
    new Map(),
  );
  const [nextLabel, setNextLabel] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await schemaReady;
        const [b, e, a] = await Promise.all([
          getAllScheduleBlocks(),
          getUpcomingEvents(),
          getAllAssignments(),
        ]);
        if (!active) return;
        setBlocks(b);
        setEvents(e);
        setAssignmentsById(
          new Map(a.map((assignment) => [assignment.id, assignment])),
        );

        // "Now" is read here (not during render) to keep the component pure.
        const now = Date.now();
        const next =
          b.find((block) => new Date(block.end_at).getTime() >= now) ?? null;
        setNextLabel(
          next ? `${dayLabel(next.start_at)} ${formatTime(next.start_at)}` : null,
        );
      } catch (err) {
        console.warn('[ScheduleScreen] Failed to load data:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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
      <AppHeader subtitle="Study Schedule" />

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
        />

        {/* Proposed study blocks */}
        <View style={styles.section}>
          <SectionHeader
            icon="🧩"
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
              />
            ))
          )}
        </View>

        {/* Today's calendar */}
        <View style={styles.section}>
          <SectionHeader
            icon="📅"
            title="Today's Calendar"
            right={<Badge tone="secondary" label="GCal Offline Sync" />}
          />
          <EventTimeline
            events={todayEvents}
            emptyText="No calendar events synced for today."
          />
        </View>
      </ScrollView>

      <BottomNav active="Schedule" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles (screen-specific — shared tokens/components live in src/theme.ts and
// src/components/)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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

import { useCallback, useEffect, useState } from 'react';
import { Button, FlatList, RefreshControl, Text, View } from 'react-native';

import { getUpcomingScheduleBlocks, type ScheduleBlockWithAssignment } from '../db/queries';
import { buildProposedSchedule, commitProposedSchedule } from '../scheduling/scheduler';

export function ScheduleScreen() {
  const [blocks, setBlocks] = useState<ScheduleBlockWithAssignment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromDb = useCallback(async () => {
    setBlocks(await getUpcomingScheduleBlocks());
  }, []);

  useEffect(() => {
    let cancelled = false;
    getUpcomingScheduleBlocks().then((rows) => {
      if (!cancelled) setBlocks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onGenerate = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const proposed = await buildProposedSchedule();
      await commitProposedSchedule(proposed);
      await loadFromDb();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [loadFromDb]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12 }}>
        <Button title="Schedule study time" onPress={onGenerate} disabled={refreshing} />
      </View>
      {error && <Text style={{ color: 'red', padding: 8 }}>{error}</Text>}
      <FlatList
        style={{ flex: 1 }}
        data={blocks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadFromDb} />}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>{item.assignment_title}</Text>
            <Text>
              {new Date(item.start_at).toLocaleString()} - {new Date(item.end_at).toLocaleTimeString()}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ padding: 16 }}>No study blocks yet — tap &ldquo;Schedule study time&rdquo; to generate some.</Text>
        }
      />
    </View>
  );
}
