import { useCallback, useEffect, useRef, useState } from 'react'
import { DEBUG_CHORD_PROGRESS, logChordProgress } from '../lib/debugChordProgress'
import { compareExactMidi } from '../lib/exactMidiMatch'
import { evaluateSingleNote } from '../lib/evaluateSingleNote'
import type {
  CurrentEventNoteProgress,
  InputFeedback,
  PracticeMode,
} from '../lib/trainerTypes'
import { EMPTY_CURRENT_EVENT_NOTE_PROGRESS } from '../lib/trainerTypes'
import { BEGINNER_DRILL_HINT_PRESETS, createHintLadder } from '../lib/hintLadder'
import type { BeginnerAgeBandPreset, HintLadderController, HintLevel } from '../lib/hintLadder'

export type FirstTryScoringSnapshot = {
  firstTryCorrectEvents: number
  totalScoredEvents: number
  fullSongScore100: number
  loopFirstTryCorrectEvents: number
  loopTotalScoredEvents: number
  loopScore100: number
}

function score100(firstTryCorrect: number, total: number): number {
  if (total <= 0) return 100
  return Math.round((firstTryCorrect / total) * 100)
}

export type FeedbackState = 'IDLE' | 'WAITING' | 'CORRECT' | 'WRONG' | 'NEED_RELEASE'

function toSortedArray(notes: Set<number>): number[] {
  return Array.from(notes).sort((a, b) => a - b)
}

function toSignature(notes: number[]): string {
  return notes.join(',')
}

function midiArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function computeCurrentEventNoteProgress(
  expectedSorted: number[],
  awaitingRelease: boolean,
  partialPlayed: Set<number>
): CurrentEventNoteProgress {
  if (expectedSorted.length === 0) {
    return EMPTY_CURRENT_EVENT_NOTE_PROGRESS
  }

  const isCurrentEventChordLike = expectedSorted.length > 1

  if (isCurrentEventChordLike) {
    const currentCompletedMidi = toSortedArray(partialPlayed)
    const done = new Set(currentCompletedMidi.map((m) => Math.round(m)))
    const currentRemainingMidi = expectedSorted.filter((m) => !done.has(Math.round(m)))
    return {
      currentExpectedMidi: expectedSorted,
      currentCompletedMidi,
      currentRemainingMidi,
      isCurrentEventChordLike: true,
    }
  }

  const currentCompletedMidi =
    awaitingRelease && expectedSorted[0] !== undefined
      ? [Math.round(expectedSorted[0])]
      : []
  const done = new Set(currentCompletedMidi.map((m) => Math.round(m)))
  const currentRemainingMidi = expectedSorted.filter((m) => !done.has(Math.round(m)))
  return {
    currentExpectedMidi: expectedSorted,
    currentCompletedMidi,
    currentRemainingMidi,
    isCurrentEventChordLike: false,
  }
}

