// Owner: Person B — renders assignments/events from SQLite, works offline.
//
// Layout follows DESIGN.md: screen-specific pieces live here, while the shared
// design system (tokens, header, bottom nav, section headers, badges, timeline)
// comes from src/theme.ts and src/components/ so it stays identical to the
// Schedule screen.

import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import {
  type Assignment,
  dismissAssignment,
  getUpcomingAssignments,
} from '../db/queries';
import { schemaReady } from '../db/schema';
import { C } from './utils/theme';
import { dueLabel, durationEstimate } from './utils/format';

// ---------------------------------------------------------------------------
// Mascot image URI (same as the prototype)
// ---------------------------------------------------------------------------

const MASCOT_GREETING =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAuIQJRjaMKnlJ4foJqyoYXkPPNZqZ0VwJZ8sBI_cfOp1h3zK0VcPE6L-yAL5yG7ptv93fxOoEtqo9E37K6JcDcLmXga2Z-HMHbvaP63hpcVKsdf3LhgL2MBL41IHUUDiwHUB-JYYkBJlP85_3xisINRc2U_zmeyOnjXAAVE7sgzGwRehuiHcu6g6MSFl4aAQPS_xE_UpqFXkyDLlGzqYrowWRJAV8rGRM8ZMr665PG5zOv8K9lKT2gwVMmzh0f1xrj1g';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GreetingCard({ dueThisWeek }: { dueThisWeek: number }) {
  return (
    <View style={styles.greetingCard}>
      {/* Decorative glow */}
      <View style={styles.greetingGlow} />

      <View style={styles.greetingBody}>
        {/* Mascot */}
        <View style={styles.greetingAvatarWrap}>
          <View style={styles.greetingAvatarCircle}>
            <Image
              source={{ uri: MASCOT_GREETING }}
              style={styles.greetingAvatarImg}
            />
          </View>
          <View style={styles.greetingOnlineDot} />
        </View>

        {/* One honest line, computed from real data */}
        <View style={styles.greetingTextWrap}>
          <Text style={styles.greetingDesc}>
            {dueThisWeek > 0
              ? `${dueThisWeek} task${dueThisWeek !== 1 ? 's' : ''} due this week.`
              : 'No tasks due this week.'}
          </Text>
        </View>
      </View>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeroTaskCard({
  assignment,
  onStartTask,
  onDismiss,
}: {
  assignment: Assignment;
  onStartTask?: () => void;
  onDismiss?: (id: string) => void;
}) {
  const handleMorePress = () => {
    if (!onDismiss) return;
    Alert.alert(assignment.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss task',
        style: 'destructive',
        onPress: () => onDismiss(assignment.id),
      },
    ]);
  };

  return (
    <View style={styles.heroCard}>
      {/* Header row */}
      <View style={styles.heroHeaderRow}>
        <View style={styles.heroHeaderLeft}>
          <Text style={styles.heroTitle}>{assignment.title}</Text>
        </View>
        <Pressable style={styles.heroMoreBtn} onPress={handleMorePress}>
          <Text style={styles.heroMoreIcon}>⋮</Text>
        </Pressable>
      </View>

      {/* Detail pills */}
      <View style={styles.heroPillGrid}>
        <View style={styles.heroPill}>
          <Text style={styles.heroPillIcon}>⏱</Text>
          <View>
            <Text style={styles.heroPillLabel}>EST. DURATION</Text>
            <Text style={styles.heroPillValue}>
              {durationEstimate(assignment.suggested_minutes)}
            </Text>
          </View>
        </View>
        <View style={styles.heroPill}>
          <Text style={styles.heroPillIcon}>📆</Text>
          <View>
            <Text style={styles.heroPillLabel}>DEADLINE</Text>
            <Text style={styles.heroPillValue}>{dueLabel(assignment.due_at)}</Text>
          </View>
        </View>
      </View>

      {/* Suggestion tip */}
      {assignment.description ? (
        <View style={styles.suggestionTip}>
          <Text style={styles.suggestionIcon}>💡</Text>
          <Text style={styles.suggestionText} numberOfLines={2}>
            {assignment.description}
          </Text>
        </View>
      ) : null}

      {/* CTA */}
      <Pressable style={styles.ctaButton} onPress={onStartTask}>
        <Text style={styles.ctaIcon}>🎯</Text>
        <Text style={styles.ctaText}>Start Task</Text>
      </Pressable>
    </View>
  );
}

