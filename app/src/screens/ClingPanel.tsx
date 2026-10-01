// Owner: Person C — the conversational panel opened by tapping the Cling
// overlay bubble (or the in-app floating fallback). No free text input from
// the user: Cling "says" a line, the user taps one of a few canned replies.

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClingFace } from '../components/ClingFace';
import {
  CONVERSATION,
  ROOT_NODE_ID,
  resolveEntryNode,
  resolveNodeEffects,
  type ConversationSideEffectResult,
  type TaskSummary,
} from '../pet/clingConversation';
import { C, urgencyColor } from './utils/theme';

type Turn =
  | { role: 'cling'; clingSays: string; extra?: ConversationSideEffectResult }
  | { role: 'user'; text: string };

export type ClingPanelProps = {
  onClose?: () => void;
};

// An icon per reply so the list reads at a glance; anything unlisted gets a plain arrow.
const OPTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Show my tasks': 'list-outline',
  'I need to study': 'book-outline',
  "What's next?": 'flash-outline',
  "I'm busy at a certain time": 'calendar-clear-outline',
  'Schedule study time for these': 'sparkles-outline',
  'Schedule study time': 'sparkles-outline',
  'Yes, go ahead': 'checkmark-circle-outline',
  'Pick the day and time': 'calendar-outline',
  'Another time': 'add-circle-outline',
  Back: 'arrow-back-outline',
  'Not now': 'close-circle-outline',
  'Thanks!': 'happy-outline',
  Nice: 'happy-outline',
};

function dueText(dueAt: string | null): string {
  if (!dueAt) return 'No due date';
  const due = new Date(dueAt);
  const days = Math.round((due.getTime() - Date.now()) / 86400000);
  const date = due.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  if (days <= 0) return `Due today · ${date}`;
  if (days === 1) return `Due tomorrow · ${date}`;
  return `Due in ${days} days · ${date}`;
}

const minutesText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

/** New messages ease in instead of popping. */
function FadeIn({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View
      style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

function TypingDots() {
  const [dots] = useState(() => [new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]);
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={styles.typingRow}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: d }]} />
      ))}
    </View>
  );
}

function ClingAvatar({ size }: { size: number }) {
  return <ClingFace size={size} animated />;
}

function TaskRow({ task }: { task: TaskSummary }) {
  return (
    <View style={styles.taskCard}>
      <View style={[styles.taskBar, { backgroundColor: urgencyColor(task.urgency) }]} />
      <View style={styles.taskBody}>
        <Text style={styles.taskTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <Text style={styles.taskMeta}>
          {dueText(task.dueAt)}
          {task.minutes > 0 ? `  ·  ~${minutesText(task.minutes)}` : ''}
        </Text>
      </View>
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
          <ClingAvatar size={44} />
          <View style={styles.onlineDot} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Cling</Text>
          <Text style={styles.headerSubtitle}>Your study buddy · online</Text>
        </View>
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={20} color={C.onSurfaceVariant} />
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {history.map((turn, i) => {
          if (turn.role === 'user') {
            return (
              <FadeIn key={i} style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userBubbleText}>{turn.text}</Text>
                </View>
              </FadeIn>
            );
          }
          // Only the last message in a run of Cling messages shows the avatar; the rest keep its space.
          const showAvatar = history[i + 1]?.role !== 'cling' && !(loading && i === history.length - 1);
          return (
            <FadeIn key={i} style={styles.clingRow}>
              <View style={styles.avatarSlot}>{showAvatar ? <ClingAvatar size={30} /> : null}</View>
              <View style={styles.clingBubble}>
                <Text style={styles.bubbleText}>{turn.clingSays}</Text>
                {turn.extra?.assignmentSummary && (
                  <View style={styles.taskList}>
                    {turn.extra.assignmentSummary.map((task) => (
                      <TaskRow key={task.title} task={task} />
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
            </FadeIn>
          );
        })}
        {loading && (
          <FadeIn style={styles.clingRow}>
            <View style={styles.avatarSlot}>
              <ClingAvatar size={30} />
            </View>
            <View style={[styles.clingBubble, styles.typingBubble]}>
              <TypingDots />
            </View>
          </FadeIn>
        )}
      </ScrollView>

      {!loading && (
        <View style={[styles.options, { paddingBottom: 14 + insets.bottom }]}>
          {currentNode.options.map((option) => (
            <Pressable
              key={option.label}
              style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
              onPress={() => selectOption(option.label, option.next)}
            >
              <View style={styles.optionIcon}>
                <Ionicons name={OPTION_ICONS[option.label] ?? 'arrow-forward-outline'} size={18} color={C.primary} />
              </View>
              <Text style={styles.optionText}>{option.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.onSurfaceVariant} />
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
    paddingVertical: 10,
    backgroundColor: C.surfaceContainerLow,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.outlineVariant,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.onSurface },
  headerSubtitle: { fontSize: 12, color: C.secondary, marginTop: 1 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: C.secondary,
    borderWidth: 2,
    borderColor: C.surfaceContainerLow,
  },
  chatArea: { flex: 1 },
  chatContent: { padding: 16, gap: 10 },
  clingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '94%' },
  avatarSlot: { width: 30, height: 30 },
  clingBubble: {
    flexShrink: 1,
    backgroundColor: C.surfaceContainerHigh,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleText: { fontSize: 15, color: C.onSurface, lineHeight: 21 },
  userRow: { alignSelf: 'flex-end', maxWidth: '78%' },
  userBubble: {
    backgroundColor: C.primaryContainer,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  userBubbleText: { fontSize: 14.5, color: C.white, fontWeight: '600', lineHeight: 20 },
  typingBubble: { paddingVertical: 15, paddingHorizontal: 16 },
  typingRow: { flexDirection: 'row', gap: 5 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.onSurfaceVariant },
  taskList: { marginTop: 10, gap: 8 },
  taskCard: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.surfaceContainerLowest,
  },
  taskBar: { width: 4 },
  taskBody: { flex: 1, paddingVertical: 9, paddingHorizontal: 12 },
  taskTitle: { fontSize: 13.5, fontWeight: '600', color: C.onSurface, lineHeight: 18 },
  taskMeta: { fontSize: 11.5, color: C.onSurfaceVariant, marginTop: 3 },
  successChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.surfaceContainerLowest,
  },
  successText: { fontSize: 12, fontWeight: '600', color: C.secondary },
  options: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: C.surfaceContainerLow,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.outlineVariant,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: C.surfaceContainerHigh,
  },
  optionRowPressed: { backgroundColor: C.surfaceContainerHighest },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1, color: C.onSurface, fontWeight: '600', fontSize: 14.5 },
});
