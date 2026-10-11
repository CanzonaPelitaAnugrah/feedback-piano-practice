import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePracticeEngine } from './usePracticeEngine'

function renderEngine(
  initialActive: number[],
  expected: number[],
  practiceEventKey: string | null = 'evt-a',
  onCorrectMatch = vi.fn()
) {
  let active = new Set(initialActive)
  const hook = renderHook(
    ({ notes, exp, key }) =>
      usePracticeEngine(notes, exp, onCorrectMatch, 'regular', key),
    {
      initialProps: {
        notes: active,
        exp: expected,
        key: practiceEventKey,
      },
    }
  )

  const setActive = (midis: number[]) => {
    active = new Set(midis)
    hook.rerender({ notes: active, exp: expected, key: practiceEventKey })
  }

  const setExpected = (midis: number[]) => {
    hook.rerender({ notes: active, exp: midis, key: practiceEventKey })
  }

  const setEventKey = (key: string | null, nextExpected?: number[]) => {
    practiceEventKey = key
    if (nextExpected !== undefined) {
      expected = nextExpected
    }
    hook.rerender({ notes: active, exp: expected, key: practiceEventKey })
  }

  return { ...hook, setActive, setExpected, setEventKey, onCorrectMatch }
}

describe('usePracticeEngine', () => {
  it('marks a single correct note and calls advance once', () => {
    const onCorrect = vi.fn()
    const { result, setActive } = renderEngine([], [60], 'evt-1', onCorrect)

    act(() => setActive([60]))

    expect(result.current.feedback).toBe('CORRECT')
    expect(onCorrect).toHaveBeenCalledTimes(1)
    expect(result.current.firstTryScoring.totalScoredEvents).toBe(1)
    expect(result.current.firstTryScoring.firstTryCorrectEvents).toBe(1)
  })

  it('counts a wrong note and blocks advance', () => {
    const onCorrect = vi.fn()
    const { result, setActive } = renderEngine([], [60], 'evt-1', onCorrect)

    act(() => setActive([62]))

    expect(result.current.feedback).toBe('WRONG')
    expect(result.current.mistakes).toBe(1)
    expect(onCorrect).not.toHaveBeenCalled()
    expect(result.current.firstTryScoring.totalScoredEvents).toBe(0)
  })

  it('treats an extra held note as wrong for a single-note target', () => {
    const onCorrect = vi.fn()
    const { result, setActive } = renderEngine([], [60], 'evt-1', onCorrect)

    act(() => setActive([60, 64]))

    expect(result.current.feedback).toBe('WRONG')
    expect(onCorrect).not.toHaveBeenCalled()
  })

  it('completes a chord in any key order', () => {
    const onCorrect = vi.fn()
    const { result, setActive } = renderEngine([], [60, 64, 67], 'evt-chord', onCorrect)

    act(() => setActive([60]))
    expect(result.current.feedback).toBe('WAITING')
    expect(onCorrect).not.toHaveBeenCalled()

    act(() => setActive([60, 67]))
    expect(result.current.feedback).toBe('WAITING')

    act(() => setActive([60, 64, 67]))
    expect(result.current.feedback).toBe('CORRECT')
    expect(onCorrect).toHaveBeenCalledTimes(1)
  })

  it('requires release-all before accepting the next target', () => {
    const onCorrect = vi.fn()
    const { result, setActive, setEventKey } = renderEngine([], [60], 'evt-1', onCorrect)

    act(() => setActive([60]))
    expect(result.current.feedback).toBe('CORRECT')
    expect(onCorrect).toHaveBeenCalledTimes(1)

    act(() => setEventKey('evt-2', [62]))
    act(() => setActive([60]))
    expect(result.current.feedback).toBe('NEED_RELEASE')

    act(() => setActive([]))
    expect(result.current.feedback).toBe('WAITING')

    act(() => setActive([62]))
    expect(result.current.feedback).toBe('CORRECT')
  })

  it('resets eventNoteProgress when practiceEventKey changes', () => {
    const onCorrect = vi.fn()
    const { result, setActive, setEventKey } = renderEngine([], [60, 64], 'evt-1', onCorrect)

    act(() => setActive([60]))
    expect(result.current.eventNoteProgress.currentCompletedMidi).toEqual([60])
    expect(result.current.eventNoteProgress.currentRemainingMidi).toEqual([64])

    act(() => setEventKey('evt-2'))
    expect(result.current.eventNoteProgress.currentCompletedMidi).toEqual([])
    expect(result.current.eventNoteProgress.currentRemainingMidi).toEqual([60, 64])
    expect(result.current.eventNoteProgress.isCurrentEventChordLike).toBe(true)
  })

  it('dedupes first-try scoring by stable practiceEventKey', () => {
    const onCorrect = vi.fn()
    const { result, setActive } = renderEngine([], [60], 'evt-stable', onCorrect)

    act(() => setActive([60]))
    expect(onCorrect).toHaveBeenCalledTimes(1)
    expect(result.current.firstTryScoring).toMatchObject({
      totalScoredEvents: 1,
      firstTryCorrectEvents: 1,
    })

    act(() => setActive([]))
    act(() => setActive([60]))
    expect(onCorrect).toHaveBeenCalledTimes(1)
    expect(result.current.firstTryScoring).toMatchObject({
      totalScoredEvents: 1,
      firstTryCorrectEvents: 1,
    })
  })

  it('does not count first-try after a wrong attempt on the same event', () => {
    const onCorrect = vi.fn()
    const { result, setActive } = renderEngine([], [60], 'evt-wrong-then-right', onCorrect)

    act(() => setActive([62]))
    expect(result.current.mistakes).toBe(1)

    act(() => setActive([]))
    act(() => setActive([60]))
    expect(onCorrect).toHaveBeenCalledTimes(1)
    expect(result.current.firstTryScoring).toMatchObject({
      totalScoredEvents: 1,
      firstTryCorrectEvents: 0,
    })
  })
})
