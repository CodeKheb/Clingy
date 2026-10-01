// In-app floating Cling (mascot), no special permissions required.
// Build this FIRST as the safety net before attempting the native overlay bubble.

import { useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet } from 'react-native';

import { ClingSprite } from './ClingSprite';
import { CLING_NATIVE_HEIGHT, CLING_NATIVE_WIDTH } from './clingFrames';
import { NudgeBubble } from './NudgeBubble';
import type { Nudge } from './nudgeText';
import { PetWidget, type ClingMood } from './PetWidget';

export type PetFloatingFallbackProps = {
  mood: ClingMood;
  onPress: () => void;
  /** Vertical position (in px from the top) Cling starts docked at. */
  initialTop?: number;
  /** Safe-area inset so Cling can't be dragged under a bottom nav bar/home indicator. */
  bottomInset?: number;
  /** Something for Cling to say right now, shown in a speech bubble beside it. */
  nudge?: Nudge | null;
};

// The floating bubble renders at 60% of the sprite's native size.
const FLOATING_SCALE = 0.6;
const WIDGET_WIDTH = CLING_NATIVE_WIDTH * FLOATING_SCALE;
const WIDGET_HEIGHT = CLING_NATIVE_HEIGHT * FLOATING_SCALE;
const EDGE_MARGIN = -WIDGET_WIDTH * 0.32; // Cling sits just off-screen, its hand touching the edge

export function PetFloatingFallback({ mood, onPress, initialTop, bottomInset = 0, nudge = null }: PetFloatingFallbackProps) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const maxTop = screenHeight - WIDGET_HEIGHT - bottomInset;
  // The sprite's visible part is WIDGET_WIDTH + EDGE_MARGIN wide; the bubble sits just inside that.
  const bubbleWidth = Math.min(240, screenWidth - (WIDGET_WIDTH + EDGE_MARGIN) - 24);
  const [dockedRight, setDockedRight] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [snapping, setSnapping] = useState(false);

  const startTop = Math.min(initialTop ?? screenHeight * 0.4, maxTop);
  const [pan] = useState(() => new Animated.ValueXY({ x: 0, y: startTop }));
  // Mutable box holding the last docked Y, updated via functional setState so
  // the PanResponder closure (created once) always sees the latest value
  // without reading Animated.Value's private _value/_offset fields.
  const [dockedYBox] = useState(() => ({ current: startTop }));

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        setDragging(true);
        pan.setOffset({ x: 0, y: dockedYBox.current });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_evt, gesture) => {
        pan.flattenOffset();
        setDragging(false);
        setSnapping(true);

        // Decide the dock side by where Cling actually ended up on screen (its
        // center X vs. the screen midpoint), not by gesture direction/velocity —
        // otherwise a small flick from one edge snaps it all the way across.
        const dockedLeftEdgeX = dockedRight
          ? screenWidth - EDGE_MARGIN - WIDGET_WIDTH
          : EDGE_MARGIN;
        const currentLeftEdgeX = dockedLeftEdgeX + gesture.dx;
        const currentCenterX = currentLeftEdgeX + WIDGET_WIDTH / 2;
        const draggedToRight = currentCenterX > screenWidth / 2;
        setDockedRight(draggedToRight);

        const releasedY = dockedYBox.current + gesture.dy;
        const clampedY = Math.max(0, Math.min(maxTop, releasedY));
        dockedYBox.current = clampedY;

        Animated.spring(pan, {
          toValue: { x: 0, y: clampedY },
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }).start(() => setSnapping(false));
      },
    }),
  );

  return (
    <Animated.View
      style={[
        styles.container,
        dockedRight ? { right: EDGE_MARGIN } : { left: EDGE_MARGIN },
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {dragging && (
        <ClingSprite animation="drag" scale={FLOATING_SCALE} flipX={!dockedRight} />
      )}
      {!dragging && snapping && (
        <ClingSprite animation="snap" loop={false} scale={FLOATING_SCALE} flipX={!dockedRight} />
      )}
      {!dragging && !snapping && (
        <PetWidget
          mood={mood}
          onPress={onPress}
          scale={FLOATING_SCALE}
          flipX={!dockedRight}
          animationOverride={nudge?.animation}
        />
      )}
      {nudge && !dragging && !snapping && (
        <NudgeBubble key={nudge.key} text={nudge.text} width={bubbleWidth} height={WIDGET_HEIGHT} side={dockedRight ? 'right' : 'left'} offset={WIDGET_WIDTH + 4} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    zIndex: 1000,
    elevation: 1000,
  },
});
