/** Which hand the student is practicing (filter on two-staff scores). */
export type HandSelection = 'left' | 'right' | 'both'

/** @deprecated Use HandSelection */
export type HandMode = HandSelection

/** Which staff(ves) are active for note-reading targets. */
export type StaffSelection = 'treble' | 'bass' | 'both'

/** Staff role from score structure: upper staff (e.g. treble), lower staff (e.g. bass), or single staff. */
export type StaffRole = 'upper' | 'lower' | 'single'

/**
 * One playable practice note with original score staff identity preserved.
 * staffRole is derived from rendered staff geometry (top vs bottom) or source id order as fallback — not from MIDI pitch.
 */
export interface PracticeNote {
  midi: number
  partIndex: number
  /** Raw staff index from OSMD (e.g. staffLine); preserved for identity. */
  rawStaffIndex: number
  /** Same as rawStaffIndex when known; kept explicit for staff-aware trainers. */
  staffIndex: number
  /** Stable source-model id: `Note.ParentStaff.Id` when available (same as staffIndex in that case). */
  sourceStaffId: number
  /** 0-based source measure index when the note was collected. */
  measureIndex?: number
  staffRole: StaffRole
}

/** One staff/hand-filtered playable moment aligned to the sheet grid; OSMD cursor step is seek-only. */
export type StaffFilteredPlayableEvent = {
  /** Stable id from musical anchors (not OSMD cursor index). */
  practiceEventKey: string
  /** Number of `cursor.next()` calls after `reset()` to reach this event (renderer adapter). */
  cursorStep: number
  expectedMidi: number[]
  practiceNotes: PracticeNote[]
  measureIndex?: number
  totalAtCursor?: number
  isMultiStaffScore?: boolean
  gridKind: 'note' | 'rest'
  requiresKeyboardInput: boolean
}

/**
 * Practice mode for the main trainer.
 * - 'regular' is the existing music-reading mode
 * - 'music' is the beginner-facing label for the same idea
 * - 'drill' is the beginner drill mode
 *
 * Keeping 'regular' for backward compatibility; new beginner flows can prefer 'music'.
 */
export type PracticeMode = 'regular' | 'music' | 'drill'

/** Keyboard span for beginner-friendly settings. */
export type KeyboardSpan = '2-oct' | '3-oct'

/** How we summarize a student's attempt in beginner drill mode. */
export type AttemptResult =
  | 'correct'
  | 'wrongPitch'
  | 'wrongOctaveHigh'
  | 'wrongOctaveLow'
  | 'nearby'

/** Mission archetypes for beginner self-learning mode. */
export type MissionType = 'singleNote' | 'direction' | 'pattern' | 'phrase'

/** Shared settings object for beginner drill / self-learning mode. */
export interface BeginnerDrillSettings {
  practiceMode: PracticeMode
  ageBand: import('./hintLadder').AgeBand
  handMode: HandSelection
  staffSelection: StaffSelection
  showNoteName: boolean
  keyboardSpan: KeyboardSpan
  autoNudgeEnabled: boolean
  missionType: MissionType
}

/**
 * Placeholder for a future Attempt / EventResult pipeline (mission + leaderboard).
 * Pitch-only / note-reading accuracy today — expand when rhythm is scored.
 */
export interface NoteReadingAttemptStub {
  domainEventId: string
  /** Null when the slice is a rest or otherwise not pitch-scored. */
  pitchFirstTryCorrect: boolean | null
}

/** Result of evaluating one played note against one target. */
export type InputFeedback =
  | { kind: 'idle' }
  | { kind: 'correct' }
  | { kind: 'almost'; direction: 'higher' | 'lower' }
  | { kind: 'wrong' }

/**
 * Engine-authored snapshot for the current cursor event (partial multi-note completion, etc.).
 * Exposed to the guidance/UI layer; do not re-derive completion from pressed vs expected alone.
 */
export interface CurrentEventNoteProgress {
  currentExpectedMidi: number[]
  currentCompletedMidi: number[]
  currentRemainingMidi: number[]
  isCurrentEventChordLike: boolean
}

export const EMPTY_CURRENT_EVENT_NOTE_PROGRESS: CurrentEventNoteProgress = {
  currentExpectedMidi: [],
  currentCompletedMidi: [],
  currentRemainingMidi: [],
  isCurrentEventChordLike: false,
}
