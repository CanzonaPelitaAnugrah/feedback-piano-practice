export interface ExactMidiMatchResult {
  matched: number[];
  missing: number[];
  extra: number[];
  isExact: boolean;
}

function uniqueSorted(values: Iterable<number>): number[] {
  return [...new Set(Array.from(values).map((n) => Math.round(n)))].sort((a, b) => a - b);
}

export function compareExactMidi(
  expectedNotes: number[],
  pressedNotes: Iterable<number>
): ExactMidiMatchResult {
  const expected = uniqueSorted(expectedNotes);
  const pressed = uniqueSorted(pressedNotes);

  const expectedSet = new Set(expected);
  const pressedSet = new Set(pressed);

  const matched = expected.filter((n) => pressedSet.has(n));
  const missing = expected.filter((n) => !pressedSet.has(n));
  const extra = pressed.filter((n) => !expectedSet.has(n));

  return {
    matched,
    missing,
    extra,
    isExact: missing.length === 0 && extra.length === 0 && expected.length > 0,
  };
}
