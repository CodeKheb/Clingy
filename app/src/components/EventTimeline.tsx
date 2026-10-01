// Shared calendar-event timeline (time column + accent bar + event card).
// Used by Home ("Today's Schedule Snapshot") and Schedule ("Today's Calendar")
// so the two screens render events identically.

import { StyleSheet, Text, View } from 'react-native';

import { C } from '../screens/utils/theme';
import { durationLabel, formatTime } from '../screens/utils/format';
import { EmptyState } from './EmptyState';

export type TimelineEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
};

export function EventTimeline({
  events,
  emptyText = 'No events synced yet.',
}: {
  events: TimelineEvent[];
  emptyText?: string;
}) {
  return (
    <View style={styles.timelineContainer}>
      {events.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        events.map((ev) => (
          <View key={ev.id} style={styles.timelineItem}>
            {/* Time column */}
            <View style={styles.timelineTimeCol}>
              <Text style={styles.timelineTime}>{formatTime(ev.start_at)}</Text>
              <Text style={styles.timelineDuration}>
                {durationLabel(ev.start_at, ev.end_at)}
              </Text>
            </View>
            {/* Vertical bar */}
            <View style={styles.timelineBar} />
            {/* Content */}
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle} numberOfLines={1}>
                {ev.title}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  timelineContainer: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.surfaceContainerLow,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh,
    gap: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  timelineTimeCol: {
    width: 52,
    alignItems: 'center',
    paddingTop: 2,
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: '700',
    color: C.onSurface,
    letterSpacing: 0.2,
  },
  timelineDuration: {
    fontSize: 10,
    color: C.onSurfaceVariant,
  },
  timelineBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: C.outlineVariant + '4D',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    borderRadius: 8,
    backgroundColor: C.surfaceContainer,
    borderWidth: 1,
    borderColor: C.surfaceContainerHigh + '80',
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.onSurface,
  },
});
