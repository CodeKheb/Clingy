// Owner: Person B — renders assignments/events from SQLite, works offline.
//
// Layout follows DESIGN.md: screen-specific pieces live here, while the shared
// design system (tokens, header, bottom nav, section headers, badges, timeline)
// comes from src/theme.ts and src/components/ so it stays identical to the
// Schedule screen.

import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { Badge } from '../components/Badge';
import { BottomNav } from '../components/BottomNav';
import { EmptyState } from '../components/EmptyState';
import { EventTimeline } from '../components/EventTimeline';
import { SectionHeader } from '../components/SectionHeader';
import {
  type Assignment,
  type Event as CalEvent,
  getUpcomingAssignments,
  getUpcomingEvents,
} from '../db/queries';
import { schemaReady } from '../db/schema';
import { C, urgencyColor, urgencyLabel } from './utils/theme';
import { dueLabel, durationEstimate } from './utils/format';

// ---------------------------------------------------------------------------
// Mascot image URI (same as the prototype)
// ---------------------------------------------------------------------------

const MASCOT_GREETING =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAuIQJRjaMKnlJ4foJqyoYXkPPNZqZ0VwJZ8sBI_cfOp1h3zK0VcPE6L-yAL5yG7ptv93fxOoEtqo9E37K6JcDcLmXga2Z-HMHbvaP63hpcVKsdf3LhgL2MBL41IHUUDiwHUB-JYYkBJlP85_3xisINRc2U_zmeyOnjXAAVE7sgzGwRehuiHcu6g6MSFl4aAQPS_xE_UpqFXkyDLlGzqYrowWRJAV8rGRM8ZMr665PG5zOv8K9lKT2gwVMmzh0f1xrj1g';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GreetingCard({ highPriorityCount }: { highPriorityCount: number }) {
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

        {/* Text */}
        <View style={styles.greetingTextWrap}>
          <View style={styles.greetingTitleRow}>
            <Text style={styles.greetingHey}>Hey Alex!</Text>
            <Badge tone="tertiary" label="Peak Focus Window" />
          </View>
          <Text style={styles.greetingDesc}>
            You have{' '}
            <Text style={styles.greetingBold}>
              {highPriorityCount} high-leverage task
              {highPriorityCount !== 1 ? 's' : ''}
            </Text>{' '}
            before 5 PM. Offline bio-rhythm shows optimal energy right now—ready
            to crush{' '}
            <Text style={styles.greetingPrimaryHighlight}>CS 106B</Text>?
          </Text>
        </View>
      </View>

      {/* Quick action chips */}
      <View style={styles.chipRow}>
        <Pressable style={styles.chipPrimary}>
          <Text style={styles.chipPrimaryIcon}>▶</Text>
          <Text style={styles.chipPrimaryText}>Start 25m Focus Block</Text>
        </Pressable>
        <Pressable style={styles.chipSecondary}>
          <Text style={styles.chipSecondaryIcon}>💤</Text>
          <Text style={styles.chipSecondaryText}>Snooze 15m</Text>
        </Pressable>
        <Pressable style={styles.chipTertiary}>
          <Text style={styles.chipTertiaryIcon}>☕</Text>
          <Text style={styles.chipTertiaryText}>Re-charge</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ScheduleTimeline({ events }: { events: CalEvent[] }) {
  return (
    <View style={styles.section}>
      <SectionHeader
        icon="📅"
        title="Today's Schedule Snapshot"
        right={<Badge tone="secondary" label="GCal Offline Sync" />}
      />
      <EventTimeline
        events={events}
        emptyText="No events synced yet. Sync your Google Calendar to see today's schedule."
      />
    </View>
  );
}

