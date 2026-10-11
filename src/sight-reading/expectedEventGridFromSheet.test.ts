import { describe, expect, it } from 'vitest'
import {
  buildExpectedEventId,
  buildExpectedEventGridFromMusicSheet,
  deriveStaffRole,
  filterSlicePitches,
  type PitchAtSlice,
} from './expectedEventGridFromSheet'
import {
  buildMockMusicSheet,
  DUAL_STAFF_INDICES,
  DUAL_STAFF_LAYOUT,
  mockPitchNote,
  mockRestNote,
  mockSourceMeasure,
  mockStaffEntry,
  mockVerticalContainer,
  mockVoiceEntry,
  STAFF_LOWER_ID,
  STAFF_UPPER_ID,
} from './__fixtures__/mockMusicSheet'

const gridOpts = {
  sortedStaffIndices: DUAL_STAFF_INDICES,
  staffVerticalLayout: DUAL_STAFF_LAYOUT,
  focusMeasureRange: null as { from: number; to: number } | null,
}

function buildGrid(
  measures: unknown[],
  staffSelection: 'treble' | 'bass' | 'both',
  handSelection: 'left' | 'right' | 'both' = 'both'
) {
  return buildExpectedEventGridFromMusicSheet(buildMockMusicSheet(measures), {
    ...gridOpts,
    staffSelection,
    handSelection,
  })
}

describe('buildExpectedEventId', () => {
  it('is stable for the same measure and beat', () => {
    const parts = { measureIndex: 2, absoluteQuarterBeat: 1.5 }
    expect(buildExpectedEventId(parts)).toBe(buildExpectedEventId(parts))
    expect(buildExpectedEventId(parts)).toBe('m2_q1.5')
  })
})

describe('deriveStaffRole', () => {
  it('maps layout staff ids to upper and lower roles', () => {
    expect(deriveStaffRole(STAFF_UPPER_ID, DUAL_STAFF_INDICES, DUAL_STAFF_LAYOUT)).toBe('upper')
    expect(deriveStaffRole(STAFF_LOWER_ID, DUAL_STAFF_INDICES, DUAL_STAFF_LAYOUT)).toBe('lower')
  })
})

describe('filterSlicePitches', () => {
  const pitches: PitchAtSlice[] = [
    { midi: 60, staffRole: 'upper', sourceStaffId: STAFF_UPPER_ID },
    { midi: 48, staffRole: 'lower', sourceStaffId: STAFF_LOWER_ID },
  ]

  it('keeps only upper staff when treble-only', () => {
    const out = filterSlicePitches(pitches, 'treble', undefined, DUAL_STAFF_INDICES, DUAL_STAFF_LAYOUT)
    expect(out.map((p) => p.midi)).toEqual([60])
  })

  it('keeps only lower staff when bass-only', () => {
    const out = filterSlicePitches(pitches, 'bass', undefined, DUAL_STAFF_INDICES, DUAL_STAFF_LAYOUT)
    expect(out.map((p) => p.midi)).toEqual([48])
  })

  it('keeps both staves when staff selection is both', () => {
    const out = filterSlicePitches(pitches, 'both', undefined, DUAL_STAFF_INDICES, DUAL_STAFF_LAYOUT)
    expect(out.map((p) => p.midi).sort((a, b) => a - b)).toEqual([48, 60])
  })

  it('filters by hand only when both staves are active', () => {
    const rightOnly = filterSlicePitches(pitches, 'both', 'right', DUAL_STAFF_INDICES, DUAL_STAFF_LAYOUT)
    expect(rightOnly.map((p) => p.midi)).toEqual([60])

    const leftOnly = filterSlicePitches(pitches, 'both', 'left', DUAL_STAFF_INDICES, DUAL_STAFF_LAYOUT)
    expect(leftOnly.map((p) => p.midi)).toEqual([48])
  })

  it('does not apply hand filter when a single staff is selected', () => {
    const trebleWithLeftHand = filterSlicePitches(
      pitches,
      'treble',
      'left',
      DUAL_STAFF_INDICES,
      DUAL_STAFF_LAYOUT
    )
    expect(trebleWithLeftHand.map((p) => p.midi)).toEqual([60])
  })
})

