/**
 * Read one OSMD cursor timestep into the same vertical-slice shape the sheet grid uses
 * (plus iterator anchors for rests where NotesUnderCursor is empty).
 */

import { getMidiFromNote } from '../lib/osmdToMidi'
import type { HandSelection, StaffSelection } from '../lib/trainerTypes'
import {
  deriveStaffRole,
  filterSlicePitches,
  sliceFingerprintFromPractice,
  type ExpectedGridEvent,
  type PitchAtSlice,
  type StaffVerticalLayoutIds,
} from './expectedEventGridFromSheet'

const BEAT_EPS = 1e-3

export type CursorWithIteratorLike = {
  NotesUnderCursor?: () => unknown[]
  Iterator?: {
    CurrentMeasureIndex?: number
    CurrentEnrolledTimestamp?: { RealValue: number }
    currentTimeStamp?: { RealValue: number }
    EndReached?: boolean
  }
  reset?: () => void
  next?: () => void
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

function gatherFromSourceNotes(
  notes: unknown[],
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): { pitched: PitchAtSlice[]; hasWrittenRest: boolean } {
  const pitched: PitchAtSlice[] = []
  let hasWrittenRest = false

  for (const n of notes) {
    if (!tieIsPlayableStart(n)) continue
    if ((n as { IsCueNote?: boolean }).IsCueNote) continue
    if ((n as { PrintObject?: boolean }).PrintObject === false) continue

    const isRest =
      typeof (n as { isRest?: () => boolean }).isRest === 'function' && (n as { isRest: () => boolean }).isRest()

    const staffId = (n as { ParentStaff?: { Id?: number } }).ParentStaff?.Id
    let role = deriveStaffRole(
      typeof staffId === 'number' && Number.isFinite(staffId) ? staffId : undefined,
      sortedStaffIndices,
      layout
    )
    if (role === undefined && typeof staffId === 'number' && sortedStaffIndices.length <= 1) role = 'single'

    if (isRest) {
      hasWrittenRest = true
      continue
    }

    const midi = getMidiFromNote(n)
    if (midi === null || typeof staffId !== 'number' || !Number.isFinite(staffId) || role === undefined) continue

    pitched.push({ midi, staffRole: role, sourceStaffId: staffId })
  }

  return { pitched, hasWrittenRest }
}

export type LiveSliceSnapshot = {
  midis: number[]
  kind: 'note' | 'rest'
}

/** Staff/hand filters must match the grid build (see `buildExpectedEventGridFromMusicSheet`). */

export function liveSliceFromOsmdCursor(
  cursor: CursorWithIteratorLike,
  staffSelection: StaffSelection,
  handSelection: HandSelection,
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): LiveSliceSnapshot | null {
  const raw = cursor.NotesUnderCursor?.()
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null

  const handFilter: HandSelection | undefined = staffSelection === 'both' ? handSelection : undefined

  const { pitched, hasWrittenRest } = gatherFromSourceNotes(raw, sortedStaffIndices, layout)
  const filtered = filterSlicePitches(pitched, staffSelection, handFilter, sortedStaffIndices, layout)
  const midis = Array.from(new Set(filtered.map((p) => p.midi))).sort((a, b) => a - b)

  if (midis.length > 0) return { midis, kind: 'note' }
  if (hasWrittenRest) return { midis: [], kind: 'rest' }
  return null
}

export function cursorIteratorBeatMatchesSheet(
  iterator: CursorWithIteratorLike['Iterator'],
  position: { measureIndex: number; absoluteQuarterBeat: number }
): boolean {
  if (!iterator || iterator.CurrentMeasureIndex === undefined) return false
  if (iterator.CurrentMeasureIndex !== position.measureIndex) return false
  const b1 = iterator.CurrentEnrolledTimestamp?.RealValue
  const b2 = iterator.currentTimeStamp?.RealValue
  const beat =
    typeof b1 === 'number' && Number.isFinite(b1) ? b1 : typeof b2 === 'number' && Number.isFinite(b2) ? b2 : null
  if (beat === null) return false
  return Math.abs(beat - position.absoluteQuarterBeat) < BEAT_EPS
}

export function cursorMatchesGridEvent(
  cursor: CursorWithIteratorLike,
  ev: ExpectedGridEvent,
  staffSelection: StaffSelection,
  handSelection: HandSelection,
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): boolean {
  if (!cursorIteratorBeatMatchesSheet(cursor.Iterator, ev.position)) return false

  const slice = liveSliceFromOsmdCursor(cursor, staffSelection, handSelection, sortedStaffIndices, layout)

  if (ev.kind === 'note') {
    if (!slice || slice.kind !== 'note') return false
    return (
      sliceFingerprintFromPractice(slice.midis, 'note') === sliceFingerprintFromPractice(ev.expectedMidi, 'note')
    )
  }

  if (slice?.kind === 'note') return false
  if (slice?.kind === 'rest')
    return sliceFingerprintFromPractice([], 'rest') === sliceFingerprintFromPractice(ev.expectedMidi, 'rest')
  return true
}

export function attachOsmdSeekStepsForGrid(
  events: ExpectedGridEvent[],
  cursor: CursorWithIteratorLike & { reset?: () => void; next?: () => void },
  staffSelection: StaffSelection,
  handSelection: HandSelection,
  sortedStaffIndices: number[],
  layout: StaffVerticalLayoutIds | null
): number[] {
  const steps = events.map(() => -1)
  try {
    cursor.reset?.()
  } catch {
    return steps
  }

  let gi = 0
  let step = 0
  const maxSteps = 500000

  for (;;) {
    if (gi >= events.length) break

    if (
      cursorMatchesGridEvent(cursor, events[gi]!, staffSelection, handSelection, sortedStaffIndices, layout)
    ) {
      steps[gi] = step
      gi++
    }

    if (cursor.Iterator?.EndReached) break
    if (step++ > maxSteps) break

    try {
      cursor.next?.()
    } catch {
      break
    }
  }

  try {
    cursor.reset?.()
  } catch {
    // ignore
  }

  return steps
}
