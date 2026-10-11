import { getNoteName } from './midiUtils';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Same spelling as UI / `formatNoteArray` (MIDI 60 = C4). */
export function displayNoteLabel(noteNumber: number): string {
  return getNoteName(noteNumber);
}

/** Letter-only pitch class for white keys (e.g. E, B). */
export function displayWhiteKeyLabel(noteNumber: number): string {
  const safe = Math.round(noteNumber);
  return NOTE_NAMES[((safe % 12) + 12) % 12].replace('#', '');
}

/** C keys only: C + octave (MIDI 60 = C4). */
export function displayCLabel(noteNumber: number): string {
  const safe = Math.round(noteNumber);
  const octave = Math.floor(safe / 12) - 1;
  return `C${octave}`;
}