function HeroTaskCard({ assignment }: { assignment: Assignment }) {
  const progress = assignment.suggested_minutes > 0 ? 0.4 : 0; // placeholder
  const progressPct = Math.round(progress * 100);

  return (
    <View style={styles.heroCard}>
      {/* Header row */}
      <View style={styles.heroHeaderRow}>
        <View style={styles.heroHeaderLeft}>
          <View style={styles.heroRankRow}>
            <View
              style={[
                styles.heroRankBadge,
                { backgroundColor: urgencyColor(assignment.urgency_score) },
              ]}
            >
              <Text style={styles.heroRankBadgeIcon}>🚩</Text>
              <Text style={styles.heroRankBadgeText}>
                Rank #1 • {urgencyLabel(assignment.urgency_score)}
              </Text>
            </View>
            <Text style={styles.heroSourceLabel}>Google Classroom</Text>
          </View>
          <Text style={styles.heroTitle}>{assignment.title}</Text>
        </View>
        <Pressable style={styles.heroMoreBtn}>
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

      {/* Progress bar */}
      {progressPct > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressPct}>{progressPct}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progressPct}%` as any }]}
            />
          </View>
        </View>
      )}

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
      <Pressable style={styles.ctaButton}>
        <Text style={styles.ctaIcon}>🎯</Text>
        <Text style={styles.ctaText}>Start Task</Text>
      </Pressable>
    </View>
  );
}

function SecondaryTaskCard({
  assignment,
  rank,
}: {
  assignment: Assignment;
  rank: number;
}) {
  return (
    <View style={styles.secondaryCard}>
      <View style={styles.secondaryHeaderRow}>
        <View style={styles.secondaryHeaderLeft}>
          <View style={styles.secondaryRankRow}>
            <View style={styles.secondaryRankBadge}>
              <Text style={styles.secondaryRankText}>Rank #{rank}</Text>
            </View>
            <Text style={styles.secondaryDueLabel}>
              {dueLabel(assignment.due_at)}
            </Text>
          </View>
          <Text style={styles.secondaryTitle}>{assignment.title}</Text>
        </View>
        <Text style={styles.secondaryCachedIcon}>✅</Text>
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

function AIPriorityQueue({ assignments }: { assignments: Assignment[] }) {
  const hero = assignments[0] ?? null;
  const rest = assignments.slice(1, 4); // show up to 3 more

  return (
    <View style={styles.section}>
      <SectionHeader
        icon="🤖"
        title="AI Priority Queue"
        right={<Badge tone="primary" icon="🧠" label="Local Gemma-2B" />}
      />

      {/* Hero task */}
      {hero ? (
        <HeroTaskCard assignment={hero} />
      ) : (
        <EmptyState text="No assignments synced yet. Sync Google Classroom to see your priority queue." />
      )}

      {/* Secondary tasks */}
      {rest.map((a, i) => (
        <SecondaryTaskCard key={a.id} assignment={a} rank={i + 2} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function HomeScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await schemaReady;
        const [a, e] = await Promise.all([
          getUpcomingAssignments(),
          getUpcomingEvents(),
        ]);
        if (!active) return;
        setAssignments(a);
        setEvents(e);
      } catch (err) {
        console.warn('[HomeScreen] Failed to load data:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const highPriorityCount = assignments.filter(
    (a) => a.urgency_score >= 0.7,
  ).length;

  return (
    <View style={styles.root}>
      <AppHeader subtitle="Home Dashboard" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting card */}
        <GreetingCard highPriorityCount={highPriorityCount || 2} />

        {/* Schedule timeline */}
        <ScheduleTimeline events={events} />

        {/* AI priority queue */}
        <AIPriorityQueue assignments={assignments} />
      </ScrollView>

      <BottomNav active="Home" />
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
  greetingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  greetingHey: {
    fontSize: 18,
    fontWeight: '700',
    color: C.onSurface,
  },
  greetingDesc: {
    fontSize: 14,
    color: C.onSurfaceVariant,
    marginTop: 4,
    lineHeight: 20,
  },
  greetingBold: {
    color: C.onSurface,
    fontWeight: '600',
  },
  greetingPrimaryHighlight: {
    color: C.primary,
    fontWeight: '600',
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    flexWrap: 'wrap',
  },
  chipPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.primaryContainer,
  },
  chipPrimaryIcon: {
    fontSize: 14,
    color: C.white,
  },
  chipPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.white,
    letterSpacing: 0.2,
  },
  chipSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: C.outlineVariant + '4D',
  },
  chipSecondaryIcon: {
    fontSize: 12,
  },
  chipSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.onSurface,
    letterSpacing: 0.2,
  },
  chipTertiary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.tertiaryContainer + '4D',
    borderWidth: 1,
    borderColor: C.tertiary + '66',
  },
  chipTertiaryIcon: {
    fontSize: 12,
  },
  chipTertiaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.tertiary,
    letterSpacing: 0.2,
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
  heroRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroRankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
  },
  heroRankBadgeIcon: {
    fontSize: 12,
  },
  heroRankBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.onErrorContainer,
    letterSpacing: 0.4,
  },
  heroSourceLabel: {
    fontSize: 11,
    color: C.onSurfaceVariant,
    letterSpacing: 0.4,
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

  // Progress
  progressWrap: {
    gap: 4,
    marginTop: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: 0.4,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: C.surfaceContainerLowest,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.outlineVariant + '33',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: C.primaryContainer,
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
  secondaryRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryRankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: C.surfaceContainerHigh,
  },
  secondaryRankText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.onSurfaceVariant,
    letterSpacing: 0.4,
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
  secondaryCachedIcon: {
    fontSize: 18,
    flexShrink: 0,
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
