/**
 * Rest handling for note-reading practice (Learn, Drill, Reading).
 *
 * In these modes rests are non-input events: the session auto-advances without keyboard
 * input and without pitch scoring. Rhythm is not evaluated yet.
 */

export type NoteReadingSessionMode = 'learn' | 'practice' | 'play'

/**
 * Whether the cursor may silently advance over a written rest without keyboard input.
 *
 * Applies to Learn, Drill, and Reading (note-reading) flows today.
 */
export function shouldAutoAdvanceRest(gridKind: 'note' | 'rest' | null): boolean {
  return gridKind === 'rest'
}

// TODO(rhythm-play): When Rhythm/Play mode adds timed rest scoring, return false for rests in
// that mode so the student must observe beat-accurate silence instead of instant auto-advance.
// Wire learnPracticePlayMode === 'play' plus a rhythm-scoring feature flag here.
