// Owner: Person B — renders assignments/events from SQLite, works offline.
// TODO(Person B): design the actual screen. This is just the wiring:
// pull_to_refresh calls syncNow(), list renders getUpcomingAssignments().

import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { type Assignment, getUpcomingAssignments } from '../db/queries';
import { syncNow } from '../sync/syncService';

export function HomeScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromDb = useCallback(async () => {
    setAssignments(await getUpcomingAssignments());
  }, []);

  useEffect(() => {
    let cancelled = false;
    getUpcomingAssignments().then((rows) => {
      if (!cancelled) setAssignments(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const result = await syncNow();
    if (!result.ok) setError(result.error);
    await loadFromDb();
    setRefreshing(false);
  }, [loadFromDb]);

  return (
    <View style={{ flex: 1 }}>
      {error && <Text style={{ color: 'red', padding: 8 }}>{error}</Text>}
      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>{item.title}</Text>
            <Text>{item.due_at ? new Date(item.due_at).toLocaleString() : 'No due date'}</Text>
            <Text>urgency: {item.urgency_score.toFixed(2)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ padding: 16 }}>Pull to sync your assignments.</Text>}
      />
    </View>
  );
}
