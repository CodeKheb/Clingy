// Owner: Person C — the conversational panel opened by tapping the Cling
// overlay bubble (or the in-app floating fallback). No free text input from
// the user: Cling "says" a line, the user taps one of a few canned replies.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClingSprite } from '../pet/ClingSprite';
import {
  CONVERSATION,
  ROOT_NODE_ID,
  resolveEntryNode,
  resolveNodeEffects,
  type ConversationSideEffectResult,
} from '../pet/clingConversation';
import { C } from './utils/theme';

type Turn =
  | { role: 'cling'; clingSays: string; extra?: ConversationSideEffectResult }
  | { role: 'user'; text: string };

export type ClingPanelProps = {
  onClose?: () => void;
};

function ClingAvatar({ size, scale }: { size: number; scale: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <ClingSprite animation="idle" scale={scale} />
    </View>
  );
}

export function ClingPanel({ onClose }: ClingPanelProps) {
  const [nodeId, setNodeId] = useState(ROOT_NODE_ID);
  const [turnCount, setTurnCount] = useState(0); // bumped on every selection, including re-selecting the same node
  const [history, setHistory] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const busyRef = useRef(true); // true while Cling is "typing"; blocks a second press landing before the next render

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const resolvedId = await resolveEntryNode(nodeId);
      const extra = await resolveNodeEffects(resolvedId);
      if (cancelled) return;
      const node = CONVERSATION[resolvedId];
      setHistory((prev) => [...prev, { role: 'cling', clingSays: extra.clingSaysOverride ?? node.clingSays, extra }]);
      if (resolvedId !== nodeId) {
        setNodeId(resolvedId);
      } else {
        busyRef.current = false;
        setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [nodeId, turnCount]);

  function selectOption(label: string, nextNodeId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setHistory((prev) => [...prev, { role: 'user', text: label }]);
    setLoading(true);
    setNodeId(nextNodeId);
    setTurnCount((c) => c + 1);
  }

  const currentNode = CONVERSATION[nodeId];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <ClingAvatar size={52} scale={0.38} />
          <View style={styles.onlineDot} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Cling</Text>
          <Text style={styles.headerSubtitle}>Your study buddy</Text>
        </View>
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={C.onSurfaceVariant} />
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {history.map((turn, i) =>
          turn.role === 'user' ? (
            <View key={i} style={[styles.bubble, styles.userBubble]}>
              <Text style={styles.userBubbleText}>{turn.text}</Text>
            </View>
          ) : (
            <View key={i} style={styles.clingRow}>
              <ClingAvatar size={32} scale={0.2} />
              <View style={[styles.bubble, styles.clingBubble]}>
                <Text style={styles.bubbleText}>{turn.clingSays}</Text>
                {turn.extra?.assignmentSummary && (
                  <View style={styles.taskList}>
                    {turn.extra.assignmentSummary.map((title) => (
                      <View key={title} style={styles.taskRow}>
                        <View style={styles.taskDot} />
                        <Text style={styles.taskText} numberOfLines={2}>
                          {title}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {turn.extra?.proposedBlocks && (
                  <View style={styles.successChip}>
                    <Ionicons name="checkmark-circle" size={16} color={C.secondary} />
                    <Text style={styles.successText}>
                      {turn.extra.proposedBlocks.length} study blocks scheduled
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ),
        )}
        {loading && (
          <View style={styles.clingRow}>
            <ClingAvatar size={32} scale={0.2} />
            <View style={[styles.bubble, styles.clingBubble, styles.typingBubble]}>
              <ActivityIndicator size="small" color={C.primary} />
            </View>
          </View>
        )}
      </ScrollView>

      {!loading && (
        <View style={[styles.options, { paddingBottom: 20 + insets.bottom }]}>
          {currentNode.options.map((option) => (
            <Pressable
              key={option.label}
              style={({ pressed }) => [styles.optionChip, pressed && styles.optionChipPressed]}
              onPress={() => selectOption(option.label, option.next)}
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
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surfaceContainerLow,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.outlineVariant,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.onSurface },
  headerSubtitle: { fontSize: 12, color: C.onSurfaceVariant, marginTop: 1 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    backgroundColor: C.surfaceContainerHigh,
    borderWidth: 1.5,
    borderColor: C.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.secondary,
    borderWidth: 2,
    borderColor: C.surfaceContainerLow,
  },
  chatArea: { flex: 1 },
  chatContent: { padding: 16, gap: 12 },
  clingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  clingBubble: {
    flexShrink: 1,
    backgroundColor: C.surfaceContainerHigh,
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    backgroundColor: C.primaryContainer,
    borderBottomRightRadius: 4,
  },
  typingBubble: { paddingVertical: 12, paddingHorizontal: 18 },
  bubbleText: { fontSize: 15, color: C.onSurface, lineHeight: 21 },
  userBubbleText: { fontSize: 15, color: C.white, fontWeight: '600', lineHeight: 21 },
  taskList: { marginTop: 8, gap: 6 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  taskDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary, marginTop: 7 },
  taskText: { flexShrink: 1, fontSize: 13, color: C.onSurfaceVariant, lineHeight: 19 },
  successChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: C.surfaceContainerLowest,
  },
  successText: { fontSize: 12, fontWeight: '600', color: C.secondary },
  options: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: C.surfaceContainerLow,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.outlineVariant,
  },
  optionChip: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.primaryContainer,
    backgroundColor: C.surfaceContainer,
  },
  optionChipPressed: { backgroundColor: C.primaryContainer },
  optionText: { color: C.primary, fontWeight: '600', fontSize: 14 },
});
