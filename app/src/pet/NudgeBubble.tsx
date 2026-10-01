// Speech bubble beside the floating Cling, vertically centred on the sprite. It only fades in.

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { C } from '../screens/utils/theme';

export function NudgeBubble({
  text,
  width,
  height,
  side,
  offset,
}: {
  text: string;
  width: number;
  /** Height of the sprite, so the bubble lines up with it. */
  height: number;
  side: 'left' | 'right';
  offset: number;
}) {
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <View pointerEvents="none" style={[styles.slot, { width, height, [side]: offset }]}>
      <Animated.View style={[styles.bubble, { opacity: fade }]}>
        <Text style={styles.text}>{text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', top: 0, justifyContent: 'center' },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: C.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: C.primary + '88',
    elevation: 8,
  },
  text: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: C.onSurface },
});
