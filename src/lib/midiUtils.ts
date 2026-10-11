const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Scientific pitch labels with MIDI 60 = C4 (middle C). */
export function getNoteName(midiNumber: number): string {
  if (!Number.isFinite(midiNumber)) return '—'

  const rounded = Math.round(midiNumber)
  const noteIndex = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1

  return `${NOTE_NAMES[noteIndex]}${octave}`
}

export function formatNoteArray(notes: number[] | Set<number> | null | undefined): string {
  if (!notes) return '—'

  const noteArray = Array.from(notes).filter((n): n is number => Number.isFinite(n))

  if (noteArray.length === 0) return '—'

  return noteArray.map(getNoteName).join(', ')
}
