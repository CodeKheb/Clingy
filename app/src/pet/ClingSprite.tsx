// Plays a looping Cling frame animation from clingFrames.ts.

import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import {
  CLING_FRAME_DURATION,
  CLING_FRAMES,
  CLING_NATIVE_HEIGHT,
  CLING_NATIVE_WIDTH,
  type ClingAnimationName,
} from './clingFrames';

export type ClingSpriteProps = {
  animation: ClingAnimationName;
  loop?: boolean;
  onAnimationEnd?: () => void;
  /** Scales the sprite down from its native pixel size (1 = native size). */
  scale?: number;
  /** Mirrors the sprite horizontally (used when docked on the left edge). */
  flipX?: boolean;
};

export function ClingSprite({ animation, loop = true, onAnimationEnd, scale = 1, flipX = false }: ClingSpriteProps) {
  const frames = CLING_FRAMES[animation];
  const frameDuration = CLING_FRAME_DURATION[animation];
  const [frameIndex, setFrameIndex] = useState(0);
  const [prevAnimation, setPrevAnimation] = useState(animation);
  const onAnimationEndRef = useRef(onAnimationEnd);

  useEffect(() => {
    onAnimationEndRef.current = onAnimationEnd;
  }, [onAnimationEnd]);

  // Reset to frame 0 whenever the animation changes, following React's
  // "adjust state during render" pattern instead of an effect.
  if (animation !== prevAnimation) {
    setPrevAnimation(animation);
    setFrameIndex(0);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1;
        if (next >= frames.length) {
          if (!loop) {
            clearInterval(interval);
            return prev;
          }
          return 0;
        }
        return next;
      });
    }, frameDuration);
    return () => clearInterval(interval);
  }, [animation, frames.length, frameDuration, loop]);

  const isLastFrame = !loop && frameIndex === frames.length - 1;
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (isLastFrame && !notifiedRef.current) {
      notifiedRef.current = true;
      onAnimationEndRef.current?.();
    }
    if (!isLastFrame) {
      notifiedRef.current = false;
    }
  }, [isLastFrame]);

  const source = frames[frameIndex] ?? frames[0];
  const width = CLING_NATIVE_WIDTH * scale;
  const height = CLING_NATIVE_HEIGHT * scale;

  return (
    <View style={[styles.container, { width, height }]}>
      <Image
        source={source}
        style={[{ width, height }, flipX && styles.flipped]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipped: {
    transform: [{ scaleX: -1 }],
  },
});