describe('buildExpectedEventGridFromMusicSheet', () => {
  it('produces stable event ids for identical positions and pitches', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 67, staffId: STAFF_UPPER_ID })])]),
        ]),
        mockVerticalContainer(1, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 67, staffId: STAFF_UPPER_ID })])]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'both')
    const noteEvents = grid.events.filter((e) => e.kind === 'note')
    expect(noteEvents).toHaveLength(2)
    expect(noteEvents[0]!.id).toMatch(/^m0_q0:s0:p:67$/)
    expect(noteEvents[1]!.id).toMatch(/^m0_q1:s0:p:67$/)
    expect(noteEvents[0]!.id).not.toBe(noteEvents[1]!.id)
  })

  it('treble-only omits lower-staff notes', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 72, staffId: STAFF_UPPER_ID })])]),
          mockStaffEntry(STAFF_LOWER_ID, [mockVoiceEntry([mockPitchNote({ midi: 50, staffId: STAFF_LOWER_ID })])]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'treble')
    expect(grid.events).toHaveLength(1)
    expect(grid.events[0]!.expectedMidi).toEqual([72])
  })

  it('bass-only omits upper-staff notes', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 72, staffId: STAFF_UPPER_ID })])]),
          mockStaffEntry(STAFF_LOWER_ID, [mockVoiceEntry([mockPitchNote({ midi: 50, staffId: STAFF_LOWER_ID })])]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'bass')
    expect(grid.events).toHaveLength(1)
    expect(grid.events[0]!.expectedMidi).toEqual([50])
  })

  it('both-staff includes notes from upper and lower', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 72, staffId: STAFF_UPPER_ID })])]),
          mockStaffEntry(STAFF_LOWER_ID, [mockVoiceEntry([mockPitchNote({ midi: 50, staffId: STAFF_LOWER_ID })])]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'both')
    expect(grid.events).toHaveLength(1)
    expect(grid.events[0]!.expectedMidi).toEqual([50, 72])
  })

  it('skips slices with no pitches and no written rest', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 60, staffId: STAFF_UPPER_ID })])]),
        ]),
        mockVerticalContainer(1, []),
      ]),
    ]
    const grid = buildGrid(measures, 'both')
    expect(grid.events).toHaveLength(1)
  })

  it('emits rest events that do not require keyboard input', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockRestNote(STAFF_UPPER_ID)])]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'both')
    expect(grid.events).toHaveLength(1)
    expect(grid.events[0]).toMatchObject({
      kind: 'rest',
      expectedMidi: [],
      requiresKeyboardInput: false,
    })
    expect(grid.events[0]!.id).toContain(':rest')
  })

  it('merges chord tones at the same slice into one event', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [
            mockVoiceEntry([
              mockPitchNote({ midi: 60, staffId: STAFF_UPPER_ID }),
              mockPitchNote({ midi: 64, staffId: STAFF_UPPER_ID }),
            ]),
          ]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'both')
    expect(grid.events).toHaveLength(1)
    expect(grid.events[0]!.expectedMidi).toEqual([60, 64])
    expect(grid.events[0]!.practiceNotes).toHaveLength(2)
  })

  it('omits tie continuations and keeps only the tie start', () => {
    const start = mockPitchNote({ midi: 60, staffId: STAFF_UPPER_ID })
    const cont = mockPitchNote({ midi: 60, staffId: STAFF_UPPER_ID, tieContinuation: true })
    ;(cont as { NoteTie: { StartNote: unknown } }).NoteTie = { StartNote: start }

    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([start])]),
        ]),
        mockVerticalContainer(1, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([cont])]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'both')
    const notes = grid.events.filter((e) => e.kind === 'note')
    expect(notes).toHaveLength(1)
    expect(notes[0]!.expectedMidi).toEqual([60])
  })

  it('collects two voices on the same staff at one slice', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [
            mockVoiceEntry([mockPitchNote({ midi: 60, staffId: STAFF_UPPER_ID })]),
            mockVoiceEntry([mockPitchNote({ midi: 67, staffId: STAFF_UPPER_ID })]),
          ]),
        ]),
      ]),
    ]
    const grid = buildGrid(measures, 'both')
    expect(grid.events).toHaveLength(1)
    expect(grid.events[0]!.expectedMidi).toEqual([60, 67])
  })

  it('respects focus measure boundaries (1-based)', () => {
    const measures = [
      mockSourceMeasure(0, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 60, staffId: STAFF_UPPER_ID })])]),
        ]),
      ]),
      mockSourceMeasure(1, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 62, staffId: STAFF_UPPER_ID })])]),
        ]),
      ]),
      mockSourceMeasure(2, [
        mockVerticalContainer(0, [
          mockStaffEntry(STAFF_UPPER_ID, [mockVoiceEntry([mockPitchNote({ midi: 64, staffId: STAFF_UPPER_ID })])]),
        ]),
      ]),
    ]
    const grid = buildExpectedEventGridFromMusicSheet(buildMockMusicSheet(measures), {
      ...gridOpts,
      staffSelection: 'both',
      handSelection: 'both',
      focusMeasureRange: { from: 2, to: 2 },
    })
    expect(grid.events).toHaveLength(1)
    expect(grid.events[0]!.expectedMidi).toEqual([62])
    expect(grid.events[0]!.position.measureIndex).toBe(1)
  })
})