function SecondaryTaskCard({
  assignment,
}: {
  assignment: Assignment;
}) {
  return (
    <View style={styles.secondaryCard}>
      <View style={styles.secondaryHeaderRow}>
        <View style={styles.secondaryHeaderLeft}>
          <Text style={styles.secondaryDueLabel}>
            {dueLabel(assignment.due_at)}
          </Text>
          <Text style={styles.secondaryTitle}>{assignment.title}</Text>
        </View>
      </View>

      {assignment.description ? (
        <View style={styles.secondaryFooter}>
          <Text style={styles.secondaryDesc} numberOfLines={1}>
            {assignment.description}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AIPriorityQueue({
  assignments,
  onStartTask,
  onDismiss,
}: {
  assignments: Assignment[];
  onStartTask?: () => void;
  onDismiss?: (id: string) => void;
}) {
  const hero = assignments[0] ?? null;
  const rest = assignments.slice(1, 4); // show up to 3 more

  return (
    <View style={styles.section}>
      <SectionHeader icon="sparkles" title="AI Priority Queue" />

      {/* Hero task */}
      {hero ? (
        <HeroTaskCard assignment={hero} onStartTask={onStartTask} onDismiss={onDismiss} />
      ) : (
        <EmptyState text="No assignments synced yet. Sync Google Classroom to see your priority queue." />
      )}

      {/* Secondary tasks */}
      {rest.map((a) => (
        <SecondaryTaskCard key={a.id} assignment={a} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

function describeSync({ at, offline }: { at: string | null; offline: boolean }): string {
  if (!at) return offline ? 'Offline' : 'Not synced yet';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
  const ago = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  return offline ? `Offline, saved ${ago}` : `Synced ${ago}`;
}

export type HomeScreenProps = {
  onSelectTab?: (tab: import('../components/BottomNav').NavTab) => void;
  onSignOut?: () => void;
  onStartTask?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  syncStatus?: { at: string | null; offline: boolean };
};

export function HomeScreen({ onSelectTab, onSignOut, onStartTask, refreshing = false, onRefresh, syncStatus }: HomeScreenProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dueThisWeek, setDueThisWeek] = useState(0);

  const loadFromDb = useCallback(async () => {
    await schemaReady;
    const [a] = await Promise.all([getUpcomingAssignments()]);
    setAssignments(a);
    // Honest count for the greeting: everything due within the next 7 days
    // (overdue included — it's still due). Computed here rather than in render
    // so Date.now() is never called during render (react-hooks/purity).
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() + weekMs;
    setDueThisWeek(
      a.filter((x) => x.due_at && new Date(x.due_at).getTime() <= cutoff).length,
    );
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

  return (
    <View style={styles.root}>
      <AppHeader subtitle={syncStatus ? `Home Dashboard · ${describeSync(syncStatus)}` : 'Home Dashboard'} onSignOut={onSignOut} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {/* Greeting card */}
        <GreetingCard dueThisWeek={dueThisWeek} />

        {/* AI priority queue */}
        <AIPriorityQueue
          assignments={assignments}
          onStartTask={onStartTask}
          onDismiss={onDismissAssignment}
        />
      </ScrollView>

      <BottomNav active="Home" onSelectTab={onSelectTab} />
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

  // Greeting Card
  greetingCard: {
    borderRadius: 16,
    backgroundColor: C.surfaceContainer,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    padding: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  greetingGlow: {
    position: 'absolute',
    right: -32,
    bottom: -32,
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: C.primaryContainer + '33',
  },
  greetingBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  greetingAvatarWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  greetingAvatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.surfaceContainerHighest,
    borderWidth: 2,
    borderColor: C.primaryContainer + '66',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  greetingAvatarImg: {
    width: 56,
    height: 56,
  },
  greetingOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.secondary,
    borderWidth: 2,
    borderColor: C.surfaceContainer,
  },
  greetingTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  greetingDesc: {
    fontSize: 14,
    color: C.onSurfaceVariant,
    marginTop: 4,
    lineHeight: 20,
  },

  // Sections (shared layout)
  section: {
    gap: 8,
  },

  // Hero card
  heroCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: C.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: C.primaryContainer + '4D',
    gap: 8,
    overflow: 'hidden',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.onSurface,
    marginTop: 4,
    lineHeight: 28,
  },
  heroMoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.outlineVariant + '4D',
    flexShrink: 0,
  },
  heroMoreIcon: {
    fontSize: 20,
    color: C.onSurfaceVariant,
  },

  // Hero pill grid
  heroPillGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  heroPill: {
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
  heroPillIcon: {
    fontSize: 16,
  },
  heroPillLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.onSurfaceVariant,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroPillValue: {
    fontSize: 12,
    fontWeight: '600',
    color: C.onSurface,
    letterSpacing: 0.2,
  },

  // Suggestion tip
  suggestionTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: C.surfaceContainerLowest + 'E6',
    borderWidth: 1,
    borderColor: C.surfaceContainerHighest + '99',
  },
  suggestionIcon: {
    fontSize: 16,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: C.onSurfaceVariant,
    lineHeight: 18,
  },

  // CTA
  ctaButton: {
    height: 48,
    borderRadius: 999,
    backgroundColor: C.primaryContainer,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaIcon: {
    fontSize: 18,
    color: C.white,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.1,
  },

  // Secondary card
  secondaryCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: C.surfaceContainerLow,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    gap: 8,
  },
  secondaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  secondaryHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  secondaryDueLabel: {
    fontSize: 11,
    color: C.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  secondaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.onSurface,
    marginTop: 4,
  },
  secondaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  secondaryDesc: {
    flex: 1,
    fontSize: 12,
    color: C.onSurfaceVariant,
  },
});
