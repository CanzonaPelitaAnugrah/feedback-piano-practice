import type { InputFeedback } from './trainerTypes'

/** Result of evaluating one played MIDI note against one target (no idle). */
export type SingleNoteResult = Exclude<InputFeedback, { kind: 'idle' }>

/**
 * Evaluate a single played MIDI note against a single target MIDI note.
 * - Exact MIDI match => correct
 * - Same pitch class, different octave => almost, with direction (played lower than target => "higher", played higher than target => "lower")
 * - Otherwise => wrong
 */
export function evaluateSingleNote(
  playedMidi: number,
  targetMidi: number
): SingleNoteResult {
  const played = Math.round(playedMidi)
  const target = Math.round(targetMidi)

  if (played === target) {
    return { kind: 'correct' }
  }

  const playedPitchClass = ((played % 12) + 12) % 12
  const targetPitchClass = ((target % 12) + 12) % 12

  if (playedPitchClass === targetPitchClass) {
    return {
      kind: 'almost',
      direction: played < target ? 'higher' : 'lower',
    }
  }

  return { kind: 'wrong' }
}
