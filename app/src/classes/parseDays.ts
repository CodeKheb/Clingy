// Turns a printed day pattern ("MWF", "TTh", "Sat", "Mon/Wed") into day_of_week numbers (0 = Sunday),
// Monday-first. Unparseable input returns [] so the confirmation screen makes the user pick days.

const NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Reads a run of letter codes: M, T, W, Th, F, S (Saturday), Su (Sunday), Sa. Null if any part is unknown. */
function parseLetters(run: string): number[] | null {
  const days: number[] = [];
  for (let i = 0; i < run.length; i++) {
    const two = run.slice(i, i + 2);
    if (two === 'th') { days.push(4); i++; }
    else if (two === 'su') { days.push(0); i++; }
    else if (two === 'sa') { days.push(6); i++; }
    else if (run[i] === 'm') days.push(1);
    else if (run[i] === 't') days.push(2);
    else if (run[i] === 'w') days.push(3);
    else if (run[i] === 'f') days.push(5);
    else if (run[i] === 's') days.push(6);
    else return null;
  }
  return days;
}

export function parseDays(input: string | null | undefined): number[] {
  if (!input) return [];
  const tokens = input.toLowerCase().split(/[\s/,&+\-.]+/).filter(Boolean);
  const found = new Set<number>();
  for (const token of tokens) {
    const named = NAMES[token];
    if (named !== undefined) {
      found.add(named);
      continue;
    }
    const letters = parseLetters(token);
    if (letters === null) return [];
    letters.forEach((d) => found.add(d));
  }
  return ORDER.filter((d) => found.has(d));
}