export function usePracticeEngine(
  activeNotes: Set<number>,
  expectedNotes: number[],
  onCorrectMatch: () => void,
  _practiceMode: PracticeMode = 'regular',
  practiceEventKey: string | null = null,
  /** When true, loop counters use first-pass-only keys; when false, loop totals mirror full-song counters. */
  loopScoringActive: boolean = false,
  /** Identifies the current loop bar range; when it changes while loop scoring is active, only loop-scoped counters reset. */
  loopRangeIdentity: string | null = null
) {
  // _practiceMode reserved for future drill behavior; currently no branch
  const [feedback, setFeedback] = useState<FeedbackState>('IDLE')
  const [mistakes, setMistakes] = useState(0)
  const [attemptFeedback, setAttemptFeedback] = useState<InputFeedback>({ kind: 'idle' })
  const [hintLevel, setHintLevel] = useState<HintLevel>('none')
  void hintLevel
  void setHintLevel

  const [eventNoteProgress, setEventNoteProgress] = useState<CurrentEventNoteProgress>(
    EMPTY_CURRENT_EVENT_NOTE_PROGRESS
  )

  const [firstTryCorrectEvents, setFirstTryCorrectEvents] = useState(0)
  const [totalScoredEvents, setTotalScoredEvents] = useState(0)
  const [loopFirstTryCorrectEvents, setLoopFirstTryCorrectEvents] = useState(0)
  const [loopTotalScoredEvents, setLoopTotalScoredEvents] = useState(0)

  // After a correct note, wait until all notes are released.
  const awaitingReleaseRef = useRef(false)

  // Prevent counting the same wrong press repeatedly while still held.
  const lastWrongSignatureRef = useRef<string | null>(null)

  /** Multi-note targets: MIDI values correctly played for the current event (any order, survives release). */
  const partialPlayedRef = useRef<Set<number>>(new Set())
  const prevActiveNotesRef = useRef<Set<number>>(new Set())
  const lastPracticeEventKeyRef = useRef<string | null>(null)
  const practiceEventKeyRef = useRef<string | null>(practiceEventKey)
  practiceEventKeyRef.current = practiceEventKey

  /**
   * Prevents a second first-try tally for the same `practiceEventKey` when the cursor fails to advance
   * after a correct match (release and re-press). Cleared on every real cursor-step change and on reset.
   */
  const scoringCommittedForPracticeEventKeyRef = useRef<string | null>(null)

  /** Wrong input that arrived during this event (see newly-pressed rules in multi/single paths). */
  const hadWrongAttemptRef = useRef(false)

  const loopScoringActiveRef = useRef(loopScoringActive)
  loopScoringActiveRef.current = loopScoringActive
  const loopRecordedKeysRef = useRef<Set<string>>(new Set())

  const activeNotesRef = useRef(activeNotes)
  activeNotesRef.current = activeNotes

  // Beginner drill: internal hint ladder controller and timing per target.
  const hintLadderRef = useRef<HintLadderController | null>(null)
  const targetStartTimeRef = useRef<number | null>(null)
  const targetSignatureRef = useRef<string | null>(null)
  const hintTimerIdRef = useRef<number | null>(null)
  const lastHintLevelRef = useRef<HintLevel>('none')

  // Default beginner drill age band preset; can be wired to UI / settings later.
  const beginnerAgePresetRef = useRef<BeginnerAgeBandPreset>('age6_7')

  // Lazily initialize hint ladder when entering beginner drill mode.
  useEffect(() => {
    if (_practiceMode !== 'drill') {
      // Stop any timing when leaving drill mode.
      targetStartTimeRef.current = null
      targetSignatureRef.current = null
      lastHintLevelRef.current = 'none'
      if (hintTimerIdRef.current != null) {
        window.clearInterval(hintTimerIdRef.current)
        hintTimerIdRef.current = null
      }
      return
    }

    if (!hintLadderRef.current) {
      const presetKey = beginnerAgePresetRef.current
      const presetConfig = BEGINNER_DRILL_HINT_PRESETS[presetKey]
      hintLadderRef.current = createHintLadder(presetConfig)
    }
  }, [_practiceMode])

  // Detect when a new target note (expected chord) becomes active in drill mode.
  useEffect(() => {
    if (_practiceMode !== 'drill') return
    if (!hintLadderRef.current) return

    if (expectedNotes.length === 0) {
      targetStartTimeRef.current = null
      targetSignatureRef.current = null
      return
    }

    const expected = [...expectedNotes].sort((a, b) => a - b)
    const expectedSig = toSignature(expected)

    if (targetSignatureRef.current === expectedSig) {
      return
    }

    targetSignatureRef.current = expectedSig
    targetStartTimeRef.current = performance.now()
    hintLadderRef.current.registerTargetStart()
    lastHintLevelRef.current = hintLadderRef.current.hintLevel
  }, [expectedNotes, _practiceMode])

  // Periodically update elapsed time for the active target in drill mode.
  useEffect(() => {
    if (_practiceMode !== 'drill') return
    if (!hintLadderRef.current) return
    if (expectedNotes.length === 0) return

    if (hintTimerIdRef.current != null) {
      window.clearInterval(hintTimerIdRef.current)
      hintTimerIdRef.current = null
    }

    const id = window.setInterval(() => {
      if (!hintLadderRef.current) return
      if (awaitingReleaseRef.current) return
      if (targetStartTimeRef.current == null) return

      const elapsed = Math.round(performance.now() - targetStartTimeRef.current)
      hintLadderRef.current.updateElapsed(elapsed)

      const level = hintLadderRef.current.hintLevel
      if (level !== lastHintLevelRef.current) {
        lastHintLevelRef.current = level
      }
    }, 500)

    hintTimerIdRef.current = id

    return () => {
      window.clearInterval(id)
      if (hintTimerIdRef.current === id) {
        hintTimerIdRef.current = null
      }
    }
  }, [expectedNotes, _practiceMode])

  /** When loop segment identity changes while loop scoring is on, reset loop-only counters (full-song counters unchanged). */
  useEffect(() => {
    if (!loopScoringActive) return
    setLoopFirstTryCorrectEvents(0)
    setLoopTotalScoredEvents(0)
    loopRecordedKeysRef.current = new Set()
  }, [loopScoringActive, loopRangeIdentity])

  /** Clears per-pass loop dedupe and loop-only counters; full-song scoring unchanged. Call when a loop rep completes. */
  const resetLoopPassScoring = useCallback(() => {
    loopRecordedKeysRef.current = new Set()
    setLoopFirstTryCorrectEvents(0)
    setLoopTotalScoredEvents(0)
  }, [])

  const recordEventScoring = useCallback((): boolean => {
    const key = practiceEventKeyRef.current
    if (!key) return false
    if (scoringCommittedForPracticeEventKeyRef.current === key) return false
    scoringCommittedForPracticeEventKeyRef.current = key

    const firstTry = !hadWrongAttemptRef.current
    setTotalScoredEvents((t) => t + 1)
    if (firstTry) {
      setFirstTryCorrectEvents((f) => f + 1)
    }

    if (loopScoringActiveRef.current) {
      if (!loopRecordedKeysRef.current.has(key)) {
        loopRecordedKeysRef.current.add(key)
        setLoopTotalScoredEvents((t) => t + 1)
        if (firstTry) {
          setLoopFirstTryCorrectEvents((f) => f + 1)
        }
      }
    }
    return true
  }, [])

  const resetEngine = useCallback(() => {
    awaitingReleaseRef.current = false
    lastWrongSignatureRef.current = null
    partialPlayedRef.current = new Set()
    prevActiveNotesRef.current = new Set(activeNotesRef.current)
    hadWrongAttemptRef.current = false
    loopRecordedKeysRef.current = new Set()
    scoringCommittedForPracticeEventKeyRef.current = null
    setFeedback('IDLE')
    setMistakes(0)
    setAttemptFeedback({ kind: 'idle' })
    setEventNoteProgress(EMPTY_CURRENT_EVENT_NOTE_PROGRESS)
    setFirstTryCorrectEvents(0)
    setTotalScoredEvents(0)
    setLoopFirstTryCorrectEvents(0)
    setLoopTotalScoredEvents(0)
  }, [])

  // New cursor event: clear partial completion; treat keys already down as not "new" for this target.
  useEffect(() => {
    if (practiceEventKey === lastPracticeEventKeyRef.current) return
    lastPracticeEventKeyRef.current = practiceEventKey
    scoringCommittedForPracticeEventKeyRef.current = null
    partialPlayedRef.current = new Set()
    prevActiveNotesRef.current = new Set(activeNotesRef.current)
    hadWrongAttemptRef.current = false
  }, [practiceEventKey])

  useEffect(() => {
    const prevSnapshot = prevActiveNotesRef.current

    try {
      const expected = [...expectedNotes].sort((a, b) => a - b)
      const pressed = toSortedArray(activeNotes)

      const pressedSig = toSignature(pressed)

      // No target note
      if (expected.length === 0) {
        awaitingReleaseRef.current = false
        lastWrongSignatureRef.current = null
        setFeedback('IDLE')
        setAttemptFeedback({ kind: 'idle' })
        return
      }

      // Waiting for release after a correct match
      if (awaitingReleaseRef.current) {
        if (pressed.length === 0) {
          awaitingReleaseRef.current = false
          lastWrongSignatureRef.current = null
          // If the cursor did not advance (e.g. advance no-op), the event key never changes and
          // partial progress would otherwise stay "complete" — avoid duplicate onCorrectMatch on the next press.
          partialPlayedRef.current = new Set()
          setFeedback('WAITING')
          setAttemptFeedback({ kind: 'idle' })
        } else {
          setFeedback('NEED_RELEASE')
          setAttemptFeedback({ kind: 'correct' })
        }
        return
      }

      // Nothing pressed yet
      if (pressed.length === 0) {
        lastWrongSignatureRef.current = null
        setFeedback('WAITING')
        setAttemptFeedback({ kind: 'idle' })
        return
      }

      const newlyPressed: number[] = []
      for (const n of activeNotes) {
        if (!prevSnapshot.has(n)) newlyPressed.push(n)
      }

      // Single-note target: unchanged (simultaneous exact match + existing wrong feedback).
      if (expected.length === 1) {
        const exactMatch = compareExactMidi(expected, pressed)
        if (DEBUG_CHORD_PROGRESS) {
          logChordProgress('ALIGN', {
            receivedMidi: pressed,
            expectedMidi: expected,
            matched: exactMatch.isExact,
            targetIsMulti: false,
            cursorAdvanced: exactMatch.isExact,
          })
        }
        if (exactMatch.isExact) {
          awaitingReleaseRef.current = true
          lastWrongSignatureRef.current = null
          setFeedback('CORRECT')
          setAttemptFeedback({ kind: 'correct' })
          if (_practiceMode === 'drill' && hintLadderRef.current) {
            hintLadderRef.current.resetHint()
            targetStartTimeRef.current = null
            lastHintLevelRef.current = hintLadderRef.current.hintLevel
          }
          if (recordEventScoring()) {
            onCorrectMatch()
          }
          return
        }

        const expected0 = expected[0] !== undefined ? Math.round(expected[0]) : null
        const anyWrongHeld =
          expected0 !== null && pressed.some((n) => Math.round(n) !== expected0)
        if (anyWrongHeld || newlyPressed.length > 0) {
          hadWrongAttemptRef.current = true
        }

        if (lastWrongSignatureRef.current !== pressedSig) {
          lastWrongSignatureRef.current = pressedSig
          setMistakes((prev) => prev + 1)

          if (_practiceMode === 'drill' && hintLadderRef.current) {
            const now = performance.now()
            const elapsedOnTarget =
              targetStartTimeRef.current != null ? Math.round(now - targetStartTimeRef.current) : 0

            hintLadderRef.current.registerMistake(elapsedOnTarget)

            const level = hintLadderRef.current.hintLevel
            if (level !== lastHintLevelRef.current) {
              lastHintLevelRef.current = level
            }
          }
        }
        if (pressed.length === 1) {
          setAttemptFeedback(evaluateSingleNote(pressed[0], expected[0]))
        } else {
          setAttemptFeedback({ kind: 'wrong' })
        }
        setFeedback('WRONG')
        return
      }

      // Multi-note target: accumulate correct MIDI one key-down at a time (any order).
      const required = new Set(expected.map((n) => Math.round(n)))
      if (newlyPressed.some((m) => !required.has(Math.round(m)))) {
        hadWrongAttemptRef.current = true
      }

      const playedPartial = partialPlayedRef.current
      for (const midi of newlyPressed) {
        const r = Math.round(midi)
        if (required.has(r) && !playedPartial.has(r)) {
          playedPartial.add(r)
        }
      }

      const isComplete = [...required].every((m) => playedPartial.has(m))
      if (DEBUG_CHORD_PROGRESS) {
        logChordProgress('ALIGN', {
          receivedMidi: pressed,
          expectedMidi: expected,
          partialPlayed: toSortedArray(playedPartial),
          matched: isComplete,
          targetIsMulti: true,
          cursorAdvanced: isComplete,
        })
      }

      if (isComplete) {
        awaitingReleaseRef.current = true
        lastWrongSignatureRef.current = null
        setFeedback('CORRECT')
        setAttemptFeedback({ kind: 'correct' })
        if (_practiceMode === 'drill' && hintLadderRef.current) {
          hintLadderRef.current.resetHint()
          targetStartTimeRef.current = null
          lastHintLevelRef.current = hintLadderRef.current.hintLevel
        }
        if (recordEventScoring()) {
          onCorrectMatch()
        }
        return
      }

      const hasWrongHeld = [...activeNotes].some((n) => !required.has(Math.round(n)))
      if (hasWrongHeld) {
        hadWrongAttemptRef.current = true
        if (lastWrongSignatureRef.current !== pressedSig) {
          lastWrongSignatureRef.current = pressedSig
          setMistakes((prev) => prev + 1)

          if (_practiceMode === 'drill' && hintLadderRef.current) {
            const now = performance.now()
            const elapsedOnTarget =
              targetStartTimeRef.current != null ? Math.round(now - targetStartTimeRef.current) : 0

            hintLadderRef.current.registerMistake(elapsedOnTarget)

            const level = hintLadderRef.current.hintLevel
            if (level !== lastHintLevelRef.current) {
              lastHintLevelRef.current = level
            }
          }
        }
        setAttemptFeedback({ kind: 'wrong' })
        setFeedback('WRONG')
        return
      }

      lastWrongSignatureRef.current = null
      setFeedback('WAITING')
      setAttemptFeedback({ kind: 'idle' })
    } finally {
      prevActiveNotesRef.current = new Set(activeNotes)
      const expectedSorted = [...expectedNotes].sort((a, b) => a - b)
      const nextProgress = computeCurrentEventNoteProgress(
        expectedSorted,
        awaitingReleaseRef.current,
        partialPlayedRef.current
      )
      setEventNoteProgress((prev) =>
        prev.isCurrentEventChordLike === nextProgress.isCurrentEventChordLike &&
        midiArraysEqual(prev.currentExpectedMidi, nextProgress.currentExpectedMidi) &&
        midiArraysEqual(prev.currentCompletedMidi, nextProgress.currentCompletedMidi) &&
        midiArraysEqual(prev.currentRemainingMidi, nextProgress.currentRemainingMidi)
          ? prev
          : nextProgress
      )
    }
  }, [activeNotes, expectedNotes, onCorrectMatch, _practiceMode, practiceEventKey, recordEventScoring])

  const fullSongScore100 = score100(firstTryCorrectEvents, totalScoredEvents)
  const loopFirstTryDisplayed = loopScoringActive ? loopFirstTryCorrectEvents : firstTryCorrectEvents
  const loopTotalDisplayed = loopScoringActive ? loopTotalScoredEvents : totalScoredEvents
  const loopScore100 = score100(loopFirstTryDisplayed, loopTotalDisplayed)

  const firstTryScoring: FirstTryScoringSnapshot = {
    firstTryCorrectEvents,
    totalScoredEvents,
    fullSongScore100,
    loopFirstTryCorrectEvents: loopFirstTryDisplayed,
    loopTotalScoredEvents: loopTotalDisplayed,
    loopScore100,
  }

  return {
    feedback,
    mistakes,
    resetEngine,
    resetLoopPassScoring,
    attemptFeedback,
    hintLevel: hintLadderRef.current ? hintLadderRef.current.hintLevel : 'none',
    eventNoteProgress,
    firstTryScoring,
  }
}
