export interface KeyboardWindow {
  startMidi: number;
  endMidi: number;
}

/** Centralized keyboard range configuration. */
const ABS_MIN_MIDI = 24; // C1 – virtual lower bound
const ABS_MAX_MIDI = 132; // C10 – virtual upper bound

/** Beginner-friendly "sensible" viewing band; expanded only if score demands it. */
const PRACTICAL_MIN_MIDI = 36; // C2
const PRACTICAL_MAX_MIDI = 96; // C7

const WINDOW_SIZE = 36; // 3 octaves
const WINDOW_SPAN = WINDOW_SIZE - 1; // inclusive end
const EDGE_PADDING = 4;

/** Full piano range C1–C10 for virtual keyboard; camera glides without recentering. */
export const FULL_KEYBOARD_WINDOW: KeyboardWindow = {
  startMidi: ABS_MIN_MIDI,
  endMidi: ABS_MAX_MIDI,
};

export const DEFAULT_KEYBOARD_WINDOW: KeyboardWindow = {
  startMidi: 48, // C3
  endMidi: 83,   // B5
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapDownToC(midi: number): number {
  return Math.floor(midi / 12) * 12;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function getAdaptiveKeyboardWindow(
  targetNotes: number[],
  previousWindow: KeyboardWindow = DEFAULT_KEYBOARD_WINDOW
): KeyboardWindow {
  if (!targetNotes.length) {
    return previousWindow;
  }

  const notes = uniqueSorted(targetNotes);
  const minTarget = notes[0];
  const maxTarget = notes[notes.length - 1];

  // Decide which clamping band to use:
  // - If the score lives entirely in the beginner-safe band, stay within that band.
  // - If the score genuinely goes below/above, expand toward the absolute limits just
  //   enough to keep those notes reachable, but never beyond ABS_*.
  const usesBelowPractical = minTarget < PRACTICAL_MIN_MIDI;
  const usesAbovePractical = maxTarget > PRACTICAL_MAX_MIDI;

  const bandMin = usesBelowPractical ? ABS_MIN_MIDI : PRACTICAL_MIN_MIDI;
  const bandMax = usesAbovePractical ? ABS_MAX_MIDI : PRACTICAL_MAX_MIDI;

  // Start-position clamp bounds within the chosen band.
  const startMin = bandMin;
  const startMax = Math.max(startMin, bandMax - WINDOW_SPAN);

  const comfortablyVisible =
    minTarget >= previousWindow.startMidi + EDGE_PADDING &&
    maxTarget <= previousWindow.endMidi - EDGE_PADDING;

  if (comfortablyVisible) {
    return previousWindow;
  }

  const center = Math.round((minTarget + maxTarget) / 2);
  let startMidi = snapDownToC(center - 12);
  startMidi = clamp(startMidi, startMin, startMax);

  let endMidi = startMidi + WINDOW_SPAN;

  if (minTarget < startMidi) {
    startMidi = snapDownToC(minTarget);
    startMidi = clamp(startMidi, startMin, startMax);
    endMidi = startMidi + WINDOW_SPAN;
  }

  if (maxTarget > endMidi) {
    startMidi = snapDownToC(maxTarget - WINDOW_SPAN);
    startMidi = clamp(startMidi, startMin, startMax);
    endMidi = startMidi + WINDOW_SPAN;
  }

  return { startMidi, endMidi };
}
