// Owner: Person C — the conversational panel opened by tapping the Cling
// overlay bubble (or the in-app floating fallback). No free text input from
// the user: Cling "says" a line, the user taps one of a few canned replies.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ClingSprite } from '../pet/ClingSprite';
import {
  CONVERSATION,
  ROOT_NODE_ID,
  resolveEntryNode,
  resolveNodeEffects,
  type ConversationSideEffectResult,
} from '../pet/clingConversation';
import { C } from './utils/theme';

type Turn = {
  clingSays: string;
  extra?: ConversationSideEffectResult;
};

export type ClingPanelProps = {
  onClose?: () => void;
};

export function ClingPanel({ onClose }: ClingPanelProps) {
  const [nodeId, setNodeId] = useState(ROOT_NODE_ID);
  const [turnCount, setTurnCount] = useState(0); // bumped on every selection, including re-selecting the same node
  const [history, setHistory] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const resolvedId = await resolveEntryNode(nodeId);
      const extra = await resolveNodeEffects(resolvedId);
      if (cancelled) return;
      const node = CONVERSATION[resolvedId];
      setHistory((prev) => [...prev, { clingSays: node.clingSays, extra }]);
      if (resolvedId !== nodeId) {
        setNodeId(resolvedId);
      } else {
        setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [nodeId, turnCount]);

  function selectOption(nextNodeId: string) {
    setLoading(true);
    setNodeId(nextNodeId);
    setTurnCount((c) => c + 1);
  }

  const currentNode = CONVERSATION[nodeId];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ClingSprite animation="idle" scale={0.5} />
        <Text style={styles.headerTitle}>Cling</Text>
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={C.onSurfaceVariant} />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.chatArea} contentContainerStyle={styles.chatContent}>
        {history.map((turn, i) => (
          <View key={i} style={styles.bubble}>
            <Text style={styles.bubbleText}>{turn.clingSays}</Text>
            {turn.extra?.assignmentSummary?.map((title) => (
              <Text key={title} style={styles.taskLine}>
                • {title}
              </Text>
            ))}
            {turn.extra?.proposedBlocks && (
              <Text style={styles.taskLine}>{turn.extra.proposedBlocks.length} study blocks scheduled.</Text>
            )}
          </View>
        ))}
        {loading && <ActivityIndicator style={styles.loading} />}
      </ScrollView>

      {!loading && (
        <View style={styles.options}>
          {currentNode.options.map((option) => (
            <Pressable
              key={option.label}
              style={styles.optionButton}
              onPress={() => selectOption(option.next)}
            >
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.surfaceContainerHigh,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: C.onSurface,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    gap: 8,
  },
  bubble: {
    backgroundColor: C.surfaceContainerHigh,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 12,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  bubbleText: {
    fontSize: 15,
    color: C.onSurface,
    lineHeight: 21,
  },
  taskLine: {
    fontSize: 13,
    color: C.onSurfaceVariant,
    marginTop: 4,
    lineHeight: 18,
  },
  loading: {
    marginTop: 8,
    color: C.primary,
  },
  options: {
    padding: 16,
    paddingBottom: 24,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.surfaceContainerHigh,
  },
  optionButton: {
    backgroundColor: C.primaryContainer,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  optionText: {
    color: C.white,
    fontWeight: '600',
    fontSize: 15,
  },
});
