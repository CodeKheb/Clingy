// Owner: Person C — in-app floating Cling (mascot), no special permissions required.
// Build this FIRST as the safety net before attempting the native overlay bubble.

import { useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet } from 'react-native';

import { ClingSprite } from './ClingSprite';
import { CLING_NATIVE_HEIGHT } from './clingFrames';
import { PetWidget, type ClingMood } from './PetWidget';

export type PetFloatingFallbackProps = {
  mood: ClingMood;
  onPress: () => void;
  /** Vertical position (in px from the top) Cling starts docked at. */
  initialTop?: number;
};

// Floating bubble renders smaller than the full-size PetScreen display.
const FLOATING_SCALE = 0.6;
const WIDGET_HEIGHT = CLING_NATIVE_HEIGHT * FLOATING_SCALE;
const EDGE_MARGIN = -10; // Cling sticks to the edge, slightly overhanging it per style notes

export function PetFloatingFallback({ mood, onPress, initialTop }: PetFloatingFallbackProps) {
  const { height: screenHeight } = Dimensions.get('window');
  const [dockedRight, setDockedRight] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [snapping, setSnapping] = useState(false);

  const startTop = initialTop ?? screenHeight * 0.4;
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

        const draggedToRight = gesture.dx + gesture.vx * 40 > 0;
        setDockedRight(draggedToRight);

        const releasedY = dockedYBox.current + gesture.dy;
        const clampedY = Math.max(0, Math.min(screenHeight - WIDGET_HEIGHT, releasedY));
        dockedYBox.current = clampedY;

        Animated.spring(pan, {
          toValue: { x: 0, y: clampedY },
          useNativeDriver: false,
          friction: 6,
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
        <PetWidget mood={mood} onPress={onPress} scale={FLOATING_SCALE} flipX={!dockedRight} />
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
