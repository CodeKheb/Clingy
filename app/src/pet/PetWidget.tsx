// Cling — the app's mascot.

import { useState } from 'react';
import { Pressable } from 'react-native';

import { ClingSprite } from './ClingSprite';
import type { ClingAnimationName } from './clingFrames';

export type ClingMood = 'happy' | 'neutral' | 'stressed' | 'urgent';

export type ClingWidgetProps = {
  mood: ClingMood;
  onPress: () => void;
  scale?: number;
  flipX?: boolean;
};

const MOOD_ANIMATION: Record<ClingMood, ClingAnimationName> = {
  happy: 'happy',
  neutral: 'idle',
  stressed: 'reminder',
  urgent: 'reminder',
};

// PetWidget is the mood-driven mascot visual: it loops the animation for the
// current mood, and plays a one-shot "poke" reaction on tap before calling
// onPress (opens the Cling panel).
export function PetWidget({ mood, onPress, scale = 1, flipX = false }: ClingWidgetProps) {
  const [poking, setPoking] = useState(false);

  const handlePress = () => {
    setPoking(true);
    onPress();
  };

  const animation: ClingAnimationName = poking ? 'poke' : MOOD_ANIMATION[mood];

  return (
    <Pressable onPress={handlePress} hitSlop={12}>
      <ClingSprite
        animation={animation}
        loop={!poking}
        onAnimationEnd={() => setPoking(false)}
        scale={scale}
        flipX={flipX}
      />
    </Pressable>
  );
}
