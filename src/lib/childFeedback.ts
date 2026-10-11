import {
  EMPTY_CURRENT_EVENT_NOTE_PROGRESS,
  type CurrentEventNoteProgress,
  type StaffSelection,
} from './trainerTypes'

/** When provided, overrides staff-based hand label (e.g. "right only" shows "Tangan kanan" even on lower staff). */
export type HandMode = 'both' | 'right' | 'left';

export type BannerTone = 'neutral' | 'info' | 'warn' | 'error' | 'success';

export const BANNER_TONE_CLASS: Record<BannerTone, string> = {
  neutral: 'border-neutral-700 bg-neutral-800 text-neutral-100',
  info: 'border-sky-500 bg-sky-950/50 text-sky-200',
  warn: 'border-amber-500 bg-amber-950/40 text-amber-200',
  error: 'border-rose-500 bg-rose-950/40 text-rose-200',
  success: 'border-emerald-500 bg-emerald-950/40 text-emerald-200',
};

export type ChildCue =
  | 'ready'
  | 'hint'
  | 'almost'
  | 'try-again'
  | 'listen'
  | 'success'
  | 'done';

export interface ChildFeedback {
  cue: ChildCue;
  message: string;
  handLabel: string;
  handEmoji: string;
  bannerTone: BannerTone;
  targetNotes: number[];
  pulseNotes: number[];
  successNotes: number[];
  wrongNotes: number[];
  /** From practice engine: sorted expected MIDI for the active cursor event. */
  currentExpectedMidi: number[];
  /** From practice engine: correct notes registered for this event (multi-note survives release). */
  currentCompletedMidi: number[];
  /** From practice engine: expected notes not yet satisfied for this event. */
  currentRemainingMidi: number[];
  /** True when this event expects more than one simultaneous note. */
  isCurrentEventChordLike: boolean;
}

export interface DeriveChildFeedbackInput {
  expectedNotes: number[];
  pressedNotes: Set<number>;
  elapsedMs: number;
  staffSelection: StaffSelection;
  handMode?: HandMode;
  isEnd: boolean;
  /** Authoritative partial-completion snapshot from `usePracticeEngine` (same for MIDI + virtual keys). */
  eventProgress: CurrentEventNoteProgress;
}

const HAND_COPY: Record<StaffSelection, { label: string; emoji: string }> = {
  treble: { label: 'Tangan kanan', emoji: '🖐' },
  bass: { label: 'Tangan kiri', emoji: '🤚' },
  both: { label: 'Dua tangan', emoji: '🙌' },
};

const HAND_MODE_COPY: Record<Exclude<HandMode, 'both'>, { label: string; emoji: string }> = {
  right: { label: 'Tangan kanan', emoji: '🖐' },
  left: { label: 'Tangan kiri', emoji: '🤚' },
};

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

export function deriveChildFeedback({
  expectedNotes,
  pressedNotes,
  elapsedMs,
  staffSelection,
  handMode,
  isEnd,
  eventProgress,
}: DeriveChildFeedbackInput): ChildFeedback {
  const hand =
    handMode === 'right' || handMode === 'left'
      ? HAND_MODE_COPY[handMode]
      : HAND_COPY[staffSelection];
  const expected = uniqueNumbers(expectedNotes);
  const progressSlice = isEnd ? EMPTY_CURRENT_EVENT_NOTE_PROGRESS : eventProgress;

  if (isEnd) {
    return {
      cue: 'done',
      message: 'Hebat!',
      handLabel: hand.label,
      handEmoji: hand.emoji,
      bannerTone: 'success',
      targetNotes: [],
      pulseNotes: [],
      successNotes: [],
      wrongNotes: [],
      ...progressSlice,
    };
  }

  if (expected.length === 0) {
    return {
      cue: 'ready',
      message: 'Siap...',
      handLabel: hand.label,
      handEmoji: hand.emoji,
      bannerTone: 'neutral',
      targetNotes: [],
      pulseNotes: [],
      successNotes: [],
      wrongNotes: [],
      ...progressSlice,
    };
  }

  const expectedSet = new Set(expected);
  const pressed = Array.from(pressedNotes);

  const successNotes = uniqueNumbers(
    pressed.filter((note) => expectedSet.has(note))
  );

  const wrongNotes = uniqueNumbers(
    pressed.filter((note) => !expectedSet.has(note))
  );

  const missingNotes = expected.filter((note) => !pressedNotes.has(note));

  const isChord = expected.length > 1;
  const mediumWait = elapsedMs >= 2200;
  const longWait = elapsedMs >= 4500;

  // Belum menekan apa-apa
  if (pressed.length === 0) {
    if (longWait) {
      return {
        cue: 'listen',
        message: isChord ? 'Dengar, lalu cari' : 'Dengar dan cari',
        handLabel: hand.label,
        handEmoji: hand.emoji,
        bannerTone: 'warn',
        targetNotes: expected,
        pulseNotes: expected,
        successNotes: [],
        wrongNotes: [],
        ...progressSlice,
      };
    }

    if (mediumWait) {
      return {
        cue: 'hint',
        message: isChord ? 'Main bersama' : 'Tekan yang ini',
        handLabel: hand.label,
        handEmoji: hand.emoji,
        bannerTone: 'info',
        targetNotes: expected,
        pulseNotes: expected,
        successNotes: [],
        wrongNotes: [],
        ...progressSlice,
      };
    }

    return {
      cue: 'ready',
      message: isChord ? 'Main bersama' : 'Tekan yang ini',
      handLabel: hand.label,
      handEmoji: hand.emoji,
      bannerTone: 'info',
      targetNotes: expected,
      pulseNotes: expected,
      successNotes: [],
      wrongNotes: [],
      ...progressSlice,
    };
  }

  // Salah semua
  if (wrongNotes.length > 0 && successNotes.length === 0) {
    return {
      cue: 'try-again',
      message: 'Coba yang ini',
      handLabel: hand.label,
      handEmoji: hand.emoji,
      bannerTone: 'error',
      targetNotes: expected,
      pulseNotes: missingNotes.length > 0 ? missingNotes : expected,
      successNotes: [],
      wrongNotes,
      ...progressSlice,
    };
  }

  // Sebagian benar, tapi masih kurang / ada salah tambahan
  if (missingNotes.length > 0) {
    return {
      cue: 'almost',
      message: successNotes.length > 0 ? 'Satu lagi' : isChord ? 'Main bersama' : 'Coba lagi',
      handLabel: hand.label,
      handEmoji: hand.emoji,
      bannerTone: 'warn',
      targetNotes: expected,
      pulseNotes: missingNotes,
      successNotes,
      wrongNotes,
      ...progressSlice,
    };
  }

  // Pas semua
  return {
    cue: 'success',
    message: 'Bagus!',
    handLabel: hand.label,
    handEmoji: hand.emoji,
    bannerTone: 'success',
    targetNotes: expected,
    pulseNotes: [],
    successNotes: expected,
    wrongNotes: [],
    ...progressSlice,
  };
}
