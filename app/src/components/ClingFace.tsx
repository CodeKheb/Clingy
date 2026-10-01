// Cling's face in a circle, with the star optically centered. The sprite frames share one 140x150
// canvas, but the solid star (alpha above 50%, averaged over the idle frames) is centered at about
// (58, 74) rather than the canvas middle (70, 75). Centering the image would leave it left of center
// in the circle, so the image is nudged by exactly that difference.

import { Image, StyleSheet, View } from 'react-native';

import { CLING_NATIVE_HEIGHT, CLING_NATIVE_WIDTH } from '../pet/clingFrames';
import { ClingSprite } from '../pet/ClingSprite';
import { C } from '../screens/utils/theme';

const IDLE_FRAME = require('../../assets/cling/idle_1.png');

const SHIFT_X = 70 - 58.2; // canvas center minus the star's center, in canvas pixels
const SHIFT_Y = 75 - 73.8;
// Sprite height as a share of the circle; the star itself is about 56% of the sprite height.
const FILL = 1.1;

export function ClingFace({
  size,
  animated = false,
  backgroundColor = C.surfaceContainerHigh,
  borderColor = C.primaryContainer,
  borderWidth = 1.5,
}: {
  size: number;
  animated?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}) {
  const spriteHeight = size * FILL;
  const scale = spriteHeight / CLING_NATIVE_HEIGHT;

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor, borderColor, borderWidth },
      ]}
    >
      <View style={{ transform: [{ translateX: SHIFT_X * scale }, { translateY: SHIFT_Y * scale }] }}>
        {animated ? (
          <ClingSprite animation="idle" scale={scale} />
        ) : (
          <Image
            source={IDLE_FRAME}
            style={{ width: CLING_NATIVE_WIDTH * scale, height: spriteHeight }}
            resizeMode="contain"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
