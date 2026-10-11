import type { Note } from 'opensheetmusicdisplay';

/**
 * OSMD `Note.halfTone` / `Pitch.getHalfTone()` use MusicXML-style cumulative semitones from C0
 * (middle C in octave 4 → 48). Standard MIDI numbers use 60 for the same pitch.
 * @see https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/issues/715
 */
const OSMD_HALFTONE_TO_MIDI_OFFSET = 12;

function firstFiniteNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

/** OSMD-internal halfTone (MusicXML-style index) before adding `OSMD_HALFTONE_TO_MIDI_OFFSET` to obtain MIDI. */
export function getOsmdHalfToneRaw(note: unknown): number | null {
  if (!note) return null;
  if (typeof (note as { isRest?: () => boolean }).isRest === 'function' && (note as { isRest: () => boolean }).isRest()) return null;
  return firstFiniteNumber(
    (note as { halfTone?: number }).halfTone,
    (note as { TransposedPitch?: { halfTone?: number; getHalfTone?: () => number } }).TransposedPitch?.halfTone,
    (note as { TransposedPitch?: { getHalfTone?: () => number } }).TransposedPitch?.getHalfTone?.(),
    (note as { Pitch?: { halfTone?: number; getHalfTone?: () => number } }).Pitch?.halfTone,
    (note as { Pitch?: { getHalfTone?: () => number } }).Pitch?.getHalfTone?.()
  );
}

/** Get MIDI note number from a single OSMD source note, or null if rest/unavailable. */
export function getMidiFromNote(note: unknown): number | null {
  const osmdHalfTone = getOsmdHalfToneRaw(note);
  if (osmdHalfTone === null) return null;
  return Math.round(osmdHalfTone) + OSMD_HALFTONE_TO_MIDI_OFFSET;
}

export function extractExpectedMidiNotes(notes: Note[]): number[] {
  const midiSet = new Set<number>();

  for (const note of notes) {
    const midi = getMidiFromNote(note);
    if (midi === null) continue;
    midiSet.add(midi);
  }

  return Array.from(midiSet).sort((a, b) => a - b);
}
