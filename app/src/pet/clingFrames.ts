// Frame assets cropped from assets/source/sprite_sheet.png into assets/cling/*.png
// Every frame (across all animations) is cropped to the same native canvas size
// so swapping frames or animations never jumps or resizes the sprite.

export type ClingAnimationName =
  | 'idle'
  | 'blink'
  | 'poke'
  | 'drag'
  | 'snap'
  | 'reminder'
  | 'happy'
  | 'sleep';

// Native pixel size of every cropped frame in assets/cling/*.png.
export const CLING_NATIVE_WIDTH = 140;
export const CLING_NATIVE_HEIGHT = 150;

export const CLING_FRAMES: Record<ClingAnimationName, number[]> = {
  idle: [
    require('../../assets/cling/idle_1.png'),
    require('../../assets/cling/idle_2.png'),
    require('../../assets/cling/idle_3.png'),
  ],
  blink: [require('../../assets/cling/blink_1.png'), require('../../assets/cling/blink_2.png')],
  poke: [
    require('../../assets/cling/poke_1.png'),
    require('../../assets/cling/poke_2.png'),
    require('../../assets/cling/poke_3.png'),
  ],
  drag: [require('../../assets/cling/drag_1.png'), require('../../assets/cling/drag_2.png')],
  snap: [
    require('../../assets/cling/snap_1.png'),
    require('../../assets/cling/snap_2.png'),
    require('../../assets/cling/snap_3.png'),
  ],
  reminder: [
    require('../../assets/cling/reminder_1.png'),
    require('../../assets/cling/reminder_2.png'),
    require('../../assets/cling/reminder_3.png'),
    require('../../assets/cling/reminder_4.png'),
  ],
  happy: [
    require('../../assets/cling/happy_1.png'),
    require('../../assets/cling/happy_2.png'),
    require('../../assets/cling/happy_3.png'),
  ],
  sleep: [
    require('../../assets/cling/sleep_1.png'),
    require('../../assets/cling/sleep_2.png'),
    require('../../assets/cling/sleep_3.png'),
  ],
};

// Frame duration in ms for each animation (looping).
export const CLING_FRAME_DURATION: Record<ClingAnimationName, number> = {
  idle: 450,
  blink: 120,
  poke: 140,
  drag: 150,
  snap: 110,
  reminder: 200,
  happy: 220,
  sleep: 500,
};
