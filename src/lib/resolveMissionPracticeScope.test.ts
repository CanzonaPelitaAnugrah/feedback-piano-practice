import { describe, expect, it } from 'vitest'
import { resolveMissionPracticeScope } from './resolveMissionPracticeScope'

describe('resolveMissionPracticeScope', () => {
  it('maps teacher upper to treble staff with both hands', () => {
    expect(resolveMissionPracticeScope({ handMode: 'upper' })).toEqual({
      staffSelection: 'treble',
      handSelection: 'both',
    })
  })

  it('maps teacher lower to bass staff with both hands', () => {
    expect(resolveMissionPracticeScope({ handMode: 'lower' })).toEqual({
      staffSelection: 'bass',
      handSelection: 'both',
    })
  })

  it('maps teacher both to both staves and both hands', () => {
    expect(resolveMissionPracticeScope({ handMode: 'both' })).toEqual({
      staffSelection: 'both',
      handSelection: 'both',
    })
  })

  it('does not infer right hand from upper or left hand from lower', () => {
    expect(resolveMissionPracticeScope({ handMode: 'upper' }).handSelection).toBe('both')
    expect(resolveMissionPracticeScope({ handMode: 'lower' }).handSelection).toBe('both')
  })
})
