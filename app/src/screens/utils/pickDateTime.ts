// Android system date/time dialogs as promises. Resolves null if dismissed.

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

function pick(mode: 'date' | 'time', value: Date, title: string, minimumDate?: Date): Promise<Date | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      mode,
      value,
      title,
      minimumDate,
      is24Hour: false,
      onValueChange: (_event, date) => resolve(date),
      onDismiss: () => resolve(null),
    });
  });
}

/** Walks through day, start time and end time; null if the user backs out of any step. */
export async function pickBusyRange(): Promise<{ start: Date; end: Date } | null> {
  const now = new Date();
  const day = await pick('date', now, 'Which day are you busy?', now);
  if (!day) return null;

  const startDefault = new Date(day);
  startDefault.setHours(Math.max(9, day.toDateString() === now.toDateString() ? now.getHours() + 1 : 9), 0, 0, 0);
  const startTime = await pick('time', startDefault, 'Busy from');
  if (!startTime) return null;

  const endDefault = new Date(startTime.getTime() + 60 * 60 * 1000);
  const endTime = await pick('time', endDefault, 'Busy until');
  if (!endTime) return null;

  const start = new Date(day);
  start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
  const end = new Date(day);
  end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
  return { start, end };
}
