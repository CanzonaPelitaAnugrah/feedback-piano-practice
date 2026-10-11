import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { shouldAutoAdvanceRest } from '../lib/practiceRestPolicy'
import { usePracticeEngine } from './usePracticeEngine'
import type { FocusBeatRange } from './useOsmdScore'
import type { PracticeMode } from '../lib/trainerTypes'

export type SightReadingCursorMeta = {
  cursorStep: number | null
  eventIndex: number | null
  practiceEventKey: string | null
  gridKind: 'note' | 'rest' | null
  requiresKeyboardInput: boolean
}

/**
 * Orchestrates note-reading practice scoring, segment loop bookkeeping, and silent advance over rest beats.
 */
export function useSightReadingSession(opts: {
  wrapLoopSegmentAtEndRef: MutableRefObject<boolean>
  combinedNotes: Set<number>
  expectedNotes: number[]
  onAdvanceAfterCorrect: () => void
  practiceMode: PracticeMode
  practiceCursorMeta: SightReadingCursorMeta
  loopOn: boolean
  loopMeasureStart: number
  loopMeasureEnd: number
  focusRange: FocusBeatRange | null
}) {
  const practiceEventKey = useMemo(
    () =>
      opts.practiceCursorMeta.practiceEventKey ??
      (opts.practiceCursorMeta.cursorStep != null &&
      opts.practiceCursorMeta.eventIndex != null
        ? `${opts.practiceCursorMeta.cursorStep}:${opts.practiceCursorMeta.eventIndex}`
        : null),
    [
      opts.practiceCursorMeta.practiceEventKey,
      opts.practiceCursorMeta.cursorStep,
      opts.practiceCursorMeta.eventIndex,
    ]
  )

  const loopScoringActive = opts.loopOn && opts.focusRange != null
  const loopRangeIdentity = opts.loopOn ? `${opts.loopMeasureStart}:${opts.loopMeasureEnd}` : null
  opts.wrapLoopSegmentAtEndRef.current = loopScoringActive

  const practiceEngine = usePracticeEngine(
    opts.combinedNotes,
    opts.expectedNotes,
    opts.onAdvanceAfterCorrect,
    opts.practiceMode,
    practiceEventKey,
    loopScoringActive,
    loopRangeIdentity
  )

  const lastRestAdvanceKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const key = practiceEventKey
    if (!key || !shouldAutoAdvanceRest(opts.practiceCursorMeta.gridKind)) return
    if (lastRestAdvanceKeyRef.current === key) return
    lastRestAdvanceKeyRef.current = key

    let cancelled = false
    const id = requestAnimationFrame(() => {
      if (!cancelled) opts.onAdvanceAfterCorrect()
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [practiceEventKey, opts.practiceCursorMeta.gridKind, opts.onAdvanceAfterCorrect])

  useEffect(() => {
    if (!shouldAutoAdvanceRest(opts.practiceCursorMeta.gridKind)) {
      lastRestAdvanceKeyRef.current = null
    }
  }, [opts.practiceCursorMeta.gridKind, practiceEventKey])

  return {
    practiceEventKey,
    loopScoringActive,
    loopRangeIdentity,
    ...practiceEngine,
  }
}
