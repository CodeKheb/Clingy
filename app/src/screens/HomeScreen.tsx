// Renders assignments/events from SQLite, works offline.
//
// Layout: a greeting with the week at a glance, today's study sessions, the one task to
// start next (with progress), then a compact list of what's coming up. Shared pieces
// (tokens, header, bottom nav, section headers, badges) come from src/components/ and
// ./utils/theme so it stays identical to the Schedule screen.

import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '../components/AppHeader';
import { Badge } from '../components/Badge';
import { BottomNav } from '../components/BottomNav';
import { ClingFace } from '../components/ClingFace';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import {
  type Assignment,
  dismissAssignment,
  getUpcomingAssignments,
  getUpcomingScheduleBlocks,
  type ScheduleBlockWithAssignment,
} from '../db/queries';
import { schemaReady } from '../db/schema';
import { sessionLabels, type TaskType } from '../priority/taskProfile';
import { getDoneMinutes } from '../scheduling/scheduler';
import { dayLabel, dueLabel, durationEstimate, durationLabel, formatTime } from './utils/format';
import { C, urgencyColor, urgencyLabel } from './utils/theme';

const TYPE_META: Record<TaskType, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  exam: { label: 'Exam', icon: 'school-outline' },
  project: { label: 'Project', icon: 'construct-outline' },
  writing: { label: 'Writing', icon: 'create-outline' },
  problemset: { label: 'Problem set', icon: 'calculator-outline' },
  reading: { label: 'Reading', icon: 'book-outline' },
  admin: { label: 'Quick task', icon: 'checkbox-outline' },
  general: { label: 'Task', icon: 'document-text-outline' },
};

const typeOf = (a: Assignment) => TYPE_META[(a.task_type as TaskType) in TYPE_META ? (a.task_type as TaskType) : 'general'];

/** Text color for an urgency score (the accent bars use urgencyColor, which is tuned for fills). */
function urgencyText(score: number): string {
  if (score >= 0.8) return C.error;
  if (score >= 0.5) return C.primary;
  if (score >= 0.3) return C.tertiary;
  return C.onSurfaceVariant;
}

function confirmDismiss(assignment: Assignment, onDismiss: (id: string) => void) {
  Alert.alert(assignment.title, 'Hide this task? It stays hidden even after syncing.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Dismiss task', style: 'destructive', onPress: () => onDismiss(assignment.id) },
  ]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.statTile}>
      <Ionicons name={icon} size={16} color={C.primary} />
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function GreetingCard({
  greeting,
  dueThisWeek,
  todayMinutes,
  doneMinutes,
  nextSession,
}: {
  greeting: string;
  dueThisWeek: number;
  todayMinutes: number;
  doneMinutes: number;
  nextSession: string | null;
}) {
  return (
    <View style={styles.greetingCard}>
      <View style={styles.greetingTop}>
        <ClingFace size={64} borderWidth={2} />
        <View style={styles.greetingText}>
          <Text style={styles.greetingHello}>{greeting}</Text>
          <Text style={styles.greetingHeadline}>
            {dueThisWeek === 0 ? 'Nothing due this week' : dueThisWeek === 1 ? '1 task due this week' : `${dueThisWeek} tasks due this week`}
          </Text>
          <Text style={styles.greetingSub} numberOfLines={1}>
            {nextSession ? `Next study session: ${nextSession}` : 'No study sessions planned yet'}
          </Text>
        </View>
      </View>
      <View style={styles.statRow}>
        <StatTile icon="alarm-outline" value={String(dueThisWeek)} label="Due this week" />
        <StatTile icon="time-outline" value={durationEstimate(todayMinutes)} label="Study today" />
        <StatTile icon="checkmark-done-outline" value={durationEstimate(doneMinutes)} label="Done so far" />
      </View>
    </View>
  );
}

