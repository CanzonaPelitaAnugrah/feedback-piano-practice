import { describe, expect, it } from 'vitest'
import { shouldAutoAdvanceRest } from './practiceRestPolicy'

describe('practiceRestPolicy', () => {
  it('auto-advances written rests in note-reading modes', () => {
    expect(shouldAutoAdvanceRest('rest')).toBe(true)
  })

  it('does not auto-advance note events', () => {
    expect(shouldAutoAdvanceRest('note')).toBe(false)
    expect(shouldAutoAdvanceRest(null)).toBe(false)
  })
})
