// Android system date/time dialogs as promises. Resolves null if dismissed or if the dialog fails to open.

import { ToastAndroid } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

const CHOOSE_TIMES = Symbol('choose-times');

// The default Android dialogs ignore a title, so say which step this is with a short toast instead.
const settle = () => new Promise<void>((r) => setTimeout(r, 350)); // let the previous dialog finish closing

async function pick(
  mode: 'date' | 'time',
  value: Date,
  hint: string,
  options: { minimumDate?: Date; timesButton?: boolean } = {},
): Promise<Date | typeof CHOOSE_TIMES | null> {
  await settle();
  ToastAndroid.show(hint, ToastAndroid.SHORT);
  return new Promise((resolve) => {
    const finish = (result: Date | typeof CHOOSE_TIMES | null) => {
      resolve(result);
    };
    try {
      DateTimePickerAndroid.open({
      mode,
      value,
      minimumDate: options.minimumDate,
      is24Hour: false,
      ...(options.timesButton
        ? {
            // Confirm = block whole days (keeps the chosen until-day); the side button switches to exact times.
            positiveButton: { label: 'All day' },
            neutralButton: { label: 'Choose times' },
            onNeutralButtonPress: () => finish(CHOOSE_TIMES),
          }
        : {}),
      onValueChange: (_event, date) => finish(date),
      onDismiss: () => finish(null),
      // Without this the library swallows the failure and the caller would wait forever.
      onError: (error) => {
        console.warn('[picker] could not open the dialog:', error);
        ToastAndroid.show("Couldn't open the date picker", ToastAndroid.LONG);
        finish(null);
      },
      });
    } catch (error) {
      console.warn('[picker] open() threw:', error);
      ToastAndroid.show("Couldn't open the date picker", ToastAndroid.LONG);
      finish(null);
    }
  });
}

function atTime(day: Date, hours: number, minutes: number, seconds = 0): Date {
  const result = new Date(day);
  result.setHours(hours, minutes, seconds, 0);
  return result;
}

/**
 * Busy from one day to another (all day), or on one day from a start time to an end time. Null if the user backs out of any step.
 */
export async function pickBusyRange(): Promise<{ start: Date; end: Date } | null> {
  const now = new Date();
  const fromDay = await pick('date', now, 'Busy from which day?', { minimumDate: now });
  if (!(fromDay instanceof Date)) return null;

  const untilDay = await pick('date', fromDay, 'Busy until which day? (same day for just one)', {
    minimumDate: fromDay,
    timesButton: true,
  });
  if (untilDay === null) return null;
  if (untilDay instanceof Date) return { start: atTime(fromDay, 0, 0), end: atTime(untilDay, 23, 59, 59) };

  // "Choose times": a single day, from one time to another.
  const startPicked = await pick('time', atTime(fromDay, 9, 0), 'Busy from what time?');
  if (!(startPicked instanceof Date)) return null;
  const endPicked = await pick('time', atTime(fromDay, 17, 0), 'Busy until what time?');
  if (!(endPicked instanceof Date)) return null;
  return {
    start: atTime(fromDay, startPicked.getHours(), startPicked.getMinutes()),
    end: atTime(fromDay, endPicked.getHours(), endPicked.getMinutes()),
  };
}

/** A time of day as minutes after midnight. Null if the user backs out. */
export async function pickTimeOfDay(initialMinutes: number, hint: string): Promise<number | null> {
  const picked = await pick('time', atTime(new Date(), Math.floor(initialMinutes / 60), initialMinutes % 60), hint);
  return picked instanceof Date ? picked.getHours() * 60 + picked.getMinutes() : null;
}

/** A single moment: day, then time of day. Null if the user backs out. */
export async function pickMoment(initial: Date): Promise<Date | null> {
  const day = await pick('date', initial, 'Move to which day?', { minimumDate: new Date() });
  if (!(day instanceof Date)) return null;
  const time = await pick('time', initial, 'Move to what time?');
  if (!(time instanceof Date)) return null;
  return atTime(day, time.getHours(), time.getMinutes());
}
