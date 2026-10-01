// Owner: Person B — renders proposed time blocks from scheduling/scheduler.ts.

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