function TodayPlan({
  blocks,
  labels,
  onOpenSchedule,
}: {
  blocks: ScheduleBlockWithAssignment[];
  labels: Map<string, string>;
  onOpenSchedule?: () => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader
        icon="today-outline"
        title="Today's plan"
        right={
          onOpenSchedule ? (
            <Pressable onPress={onOpenSchedule} hitSlop={8}>
              <Text style={styles.link}>Schedule</Text>
            </Pressable>
          ) : undefined
        }
      />
      {blocks.length === 0 ? (
        <EmptyState text="No study sessions left today. Ask Cling to plan some." />
      ) : (
        <View style={styles.planCard}>
          {blocks.map((b, i) => (
            <Pressable key={b.id} onPress={onOpenSchedule} style={[styles.planRow, i > 0 && styles.planRowBorder]}>
              <View style={styles.planTime}>
                <Text style={styles.planTimeText}>{formatTime(b.start_at)}</Text>
                <Text style={styles.planDuration}>{durationLabel(b.start_at, b.end_at)}</Text>
              </View>
              <View style={styles.planBody}>
                {labels.get(b.id) ? <Text style={styles.planLabel}>{labels.get(b.id)}</Text> : null}
                <Text style={styles.planTitle} numberOfLines={1}>
                  {b.assignment_title}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.onSurfaceVariant} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function HeroTaskCard({
  assignment,
  doneMinutes,
  onDismiss,
}: {
  assignment: Assignment;
  doneMinutes: number;
  onDismiss: (id: string) => void;
}) {
  const meta = typeOf(assignment);
  const total = assignment.suggested_minutes;
  const progress = total > 0 ? Math.min(1, doneMinutes / total) : 0;

  return (
    <View style={styles.heroCard}>
      <View style={[styles.heroAccent, { backgroundColor: urgencyColor(assignment.urgency_score) }]} />
      <View style={styles.heroTop}>
        <View style={styles.heroBadges}>
          <Badge tone="neutral" label={meta.label} icon={undefined} />
          <Text style={[styles.heroUrgency, { color: urgencyText(assignment.urgency_score) }]}>
            {urgencyLabel(assignment.urgency_score)}
          </Text>
        </View>
        <Pressable
          style={styles.moreButton}
          onPress={() => confirmDismiss(assignment, onDismiss)}
          hitSlop={8}
          accessibilityLabel="Task options"
        >
          <Ionicons name="ellipsis-vertical" size={18} color={C.onSurfaceVariant} />
        </Pressable>
      </View>

      <Text style={styles.heroTitle} numberOfLines={3}>
        {assignment.title}
      </Text>

      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Ionicons name="calendar-outline" size={16} color={C.primary} />
          <View>
            <Text style={styles.heroStatLabel}>DUE</Text>
            <Text style={styles.heroStatValue}>{dueLabel(assignment.due_at)}</Text>
          </View>
        </View>
        <View style={styles.heroStat}>
          <Ionicons name="hourglass-outline" size={16} color={C.primary} />
          <View>
            <Text style={styles.heroStatLabel}>TIME NEEDED</Text>
            <Text style={styles.heroStatValue}>{durationEstimate(total)}</Text>
          </View>
        </View>
      </View>

      {total > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {doneMinutes > 0 ? `${durationEstimate(doneMinutes)} of ${durationEstimate(total)} done` : 'Not started yet'}
          </Text>
        </View>
      )}

    </View>
  );
}

function UpcomingRow({ assignment, onDismiss }: { assignment: Assignment; onDismiss: (id: string) => void }) {
  const meta = typeOf(assignment);
  return (
    <View style={styles.upRow}>
      <View style={[styles.upBar, { backgroundColor: urgencyColor(assignment.urgency_score) }]} />
      <View style={styles.upIcon}>
        <Ionicons name={meta.icon} size={18} color={C.primary} />
      </View>
      <View style={styles.upBody}>
        <Text style={styles.upTitle} numberOfLines={1}>
          {assignment.title}
        </Text>
        <Text style={styles.upMeta} numberOfLines={1}>
          {dueLabel(assignment.due_at)}  ·  {meta.label}
          {assignment.suggested_minutes > 0 ? `  ·  ~${durationEstimate(assignment.suggested_minutes)}` : ''}
        </Text>
      </View>
      <Pressable onPress={() => confirmDismiss(assignment, onDismiss)} hitSlop={8} accessibilityLabel="Task options">
        <Ionicons name="ellipsis-vertical" size={18} color={C.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function describeSync({ at, offline }: { at: string | null; offline: boolean }): string {
  if (!at) return offline ? 'Offline' : 'Not synced yet';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
  const ago = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  return offline ? `Offline, saved ${ago}` : `Synced ${ago}`;
}

export type HomeScreenProps = {
  onSelectTab?: (tab: import('../components/BottomNav').NavTab) => void;
  onSignOut?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  syncStatus?: { at: string | null; offline: boolean };
};

export function HomeScreen({ onSelectTab, onSignOut, refreshing = false, onRefresh, syncStatus }: HomeScreenProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [todayBlocks, setTodayBlocks] = useState<ScheduleBlockWithAssignment[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [doneByAssignment, setDoneByAssignment] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState({ greeting: 'Hello', dueThisWeek: 0, nextSession: null as string | null });

  const loadFromDb = useCallback(async () => {
    await schemaReady;
    const [a, blocks, done] = await Promise.all([getUpcomingAssignments(), getUpcomingScheduleBlocks(), getDoneMinutes()]);
    setAssignments(a);
    setDoneByAssignment(done);

    // Time-dependent values are computed here, not in render, so Date.now() is never read during render.
    const now = new Date();
    const hour = now.getHours();
    const cutoff = now.getTime() + 7 * 24 * 60 * 60 * 1000;
    const types = new Map(a.map((x) => [x.id, x.task_type as TaskType]));
    setLabels(sessionLabels(blocks, types));
    setTodayBlocks(blocks.filter((b) => new Date(b.start_at).toDateString() === now.toDateString()).slice(0, 4));
    setSummary({
      greeting: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
      dueThisWeek: a.filter((x) => x.due_at && new Date(x.due_at).getTime() <= cutoff).length,
      nextSession: blocks[0] ? `${dayLabel(blocks[0].start_at)}, ${formatTime(blocks[0].start_at)}` : null,
    });
  }, []);

  const onDismissAssignment = useCallback(
    async (id: string) => {
      try {
        await dismissAssignment(id);
        await loadFromDb();
      } catch (err) {
        console.warn('[HomeScreen] Failed to dismiss assignment:', err);
      }
    },
    [loadFromDb],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await loadFromDb();
      } catch (err) {
        if (active) console.warn('[HomeScreen] Failed to load data:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadFromDb]);

  const hero = assignments[0] ?? null;
  const upcoming = assignments.slice(1, 6);
  const todayMinutes = todayBlocks.reduce((sum, b) => sum + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000, 0);
  const totalDone = Object.values(doneByAssignment).reduce((sum, m) => sum + m, 0);
  const openSchedule = onSelectTab ? () => onSelectTab('Schedule') : undefined;

  return (
    <View style={styles.root}>
      <AppHeader subtitle={syncStatus ? describeSync(syncStatus) : 'Home'} syncing={refreshing} onSignOut={onSignOut} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} /> : undefined}
      >
        <GreetingCard
          greeting={summary.greeting}
          dueThisWeek={summary.dueThisWeek}
          todayMinutes={Math.round(todayMinutes)}
          doneMinutes={totalDone}
          nextSession={summary.nextSession}
        />

        <TodayPlan blocks={todayBlocks} labels={labels} onOpenSchedule={openSchedule} />

        <View style={styles.section}>
          <SectionHeader icon="flash-outline" title="Up next" />
          {hero ? (
            <HeroTaskCard
              assignment={hero}
              doneMinutes={doneByAssignment[hero.id] ?? 0}
              onDismiss={onDismissAssignment}
            />
          ) : (
            <EmptyState text="No assignments synced yet. Pull down to sync Google Classroom." />
          )}
        </View>

        {upcoming.length > 0 && (
          <View style={styles.section}>
            <SectionHeader icon="list-outline" title="Coming up" />
            <View style={styles.upList}>
              {upcoming.map((a) => (
                <UpcomingRow key={a.id} assignment={a} onDismiss={onDismissAssignment} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <BottomNav active="Home" onSelectTab={onSelectTab} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles (screen-specific — shared tokens/components live in ./utils/theme and
// src/components/)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  scrollView: { flex: 1, marginTop: 64, marginBottom: 80 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 22 },
  section: { gap: 12 },
  link: { fontSize: 13, fontWeight: '600', color: C.primary },

  // Greeting
  greetingCard: {
    borderRadius: 24,
    backgroundColor: C.surfaceContainer,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    padding: 16,
    gap: 16,
  },
  greetingTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  greetingText: { flex: 1, gap: 2 },
  greetingHello: { fontSize: 13, fontWeight: '600', color: C.primary },
  greetingHeadline: { fontSize: 19, fontWeight: '700', color: C.onSurface },
  greetingSub: { fontSize: 12.5, color: C.onSurfaceVariant },
  statRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
    padding: 10,
    borderRadius: 14,
    backgroundColor: C.surfaceContainerLowest,
  },
  statValue: { fontSize: 17, fontWeight: '700', color: C.onSurface, marginTop: 2 },
  statLabel: { fontSize: 11, color: C.onSurfaceVariant },

  // Today's plan
  planCard: { borderRadius: 20, backgroundColor: C.surfaceContainer, overflow: 'hidden' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  planRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.outlineVariant },
  planTime: { width: 64 },
  planTimeText: { fontSize: 13, fontWeight: '700', color: C.onSurface },
  planDuration: { fontSize: 11, color: C.onSurfaceVariant, marginTop: 1 },
  planBody: { flex: 1 },
  planLabel: { fontSize: 11, fontWeight: '700', color: C.secondary, marginBottom: 1 },
  planTitle: { fontSize: 14, fontWeight: '600', color: C.onSurface },

  // Hero task
  heroCard: {
    borderRadius: 24,
    backgroundColor: C.surfaceContainer,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    padding: 16,
    paddingTop: 18,
    gap: 14,
    overflow: 'hidden',
  },
  heroAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBadges: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroUrgency: { fontSize: 12, fontWeight: '700' },
  moreButton: { padding: 4 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: C.onSurface, lineHeight: 26 },
  heroStats: { flexDirection: 'row', gap: 10 },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.surfaceContainerLowest,
  },
  heroStatLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: C.onSurfaceVariant },
  heroStatValue: { fontSize: 15, fontWeight: '700', color: C.onSurface, marginTop: 1 },
  progressWrap: { gap: 6 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.surfaceContainerHighest, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: C.secondary },
  progressText: { fontSize: 12, color: C.onSurfaceVariant },

  // Coming up
  upList: { gap: 8 },
  upRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 0,
    borderRadius: 18,
    backgroundColor: C.surfaceContainer,
    overflow: 'hidden',
  },
  upBar: { width: 4, alignSelf: 'stretch' },
  upIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upBody: { flex: 1 },
  upTitle: { fontSize: 14, fontWeight: '600', color: C.onSurface },
  upMeta: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
});
