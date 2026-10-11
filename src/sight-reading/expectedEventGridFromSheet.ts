/**
 * Canonical note-reading grid from OSMD MusicSheet (parsed MusicXML).
 * Independent of rendering, DOM, or OSMD cursor index.
 */

import type { MusicSheet as MusicSheetEntity, Staff } from 'opensheetmusicdisplay'
import { getMidiFromNote } from '../lib/osmdToMidi'
import type { HandSelection, PracticeNote, StaffRole, StaffSelection } from '../lib/trainerTypes'

export type FocusMeasureRangeOneBased = { from: number; to: number }

export type ExpectedGridEventKind = 'note' | 'rest'

export type MusicalPositionKeyParts = {
  measureIndex: number
  absoluteQuarterBeat: number
}

export function buildExpectedEventId(parts: MusicalPositionKeyParts): string {
  const b = Number(parts.absoluteQuarterBeat.toFixed(6))
  return `m${parts.measureIndex}_q${b}`
}

export type StaffVerticalLayoutIds = {
  upperStaffId: number
  lowerStaffId: number
}

function getStaffId(note: unknown, staffEntryParent: Staff | unknown): number | undefined {
  try {
    const fromNote = (note as { ParentStaff?: { Id?: number } }).ParentStaff?.Id
    if (typeof fromNote === 'number' && Number.isFinite(fromNote)) return fromNote
  } catch {
    // ignore
  }
  try {
    const fromEntry = (staffEntryParent as { Id?: number }).Id
    if (typeof fromEntry === 'number' && Number.isFinite(fromEntry)) return fromEntry
  } catch {
    // ignore
  }
  return undefined
}

function getSortedStaffIdsFromInstrument(note: unknown): number[] | undefined {
  try {
    const staves = (note as { ParentStaff?: { ParentInstrument?: { Staves?: Array<{ Id?: number }> } } })
      .ParentStaff?.ParentInstrument?.Staves
    if (!Array.isArray(staves) || staves.length === 0) return undefined
    const ids = staves.map((s) => s.Id).filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
    if (ids.length === 0) return undefined
    return [...new Set(ids)].sort((a, b) => a - b)
  } catch {
    return undefined
  }
}

export function deriveStaffRole(
  staffId: number | undefined,
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): StaffRole | undefined {
  if (sortedStaffIndices.length < 2) {
    return staffId !== undefined ? 'single' : undefined
  }
  if (staffId === undefined) return undefined
  if (layout) {
    if (staffId === layout.upperStaffId) return 'upper'
    if (staffId === layout.lowerStaffId) return 'lower'
    return undefined
  }
  if (sortedStaffIndices[0] === staffId) return 'upper'
  if (sortedStaffIndices.length >= 2 && sortedStaffIndices[1] === staffId) return 'lower'
  return undefined
}

function inferHandFromStaffRole(
  role: StaffRole | undefined,
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): 'left' | 'right' | undefined {
  if (!role || role === 'single') return undefined
  if (sortedStaffIndices.length < 2) return undefined
  if (layout) return role === 'upper' ? 'right' : 'left'
  return role === 'upper' ? 'right' : 'left'
}

function tieIsPlayableStart(note: unknown): boolean {
  try {
    const tie = (note as { NoteTie?: { StartNote?: unknown } }).NoteTie
    if (!tie) return true
    return tie.StartNote === note
  } catch {
    return true
  }
}

export type PitchAtSlice = {
  midi: number
  staffRole: StaffRole
  sourceStaffId: number
}

export function filterSlicePitches(
  pitches: PitchAtSlice[],
  staffSelection: StaffSelection,
  handFilter: HandSelection | undefined,
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): PitchAtSlice[] {
  let out = pitches
  const multi = sortedStaffIndices.length >= 2

  if (multi && staffSelection === 'treble') {
    out = out.filter((p) => p.staffRole === 'upper')
  } else if (multi && staffSelection === 'bass') {
    out = out.filter((p) => p.staffRole === 'lower')
  }

  if (multi && staffSelection === 'both' && handFilter != null && handFilter !== 'both') {
    out = out.filter((p) => {
      const inferred = inferHandFromStaffRole(p.staffRole, sortedStaffIndices, layout)
      if (inferred === undefined) return true
      return inferred === handFilter
    })
  }

  return out
}

