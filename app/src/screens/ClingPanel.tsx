// Owner: Person C — the conversational panel opened by tapping the Cling
// overlay bubble (or the in-app floating fallback). No free text input from
// the user: Cling "says" a line, the user taps one of a few canned replies.
// TODO: visual design pass — this is bare functional wiring.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ClingSprite } from '../pet/ClingSprite';
import {
  CONVERSATION,
  ROOT_NODE_ID,
  resolveEntryNode,
  resolveNodeEffects,
  type ConversationSideEffectResult,
} from '../pet/clingConversation';

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
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Text style={styles.closeButtonText}>Close</Text>
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
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    paddingTop: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  closeButtonText: {
    color: '#888',
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    gap: 8,
  },
  bubble: {
    backgroundColor: '#fff3e8',
    borderRadius: 12,
    padding: 12,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  bubbleText: {
    fontSize: 15,
  },
  taskLine: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  loading: {
    marginTop: 8,
  },
  options: {
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  optionButton: {
    backgroundColor: '#ff8c3b',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  optionText: {
    color: '#fff',
    fontWeight: '600',
  },
});