function collectSlice(
  container: {
    StaffEntries?: unknown[]
    getAbsoluteTimestamp?: () => { RealValue: number }
  },
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): { absoluteQuarterBeat: number; pitched: PitchAtSlice[]; hasWrittenRest: boolean } | null {
  let absQuarter: number | null = null
  try {
    const f = container.getAbsoluteTimestamp?.()
    if (typeof f?.RealValue === 'number' && Number.isFinite(f.RealValue)) absQuarter = f.RealValue
  } catch {
    absQuarter = null
  }
  if (absQuarter === null) return null

  const pitched: PitchAtSlice[] = []
  let hasWrittenRest = false

  const entries = container.StaffEntries
  if (!Array.isArray(entries)) return null

  for (const staffEntry of entries) {
    if (!staffEntry) continue
    const parentStaff = (staffEntry as { ParentStaff?: Staff }).ParentStaff
    const ves = (staffEntry as { VoiceEntries?: unknown[] }).VoiceEntries
    if (!Array.isArray(ves)) continue

    for (const ve of ves) {
      const notes = (ve as { Notes?: unknown[]; IsGrace?: boolean }).Notes
      if (!Array.isArray(notes)) continue
      if ((ve as { IsGrace?: boolean }).IsGrace) continue

      for (const n of notes) {
        if (!tieIsPlayableStart(n)) continue
        if ((n as { IsCueNote?: boolean }).IsCueNote) continue
        if ((n as { PrintObject?: boolean }).PrintObject === false) continue

        const isRest =
          typeof (n as { isRest?: () => boolean }).isRest === 'function' && (n as { isRest: () => boolean }).isRest()

        const staffId = getStaffId(n, parentStaff ?? null) ?? getSortedStaffIdsFromInstrument(n)?.[0]

        let role = deriveStaffRole(staffId, sortedStaffIndices, layout)
        if (role === undefined && staffId !== undefined && sortedStaffIndices.length <= 1) role = 'single'

        if (isRest) {
          hasWrittenRest = true
          continue
        }

        const midi = getMidiFromNote(n)
        if (midi === null || staffId === undefined || role === undefined) continue

        pitched.push({ midi, staffRole: role, sourceStaffId: staffId })
      }
    }
  }

  return { absoluteQuarterBeat: absQuarter, pitched, hasWrittenRest }
}

function buildPracticeNotes(pitches: PitchAtSlice[], measureIndex: number): PracticeNote[] {
  return pitches.map((p) => ({
    midi: p.midi,
    partIndex: 0,
    rawStaffIndex: p.sourceStaffId,
    staffIndex: p.sourceStaffId,
    sourceStaffId: p.sourceStaffId,
    measureIndex,
    staffRole: p.staffRole,
  }))
}

export type ExpectedGridEvent = {
  readonly id: string
  readonly kind: ExpectedGridEventKind
  readonly position: MusicalPositionKeyParts
  readonly expectedMidi: number[]
  readonly practiceNotes: PracticeNote[]
  /** False for explicit rests — session layer may auto-advance without keyboard input. */
  readonly requiresKeyboardInput: boolean
}

export type ExpectedEventGrid = {
  readonly events: ExpectedGridEvent[]
}

export function buildExpectedEventGridFromMusicSheet(
  sheet: MusicSheetEntity,
  opts: {
    staffSelection: StaffSelection
    handSelection: HandSelection
    sortedStaffIndices: number[]
    staffVerticalLayout: StaffVerticalLayoutIds | null
    focusMeasureRange: FocusMeasureRangeOneBased | null
  }
): ExpectedEventGrid {
  const measures = sheet.SourceMeasures
  if (!Array.isArray(measures)) return { events: [] }

  const { staffSelection, handSelection, sortedStaffIndices, staffVerticalLayout, focusMeasureRange } = opts

  const handFilter: HandSelection | undefined = staffSelection === 'both' ? handSelection : undefined

  const events: ExpectedGridEvent[] = []

  const seenKeys = new Map<string, number>()

  for (const measure of measures) {
    const mIdx = measure.measureListIndex

    if (focusMeasureRange) {
      const fromIdx = focusMeasureRange.from - 1
      const toIdx = focusMeasureRange.to - 1
      if (mIdx < fromIdx || mIdx > toIdx) continue
    }

    const containers = measure.VerticalSourceStaffEntryContainers
    if (!Array.isArray(containers)) continue

    for (const container of containers) {
      const raw = collectSlice(container as Parameters<typeof collectSlice>[0], sortedStaffIndices, staffVerticalLayout)
      if (!raw) continue

      const filteredPitches = filterSlicePitches(
        raw.pitched,
        staffSelection,
        handFilter,
        sortedStaffIndices,
        staffVerticalLayout
      )

      const midis = Array.from(new Set(filteredPitches.map((p) => p.midi))).sort((a, b) => a - b)

      let kind: ExpectedGridEventKind
      let requiresKeyboardInput: boolean
      let practiceNotes: PracticeNote[]

      if (midis.length > 0) {
        kind = 'note'
        requiresKeyboardInput = true
        practiceNotes = buildPracticeNotes(filteredPitches, mIdx)
      } else if (raw.hasWrittenRest) {
        kind = 'rest'
        requiresKeyboardInput = false
        practiceNotes = []
      } else {
        continue
      }

      const position: MusicalPositionKeyParts = {
        measureIndex: mIdx,
        absoluteQuarterBeat: raw.absoluteQuarterBeat,
      }
      const base = buildExpectedEventId(position)
      const disamb = seenKeys.get(base) ?? 0
      seenKeys.set(base, disamb + 1)

      const tail = midis.length > 0 ? `p:${midis.join(',')}` : 'rest'
      const id = `${base}:s${disamb}:${tail}`

      events.push({
        id,
        kind,
        position,
        expectedMidi: midis,
        practiceNotes,
        requiresKeyboardInput,
      })
    }
  }

  return { events }
}

export function sliceFingerprintFromPractice(midis: number[], kind: ExpectedGridEventKind): string {
  const sorted = [...midis].sort((a, b) => a - b)
  return `${kind}:${sorted.join(',')}`
}
