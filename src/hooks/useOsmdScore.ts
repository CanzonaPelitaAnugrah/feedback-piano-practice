import type { CSSProperties, RefObject } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { DEBUG_OSMD_SCORE, logOsmd, tableOsmd, warnOsmd } from '../lib/debugOsmdScore'
import { getMidiFromNote, getOsmdHalfToneRaw } from '../lib/osmdToMidi'
import { getNoteName } from '../lib/midiUtils'
import type {
  HandMode,
  PracticeNote,
  StaffFilteredPlayableEvent,
  StaffRole,
  StaffSelection,
} from '../lib/trainerTypes'
import { buildExpectedEventGridFromMusicSheet } from '../sight-reading/expectedEventGridFromSheet'
import { attachOsmdSeekStepsForGrid } from '../sight-reading/osmdLiveSlice'

/** Inclusive sheet time window from OSMD source measures (fractional quarter-note units, `Fraction.RealValue`). */
export type FocusBeatRange = { startBeat: number; endBeat: number }

type FocusMeasureRange1Based = { from: number; to: number }

function clampHumanMeasureRange(from: number, to: number): { from: number; to: number } {
  const a = Math.round(from)
  const b = Math.round(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { from: 1, to: 1 }
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

function getBeatRangeForMeasuresOnSheet(
  osmd: OpenSheetMusicDisplay,
  fromBar1: number,
  toBar1: number
): FocusBeatRange | null {
  const sheet = (osmd as { Sheet?: { SourceMeasures?: unknown[] } }).Sheet
  const measures = sheet?.SourceMeasures
  if (!Array.isArray(measures) || measures.length === 0) return null
  const { from: a, to: b } = clampHumanMeasureRange(fromBar1, toBar1)
  const fromIdx = Math.max(0, a - 1)
  const toIdx = Math.max(0, b - 1)
  if (fromIdx >= measures.length || toIdx >= measures.length) return null
  const startM = measures[fromIdx] as { AbsoluteTimestamp?: { RealValue: number } }
  const endM = measures[toIdx] as { AbsoluteTimestamp?: { RealValue: number }; Duration?: { RealValue: number } }
  const ts = startM.AbsoluteTimestamp?.RealValue
  const endTs = endM.AbsoluteTimestamp?.RealValue
  const dur = endM.Duration?.RealValue
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  if (typeof endTs !== 'number' || !Number.isFinite(endTs)) return null
  if (typeof dur !== 'number' || !Number.isFinite(dur)) return null
  return { startBeat: ts, endBeat: endTs + dur }
}



export type StaffAvailability = {
  /** Extracted notes include an upper staff role. */
  hasUpper: boolean
  /** Extracted notes include a lower staff role. */
  hasLower: boolean
  /** Extracted notes only ever expose a single staff. */
  isSingleStaff: boolean
  /** Staff metadata was not reliably available from extracted notes. */
  isUnknown: boolean
}

type OsmdIteratorLike = { EndReached?: boolean; CurrentMeasureIndex?: number }

/** Minimal cursor shape for note/staff access. OSMD Cursor has NotesUnderCursor() and GNotesUnderCursor() returning GraphicalNote[] (sourceNote, staffLine). */
type CursorLike = {
  NotesUnderCursor?: () => unknown[]
  GNotesUnderCursor?: () => Array<{ sourceNote: unknown; staffLine?: number; handHint?: string }>
  Iterator?: OsmdIteratorLike
}

/** Maps source staff ids to upper (top of rendered score) vs lower (bottom) using graphical Y, not id order or pitch. */
type StaffVerticalLayout = { upperStaffId: number; lowerStaffId: number }

/**
 * One note from GNotesUnderCursor (GraphicalNote). staffLine is OSMD's index; source staff id prefers ParentStaff.Id.
 * handHint: if present from OSMD/source; staff/hand filtering for practice events is resolved in `expectedEventGridFromSheet`.
 */
type GNote = { sourceNote: unknown; staffLine?: number; handHint?: string }

/**
 * Stable source-model staff id: OSMD `Note.ParentStaff.Id` (same logical staff across systems).
 * Prefer this over `GraphicalNote.staffLine` (layout-local / system-global line index).
 */
function getSourceStaffIdFromSourceNote(note: unknown): number | undefined {
  try {
    const staff = (note as { ParentStaff?: { Id?: number } }).ParentStaff
    const id = staff?.Id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  } catch {
    // ignore
  }
  return undefined
}

function getSourceStaffIdFromGNoteGraphicalChain(g: GNote & Record<string, unknown>): number | undefined {
  try {
    const sse = (
      g as {
        parentVoiceEntry?: { parentStaffEntry?: { sourceStaffEntry?: { ParentStaff?: { Id?: number } } } }
      }
    ).parentVoiceEntry?.parentStaffEntry?.sourceStaffEntry
    const id = sse?.ParentStaff?.Id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  } catch {
    // ignore
  }
  return undefined
}

/** OSMD GraphicalNote / BoundingBox: smaller Y is higher on the page → top staff. */
function getGraphicalNoteAbsoluteY(g: unknown): number | undefined {
  try {
    const y = (g as { PositionAndShape?: { AbsolutePosition?: { y?: number } } }).PositionAndShape?.AbsolutePosition?.y
    if (typeof y === 'number' && Number.isFinite(y)) return y
  } catch {
    // ignore
  }
  return undefined
}

function getStaffIndexFromGNote(g: GNote & Record<string, unknown>): number | undefined {
  if (g.sourceNote != null) {
    const sid = getSourceStaffIdFromSourceNote(g.sourceNote)
    if (sid !== undefined) return sid
  }
  const fromChain = getSourceStaffIdFromGNoteGraphicalChain(g)
  if (fromChain !== undefined) return fromChain
  if (typeof g.staffLine === 'number' && Number.isFinite(g.staffLine)) return g.staffLine
  const sl = (g as { StaffLine?: number }).StaffLine
  if (typeof sl === 'number' && Number.isFinite(sl)) return sl
  try {
    const pve = (g as { parentVoiceEntry?: { parentStaffEntry?: { parentMeasure?: { ParentStaffLine?: unknown; ParentMusicSystem?: { StaffLines?: unknown[] } } } } }).parentVoiceEntry
    const pse = pve?.parentStaffEntry
    const pm = pse?.parentMeasure
    const staffLine = pm?.ParentStaffLine
    const system = pm?.ParentMusicSystem
    const lines = system?.StaffLines
    if (Array.isArray(lines) && staffLine != null) {
      const idx = lines.indexOf(staffLine)
      if (idx >= 0) return idx
    }
  } catch {
    // ignore
  }
  return undefined
}

/** Get short pitch label from source note (for audit logging). */
function getNoteLabel(note: unknown): string {
  const n = note as {
    TransposedPitch?: { ToStringShort?: (o?: number) => string }
    Pitch?: { ToStringShort?: (o?: number) => string }
  }
  return (
    (typeof n?.TransposedPitch?.ToStringShort === 'function' ? n.TransposedPitch.ToStringShort(1) : undefined) ??
    (typeof n?.Pitch?.ToStringShort === 'function' ? n.Pitch.ToStringShort(1) : undefined) ??
    '?'
  )
}

/**
 * staffRole from rendered top-to-bottom staff order (see StaffVerticalLayout), not from MIDI pitch.
 * If layout is missing, fall back to ascending source staff id: smaller id → upper, next → lower.
 */
function getStaffRoleFromStructure(
  staffId: number | undefined,
  isMultiStaff: boolean,
  layout: StaffVerticalLayout | null,
  sortedStaffIds: number[]
): StaffRole | undefined {
  if (!isMultiStaff) return 'single'
  if (staffId === undefined) return undefined
  if (layout) {
    if (staffId === layout.upperStaffId) return 'upper'
    if (staffId === layout.lowerStaffId) return 'lower'
    return undefined
  }
  if (sortedStaffIds[0] === staffId) return 'upper'
  if (sortedStaffIds.length >= 2 && sortedStaffIds[1] === staffId) return 'lower'
  return undefined
}

type PracticeNoteWithSource = { practiceNote: PracticeNote; sourceNote: unknown }

/** First 20 practice notes per playable-event rebuild (OSMD raw halfTone vs MIDI pipeline). */
const MIDI_PIPELINE_AUDIT_MAX = 20
let midiPipelineAuditRows: Array<Record<string, string | number | null | undefined>> | null = null

function resetMidiPipelineAudit(): void {
  midiPipelineAuditRows = []
}

function recordMidiPipelineAuditRow(practiceNote: PracticeNote, sourceNote: unknown): void {
  if (!midiPipelineAuditRows || midiPipelineAuditRows.length >= MIDI_PIPELINE_AUDIT_MAX) return
  const pitch = (sourceNote as { Pitch?: { FundamentalNote?: number; Octave?: number; AccidentalHalfTones?: number } }).Pitch
  const i = midiPipelineAuditRows.length
  midiPipelineAuditRows.push({
    i,
    sourceStep: pitch?.FundamentalNote ?? '—',
    sourceAlter: pitch?.AccidentalHalfTones ?? '—',
    sourceOctave: pitch?.Octave ?? '—',
    osmdRawHalfTone: getOsmdHalfToneRaw(sourceNote),
    computedMidi: practiceNote.midi,
    label: getNoteName(practiceNote.midi),
    staffRole: practiceNote.staffRole,
    measure: practiceNote.measureIndex ?? '—',
  })
}

function buildPracticeNotesFromGNotes(
  gFiltered: GNote[],
  sortedStaffIndices: number[],
  isMultiStaff: boolean,
  layout: StaffVerticalLayout | null,
  measureIndex?: number
): PracticeNoteWithSource[] {
  const out: PracticeNoteWithSource[] = []
  for (const g of gFiltered) {
    const midi = getMidiFromNote(g.sourceNote)
    if (midi === null) continue
    const staffIndex = getStaffIndexFromGNote(g as GNote & Record<string, unknown>)
    const staffRole = getStaffRoleFromStructure(staffIndex, isMultiStaff, layout, sortedStaffIndices)
    if (staffRole === undefined) continue
    const idx = staffIndex ?? sortedStaffIndices[0] ?? 0
    const note: PracticeNote = {
      midi,
      partIndex: 0,
      rawStaffIndex: idx,
      staffIndex: idx,
      sourceStaffId: idx,
      staffRole,
    }
    if (measureIndex !== undefined) note.measureIndex = measureIndex
    recordMidiPipelineAuditRow(note, g.sourceNote)
    out.push({
      practiceNote: note,
      sourceNote: g.sourceNote,
    })
  }
  return out
}



/** Cursor with advance and end detection for auto-skip. */
type CursorWithAdvance = CursorLike & {
  reset(): void
  show(): void
  next(): void
  Iterator?: OsmdIteratorLike
  update?: () => void
}

function emptyStaffAvailability(): StaffAvailability {
  return { hasUpper: false, hasLower: false, isSingleStaff: false, isUnknown: true }
}

/** Full-score walk: distinct staff indices as OSMD reports them (sorted ascending). */
function walkFullScoreCollectStaffIndices(cursor: CursorWithAdvance): number[] {
  const seenStaffIndices = new Set<number>()
  let sawAnyGNotes = false
  let sawAnyDefinedStaffIndex = false

  const captureAtCursor = () => {
    let gNotes: GNote[] | undefined
    try {
      gNotes = cursor.GNotesUnderCursor?.()
    } catch {
      gNotes = undefined
    }
    if (!gNotes || !Array.isArray(gNotes) || gNotes.length === 0) return
    sawAnyGNotes = true
    for (const g of gNotes) {
      const idx = getStaffIndexFromGNote(g as GNote & Record<string, unknown>)
      if (idx === undefined) continue
      sawAnyDefinedStaffIndex = true
      seenStaffIndices.add(idx)
    }
  }

  try {
    ;(cursor as unknown as { reset?: () => void }).reset?.()
  } catch {
    // ignore
  }

  captureAtCursor()
  for (;;) {
    if (cursor.Iterator?.EndReached) break
    try {
      cursor.next()
    } catch {
      break
    }
    captureAtCursor()
    if (cursor.Iterator?.EndReached) break
  }

  try {
    ;(cursor as unknown as { reset?: () => void }).reset?.()
  } catch {
    // ignore
  }

  if (!sawAnyGNotes || !sawAnyDefinedStaffIndex) return []

  return [...seenStaffIndices].sort((a, b) => a - b)
}

/**
 * Map each source staff id to minimum absolute Y seen on any graphical note at that id (full-score walk).
 * Smaller Y = higher on the page → upper staff.
 */
function walkFullScoreBuildStaffVerticalLayout(
  cursor: CursorWithAdvance,
  staffIds: number[]
): StaffVerticalLayout | null {
  if (staffIds.length < 2) return null
  const yMinByStaff = new Map<number, number>()

  const captureAtCursor = () => {
    let gNotes: GNote[] | undefined
    try {
      gNotes = cursor.GNotesUnderCursor?.()
    } catch {
      gNotes = undefined
    }
    if (!gNotes?.length) return
    for (const g of gNotes) {
      const id = getStaffIndexFromGNote(g as GNote & Record<string, unknown>)
      if (id === undefined || !staffIds.includes(id)) continue
      const y = getGraphicalNoteAbsoluteY(g)
      if (y === undefined) continue
      const prev = yMinByStaff.get(id)
      if (prev === undefined || y < prev) yMinByStaff.set(id, y)
    }
  }

  try {
    ;(cursor as unknown as { reset?: () => void }).reset?.()
  } catch {
    // ignore
  }

  captureAtCursor()
  for (;;) {
    if (cursor.Iterator?.EndReached) break
    try {
      cursor.next()
    } catch {
      break
    }
    captureAtCursor()
    if (cursor.Iterator?.EndReached) break
  }

  try {
    ;(cursor as unknown as { reset?: () => void }).reset?.()
  } catch {
    // ignore
  }

  const withY = staffIds.filter((id) => yMinByStaff.has(id))
  if (withY.length < 2) return null
  const sortedByY = [...withY].sort((a, b) => {
    const ya = yMinByStaff.get(a) ?? 0
    const yb = yMinByStaff.get(b) ?? 0
    if (ya !== yb) return ya - yb
    return a - b
  })
  return { upperStaffId: sortedByY[0], lowerStaffId: sortedByY[1] }
}

export type StaffDimOverlayStyles = {
  upperVeil: CSSProperties
  lowerVeil: CSSProperties
}

type GraphicalNoteDomLike = { getSVGGElement?: () => SVGGElement | null }

/**
 * Positions staff dim overlays from real note-head DOM tops (relative to `frameEl`).
 * Upper-veil top starts at the topmost upper-staff note (title stays clear); upper-veil bottom is capped at the top of lower-staff heads so stems/beams on the treble staff cannot stretch the veil over the bass staff.
 */
function measureStaffDimOverlayStyles(
  osmd: OpenSheetMusicDisplay,
  frameEl: HTMLElement,
  layout: StaffVerticalLayout
): StaffDimOverlayStyles | null {
  const cursor = osmd.cursor as CursorWithAdvance | undefined
  if (!cursor) return null

  const frameRect = frameEl.getBoundingClientRect()
  const h = frameRect.height
  if (h < 2) return null

  const upperId = layout.upperStaffId
  const lowerId = layout.lowerStaffId

  let minTopUpper = Infinity
  let minTopLower = Infinity

  const visit = () => {
    let gNotes: GNote[] | undefined
    try {
      gNotes = cursor.GNotesUnderCursor?.()
    } catch {
      gNotes = undefined
    }
    if (!gNotes?.length) return
    for (const g of gNotes) {
      const id = getStaffIndexFromGNote(g as GNote & Record<string, unknown>)
      if (id === undefined || (id !== upperId && id !== lowerId)) continue
      const el = (g as GraphicalNoteDomLike).getSVGGElement?.()
      if (!el) continue
      const r = el.getBoundingClientRect()
      const top = r.top - frameRect.top
      if (!Number.isFinite(top)) continue
      if (id === upperId) {
        minTopUpper = Math.min(minTopUpper, top)
      } else {
        minTopLower = Math.min(minTopLower, top)
      }
    }
  }

  try {
    cursor.reset?.()
  } catch {
    return null
  }

  visit()
  for (;;) {
    if (cursor.Iterator?.EndReached) break
    try {
      cursor.next()
    } catch {
      break
    }
    visit()
    if (cursor.Iterator?.EndReached) break
  }

  try {
    cursor.reset?.()
  } catch {
    // ignore
  }

  if (!Number.isFinite(minTopUpper) || !Number.isFinite(minTopLower)) return null

  const pad = 6
  /** Hard boundary between staves: top of lower-staff note heads. Do not use upper-staff note *bottom* (stems/beams extend into the other staff and inflate bbox, which made the upper veil span both staves). */
  const staffBoundaryPx = minTopLower - pad

  const toPct = (px: number) => `${Math.min(100, Math.max(0, (px / h) * 100))}%`

  const upperStart = Math.max(0, minTopUpper - pad)
  const upperH = Math.max(12, staffBoundaryPx - upperStart)
  const lowerStart = staffBoundaryPx
  const lowerH = Math.max(12, h - staffBoundaryPx - pad)

  return {
    upperVeil: {
      top: toPct(upperStart),
      height: toPct(upperH),
      bottom: 'auto',
    },
    lowerVeil: {
      top: toPct(lowerStart),
      height: toPct(lowerH),
      bottom: 'auto',
    },
  }
}

function staffAvailabilityFromSortedIndices(indices: number[]): StaffAvailability {
  if (indices.length === 0) return emptyStaffAvailability()
  if (indices.length === 1) {
    return { hasUpper: false, hasLower: false, isSingleStaff: true, isUnknown: false }
  }
  return { hasUpper: true, hasLower: true, isSingleStaff: false, isUnknown: false }
}

function logStaffNormalizationDebug(
  cursor: CursorWithAdvance,
  sortedStaffIndices: number[],
  layout: StaffVerticalLayout | null,
  label: string
): void {
  if (!DEBUG_OSMD_SCORE) return

  const isMulti = sortedStaffIndices.length >= 2
  const countsByStaffIndex: Record<string, number> = {}
  /** First 40 normalized notes accumulated across the entire walk (per-step `buildPracticeNotesFromGNotes`); not one slice of a single cursor position. */
  const first40NormalizedNotes: Array<{
    staffIndex: number
    staffRole: StaffRole
    midi: number
    label: string
  }> = []
  const normalizedNotesAcrossWalk: PracticeNote[] = []
  let totalStepsWalked = 0
  let lastMeasureReached: number | undefined

  const captureStep = () => {
    let gNotes: GNote[] | undefined
    try {
      gNotes = cursor.GNotesUnderCursor?.()
    } catch {
      gNotes = undefined
    }
    const rawNotesHere = gNotes?.length ?? 0
    const measureIndex = cursor.Iterator?.CurrentMeasureIndex
    if (measureIndex !== undefined) lastMeasureReached = measureIndex
    if (totalStepsWalked % 10 === 0) {
      logOsmd('[NORM_LOOP]', {
        stepIndex: totalStepsWalked,
        measureIndex,
        notesAtThisStep: rawNotesHere,
      })
    }
    if (!gNotes?.length) return
    const items = buildPracticeNotesFromGNotes(gNotes, sortedStaffIndices, isMulti, layout, measureIndex)
    for (const { practiceNote: p, sourceNote } of items) {
      normalizedNotesAcrossWalk.push(p)
      const k = String(p.staffIndex)
      countsByStaffIndex[k] = (countsByStaffIndex[k] ?? 0) + 1
      if (first40NormalizedNotes.length < 40) {
        first40NormalizedNotes.push({
          staffIndex: p.staffIndex,
          staffRole: p.staffRole,
          midi: p.midi,
          label: getNoteLabel(sourceNote),
        })
      }
    }
  }

  try {
    ;(cursor as unknown as { reset?: () => void }).reset?.()
  } catch {
    // ignore
  }
  for (;;) {
    totalStepsWalked++
    captureStep()
    if (cursor.Iterator?.EndReached) break
    try {
      cursor.next()
    } catch {
      break
    }
    if (cursor.Iterator?.EndReached) break
  }
  try {
    ;(cursor as unknown as { reset?: () => void }).reset?.()
  } catch {
    // ignore
  }

  logOsmd('[NORM_RESULT]', {
    totalStepsWalked,
    totalNotesNormalized: normalizedNotesAcrossWalk.length,
    uniqueStaffIds: [...new Set(normalizedNotesAcrossWalk.map((n) => n.staffIndex))],
    lastMeasureReached,
  })
  logOsmd('[STAFF_ID_SUMMARY]', {
    uniqueStaffIds: [...new Set(normalizedNotesAcrossWalk.map((n) => n.staffIndex))],
  })
  logOsmd('[STAFF_NORMALIZATION]', label, {
    sortedStaffIndices,
    isMultiStaff: isMulti,
    countsByStaffIndex,
    first40NormalizedNotes,
  })

  const roleMap: Record<string, 'upper' | 'lower'> = {}
  if (layout) {
    roleMap[String(layout.upperStaffId)] = 'upper'
    roleMap[String(layout.lowerStaffId)] = 'lower'
  }
  logOsmd('[STAFF_ROLE_DEBUG]', {
    roleMap,
    sampleUpper: normalizedNotesAcrossWalk
      .filter((n) => n.staffRole === 'upper')
      .slice(0, 5)
      .map((n) => ({
        midi: n.midi,
        label: getNoteName(n.midi),
        sourceStaffId: n.sourceStaffId,
        measure: n.measureIndex,
      })),
    sampleLower: normalizedNotesAcrossWalk
      .filter((n) => n.staffRole === 'lower')
      .slice(0, 5)
      .map((n) => ({
        midi: n.midi,
        label: getNoteName(n.midi),
        sourceStaffId: n.sourceStaffId,
        measure: n.measureIndex,
      })),
  })
}

function seekCursorToStep(cursor: CursorWithAdvance, step: number): void {
  try {
    cursor.reset()
  } catch {
    return
  }
  for (let i = 0; i < step; i++) {
    if (cursor.Iterator?.EndReached) break
    try {
      cursor.next()
    } catch {
      break
    }
  }
  try {
    ;(cursor as unknown as { show?: () => void }).show?.()
    cursor.update?.()
    ;(cursor as CursorWithAdvance & { updateCurrentPage?: () => void }).updateCurrentPage?.()
  } catch {
    // ignore
  }
}

/**
 * Hook for loading and navigating an OSMD score with optional staff- and hand-based note filtering.
 *
 * Staff mapping: upper / lower from rendered vertical order (top staff = upper), keyed by source staff id.
 * Single-staff scores are not filtered by staff.
 *
 * Hand: if a note has handHint (e.g. from MusicXML), it is used; otherwise hand follows upper/right, lower/left.
 *
 * @param staffSelection - treble / bass graphical staff, or both.
 * @param handMode - 'both', 'right', or 'left'. When staff is both staves and hand is narrowed, filters by inferred hand per staff role.
 */
export function useOsmdScore(
  staffSelection: StaffSelection = 'both',
  handMode: HandMode = 'both',
  scoreContainerRef?: RefObject<HTMLDivElement | null>,
  /**
   * When `current` is true, advancing past the last staff-filtered playable event seeks back to the first
   * event instead of setting `isEnd`. Used for measure-loop practice; each wrap bumps `loopSegmentWrapCount`
   * for mission rep boundaries.
   */
  wrapFilteredPlayableListAtEndRef?: RefObject<boolean>
) {
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  /** Distinct staff indices from a full-score walk after load; drives staffRole normalization. */
  const scoreSortedStaffIndicesRef = useRef<number[] | null>(null)
  /** Upper vs lower from min graphical Y per sourceStaffId (null if layout could not be read). */
  const scoreStaffVerticalLayoutRef = useRef<StaffVerticalLayout | null>(null)
  /** After load, skip redundant cursor.reset() in the staff/hand effect (loadScore already reset). Effect still rebuilds playable events. */
  const skipOsmdCursorResetOnceAfterLoadRef = useRef(false)
  /** Log [STAFF_ROLE_SAMPLE] once per load or after a staff/hand effect cursor reset. */
  const staffRoleSampleLoggedRef = useRef(false)
  const playableEventsRef = useRef<StaffFilteredPlayableEvent[]>([])
  const currentEventIndexRef = useRef(0)

  const focusFromMeasureRef = useRef(1)
  const focusToMeasureRef = useRef(4)
  const focusMeasureRangeRef = useRef<FocusMeasureRange1Based | null>(null)
  const focusRangeRef = useRef<FocusBeatRange | null>(null)
  const [focusFromMeasure, setFocusFromMeasureState] = useState(1)
  const [focusToMeasure, setFocusToMeasureState] = useState(4)
  const [focusRange, setFocusRangeState] = useState<FocusBeatRange | null>(null)

  const [expectedNotes, setExpectedNotes] = useState<number[]>([])
  const [expectedPracticeNotes, setExpectedPracticeNotes] = useState<PracticeNote[]>([])
  const [currentScoreDebug, setCurrentScoreDebug] = useState<{ labels: string[]; halfTones: number[] }>({
    labels: [],
    halfTones: [],
  })
  /** Debug / session: aligns OSMD adapter with authoritative sheet grid ids. */
  const [practiceCursorMeta, setPracticeCursorMeta] = useState<{
    cursorStep: number | null
    eventIndex: number | null
    practiceEventKey: string | null
    gridKind: 'note' | 'rest' | null
    requiresKeyboardInput: boolean
  }>({
    cursorStep: null,
    eventIndex: null,
    practiceEventKey: null,
    gridKind: null,
    requiresKeyboardInput: false,
  })
  const [isLoaded, setIsLoaded] = useState(false)
  const [isEnd, setIsEnd] = useState(false)
  const [isMultiStaffScore, setIsMultiStaffScore] = useState<boolean | null>(null)
  const [staffAvailability, setStaffAvailability] = useState<StaffAvailability>(() => emptyStaffAvailability())
  // If we reach the end while searching for playable notes for a specific staff filter (upper/lower),
  // surface it so the UI can show an honest "no notes on this staff" message.
  const [endStaffMode, setEndStaffMode] = useState<StaffSelection | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [staffDimOverlayStyles, setStaffDimOverlayStyles] = useState<StaffDimOverlayStyles | null>(null)
  /** Incremented after score render/layout so overlays can resync geometry. */
  const [scoreLayoutRevision, setScoreLayoutRevision] = useState(0)
  /** Staff-filtered playable list length after last rebuild (loop completion vs spurious `isEnd`). */
  const [staffFilteredPlayableEventCount, setStaffFilteredPlayableEventCount] = useState(0)
  /**
   * Increments each time the cursor wraps from the last staff-filtered playable event back to the first
   * while segment looping is enabled — one physical loop cycle (same boundary the player experiences).
   */
  const [loopSegmentWrapCount, setLoopSegmentWrapCount] = useState(0)
  /** OSMD `MusicSheet` title/subtitle after load (for assigned-practice piece matching). */
  const [scoreMetadataTitle, setScoreMetadataTitle] = useState<string | null>(null)

  /** True only after we have shown at least one non-empty expected note for the current staff/hand filter.
   * Prevents treating "no notes for this staff in score" as completion when switching to upper/lower. */
  const hasStartedFilteredSessionRef = useRef(false)

  function applyPlayableEventAtIndex(index: number): void {
    const events = playableEventsRef.current
    const ev = events[index]
    if (!ev) {
      setExpectedNotes([])
      setExpectedPracticeNotes([])
      setCurrentScoreDebug({ labels: [], halfTones: [] })
      setPracticeCursorMeta({ cursorStep: null, eventIndex: null, practiceEventKey: null, gridKind: null, requiresKeyboardInput: false })
      return
    }
    currentEventIndexRef.current = index
    const uniqueMidi = ev.expectedMidi
    const practiceNotes = ev.practiceNotes
    const canonicalLabels = uniqueMidi.map((m) => getNoteName(m))
    setCurrentScoreDebug({ labels: canonicalLabels, halfTones: uniqueMidi })

    if (!staffRoleSampleLoggedRef.current && practiceNotes.length > 0) {
      staffRoleSampleLoggedRef.current = true
      const sample = practiceNotes.slice(0, 5).map((p) => ({
        pitch: getNoteName(p.midi),
        staffIndex: p.staffIndex,
        staffRole: p.staffRole,
      }))
      logOsmd('[STAFF_ROLE_SAMPLE] first 5 at current cursor', sample)
    }

    const targetMidiStr = uniqueMidi.map((m) => String(m)).join(',')
    logOsmd('[PLAYABLE_EVENT]', {
      activeEventIndex: index,
      totalEvents: events.length,
      cursorStep: ev.cursorStep,
      expectedMidi: uniqueMidi,
      targetMidiVisibility: targetMidiStr,
      canonicalLabels,
    })

    if (staffSelection !== 'both' || handMode !== 'both') {
      logOsmd('[STAFF MODE]', {
        selectedStaffMode: staffSelection,
        handMode,
        totalAtCursor: ev.totalAtCursor ?? practiceNotes.length,
        filteredNoteCount: practiceNotes.length,
        practiceNoteCount: practiceNotes.length,
        currentExpectedMidi: uniqueMidi,
        currentExpectedLabels: canonicalLabels,
        isMultiStaffScore: ev.isMultiStaffScore ?? false,
        staffRoles: practiceNotes.map((p) => p.staffRole),
      })
    }

    hasStartedFilteredSessionRef.current = true
    setPracticeCursorMeta({
      cursorStep: ev.cursorStep,
      eventIndex: index,
      practiceEventKey: ev.practiceEventKey,
      gridKind: ev.gridKind,
      requiresKeyboardInput: ev.requiresKeyboardInput,
    })
    setExpectedNotes(uniqueMidi)
    setExpectedPracticeNotes(practiceNotes)
    setEndStaffMode(null)
  }

  const rebuildPlayableEventsFromScore = useCallback(() => {
    const osmd = osmdRef.current
    if (!osmd) {
      playableEventsRef.current = []
      setStaffFilteredPlayableEventCount(0)
      setExpectedNotes([])
      setExpectedPracticeNotes([])
      setEndStaffMode(null)
      setCurrentScoreDebug({ labels: [], halfTones: [] })
      setPracticeCursorMeta({ cursorStep: null, eventIndex: null, practiceEventKey: null, gridKind: null, requiresKeyboardInput: false })
      return
    }
    const cursor = osmd.cursor as CursorWithAdvance | undefined
    if (!cursor) {
      playableEventsRef.current = []
      setStaffFilteredPlayableEventCount(0)
      setExpectedNotes([])
      setExpectedPracticeNotes([])
      setEndStaffMode(null)
      setCurrentScoreDebug({ labels: [], halfTones: [] })
      setPracticeCursorMeta({ cursorStep: null, eventIndex: null, practiceEventKey: null, gridKind: null, requiresKeyboardInput: false })
      return
    }

    setEndStaffMode(null)
    const sortedStaffRaw = scoreSortedStaffIndicesRef.current
    const sortedStaff =
      sortedStaffRaw && sortedStaffRaw.length > 0 ? sortedStaffRaw : ([] as number[])

    const layout = scoreStaffVerticalLayoutRef.current
    const sheet = osmd.Sheet as import('opensheetmusicdisplay').MusicSheet | undefined

    if (!sheet) {
      playableEventsRef.current = []
      setStaffFilteredPlayableEventCount(0)
      setExpectedNotes([])
      setExpectedPracticeNotes([])
      setEndStaffMode(null)
      setCurrentScoreDebug({ labels: [], halfTones: [] })
      setPracticeCursorMeta({
        cursorStep: null,
        eventIndex: null,
        practiceEventKey: null,
        gridKind: null,
        requiresKeyboardInput: false,
      })
      setIsEnd(false)
      return
    }

    resetMidiPipelineAudit()

    const grid = buildExpectedEventGridFromMusicSheet(sheet, {
      staffSelection,
      handSelection: handMode,
      sortedStaffIndices: sortedStaff.length > 0 ? sortedStaff : [0],
      staffVerticalLayout: layout,
      focusMeasureRange: focusMeasureRangeRef.current,
    })

    const steps = attachOsmdSeekStepsForGrid(
      grid.events,
      cursor as Parameters<typeof attachOsmdSeekStepsForGrid>[1],
      staffSelection,
      handMode,
      sortedStaff,
      layout
    )

    if (steps.some((s) => s < 0)) {
      warnOsmd('[OSMD] Could not anchor every ExpectedEvent grid row to an OSMD cursor step', {
        unresolved: steps.filter((s) => s < 0).length,
      })
    }

    let fallbackSeek = 0
    const playable: StaffFilteredPlayableEvent[] = grid.events.map((ge, i) => {
      const rawStep = steps[i]
      const cursorSeekStep = typeof rawStep === 'number' && rawStep >= 0 ? rawStep : fallbackSeek
      if (typeof rawStep === 'number' && rawStep >= 0) fallbackSeek = rawStep
      const isMulti = (sortedStaff.length > 1 ? sortedStaff.length : scoreSortedStaffIndicesRef.current?.length ?? 0) >= 2
      return {
        practiceEventKey: ge.id,
        cursorStep: cursorSeekStep,
        expectedMidi: ge.expectedMidi,
        practiceNotes: ge.practiceNotes,
        measureIndex: ge.position.measureIndex,
        totalAtCursor: ge.practiceNotes.length,
        isMultiStaffScore: isMulti,
        gridKind: ge.kind,
        requiresKeyboardInput: ge.requiresKeyboardInput,
      }
    })

    playableEventsRef.current = playable
    currentEventIndexRef.current = 0
    setStaffFilteredPlayableEventCount(playable.length)

    if (DEBUG_OSMD_SCORE) {
      logOsmd('[EVENT_GRID_RESULT]', {
        totalEventsFound: playable.length,
        seekUnresolved: steps.filter((s) => s < 0).length,
        firstSeek: playable[0]?.cursorStep ?? null,
      })
      if (midiPipelineAuditRows && midiPipelineAuditRows.length > 0) {
        tableOsmd(midiPipelineAuditRows)
        midiPipelineAuditRows = null
      }
    }

    if (playable.length === 0) {
      hasStartedFilteredSessionRef.current = false
      try {
        cursor.reset()
        ;(cursor as unknown as { show?: () => void }).show?.()
        cursor.update?.()
        ;(cursor as CursorWithAdvance & { updateCurrentPage?: () => void }).updateCurrentPage?.()
      } catch {
        // ignore
      }
      setExpectedNotes([])
      setExpectedPracticeNotes([])
      setEndStaffMode(staffSelection === 'both' ? null : staffSelection)
      setCurrentScoreDebug({ labels: [], halfTones: [] })
      setPracticeCursorMeta({ cursorStep: null, eventIndex: null, practiceEventKey: null, gridKind: null, requiresKeyboardInput: false })
      setIsEnd(false)
      return
    }

    seekCursorToStep(cursor, playable[0].cursorStep)
    applyPlayableEventAtIndex(0)
    setIsEnd(false)
  }, [staffSelection, handMode])

  const setFocusFromMeasure = useCallback((n: number) => {
    focusFromMeasureRef.current = n
    setFocusFromMeasureState(n)
  }, [])

  const setFocusToMeasure = useCallback((n: number) => {
    focusToMeasureRef.current = n
    setFocusToMeasureState(n)
  }, [])

  const setFocusRange = useCallback(
    (range: FocusBeatRange | null) => {
      focusRangeRef.current = range
      setFocusRangeState(range)
      if (range != null) {
        focusMeasureRangeRef.current = {
          from: focusFromMeasureRef.current,
          to: focusToMeasureRef.current,
        }
      } else {
        focusMeasureRangeRef.current = null
      }
      rebuildPlayableEventsFromScore()
    },
    [rebuildPlayableEventsFromScore]
  )

  const getBeatRangeForMeasures = useCallback((fromBar1: number, toBar1: number) => {
    const osmd = osmdRef.current
    if (!osmd) return null
    return getBeatRangeForMeasuresOnSheet(osmd, fromBar1, toBar1)
  }, [])

  const clearFocusRange = useCallback(() => {
    focusMeasureRangeRef.current = null
    focusRangeRef.current = null
    setFocusRangeState(null)
    rebuildPlayableEventsFromScore()
  }, [rebuildPlayableEventsFromScore])

  // On staff/hand change: optionally reset OSMD, then rebuild staff-filtered playable list and seek to first event.
  useEffect(() => {
    if (!isLoaded || !osmdRef.current?.cursor) return
    const cursor = osmdRef.current.cursor as CursorWithAdvance
    hasStartedFilteredSessionRef.current = false
    const skipReset = skipOsmdCursorResetOnceAfterLoadRef.current
    if (skipReset) {
      skipOsmdCursorResetOnceAfterLoadRef.current = false
    } else {
      staffRoleSampleLoggedRef.current = false
      try {
        osmdRef.current.cursor.reset()
        osmdRef.current.cursor.show()
        cursor.update?.()
        ;(cursor as CursorWithAdvance & { updateCurrentPage?: () => void }).updateCurrentPage?.()
      } catch {
        // ignore
      }
    }
    try {
      cursor.update?.()
      ;(cursor as CursorWithAdvance & { updateCurrentPage?: () => void }).updateCurrentPage?.()
    } catch {
      // ignore
    }
    rebuildPlayableEventsFromScore()
  }, [staffSelection, handMode, isLoaded, rebuildPlayableEventsFromScore])

  /** Optional debug info for console logs before load/render */
  type LoadScoreDebug = { isPracticeView?: boolean; selectedLessonId?: string }

  const loadScore = useCallback(
    async (
      container: HTMLDivElement | null,
      source: string,
      debug?: LoadScoreDebug
    ) => {
      const hasContainer = Boolean(container)
      const hasXml = Boolean(source)
      const xmlLength = typeof source === 'string' ? source.length : 0
      const isPracticeView = debug?.isPracticeView ?? true
      const selectedLessonId = debug?.selectedLessonId ?? ''

      logOsmd('[OSMD] loadScore called', {
        hasContainer,
        hasXml,
        xmlLength,
        isPracticeView,
        selectedLessonId: selectedLessonId || '(none)',
      })

      if (!container) {
        warnOsmd('[OSMD] No container ref; skipping load')
        setScoreError('Score container not ready')
        return
      }
      if (!source || xmlLength === 0) {
        warnOsmd('[OSMD] No XML/URL source; skipping load')
        setScoreError('No score data')
        return
      }

      try {
        setScoreError(null)
        setExpectedNotes([])
        setPracticeCursorMeta({ cursorStep: null, eventIndex: null, practiceEventKey: null, gridKind: null, requiresKeyboardInput: false })
        setEndStaffMode(null)
        setIsEnd(false)
        setIsLoaded(false)
        setLoopSegmentWrapCount(0)
        setScoreMetadataTitle(null)
        setIsMultiStaffScore(null)
        setStaffAvailability(emptyStaffAvailability())
        hasStartedFilteredSessionRef.current = false
        scoreSortedStaffIndicesRef.current = null
        scoreStaffVerticalLayoutRef.current = null
        skipOsmdCursorResetOnceAfterLoadRef.current = true
        staffRoleSampleLoggedRef.current = false
        playableEventsRef.current = []
        currentEventIndexRef.current = 0
        focusMeasureRangeRef.current = null
        focusRangeRef.current = null
        setFocusRangeState(null)

        if (osmdRef.current) {
          try {
            osmdRef.current.clear()
          } catch (_) {}
          osmdRef.current = null
        }

        container.innerHTML = ''

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve()
          })
        })

        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          drawTitle: true,
          cursorsOptions: [{ type: 0, color: '#3b82f6', alpha: 0.6, follow: true }],
        })

        osmdRef.current = osmd

        await osmd.load(source)
        osmd.render()

        try {
          const sheet = osmd.Sheet
          const titleRaw = sheet?.TitleString
          const subRaw = sheet?.SubtitleString
          const fromTitle = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : ''
          const fromSub = typeof subRaw === 'string' && subRaw.trim() ? subRaw.trim() : ''
          setScoreMetadataTitle(fromTitle || fromSub || null)
        } catch {
          setScoreMetadataTitle(null)
        }

        if (osmd.cursor) {
          osmd.cursor.reset()
          osmd.cursor.show()
          try {
            // Ensure cursor graphics and page are in sync with the freshly rendered layout.
            ;(osmd.cursor as CursorWithAdvance).update?.()
            ;(osmd.cursor as CursorWithAdvance & { updateCurrentPage?: () => void }).updateCurrentPage?.()
          } catch {
            // Defensive: OSMD versions without update helpers.
          }
        }

        if (osmd.cursor) {
          try {
            const sorted = walkFullScoreCollectStaffIndices(osmd.cursor as CursorWithAdvance)
            scoreSortedStaffIndicesRef.current = sorted.length > 0 ? sorted : null
            const layout =
              sorted.length >= 2
                ? walkFullScoreBuildStaffVerticalLayout(osmd.cursor as CursorWithAdvance, sorted)
                : null
            scoreStaffVerticalLayoutRef.current = layout
            const availability = staffAvailabilityFromSortedIndices(sorted)
            setStaffAvailability(availability)
            setIsMultiStaffScore(availability.isUnknown ? null : availability.hasUpper && availability.hasLower)
            if (sorted.length >= 2) {
              logStaffNormalizationDebug(osmd.cursor as CursorWithAdvance, sorted, layout, 'after load')
            }
          } catch {
            scoreSortedStaffIndicesRef.current = null
            scoreStaffVerticalLayoutRef.current = null
            setStaffAvailability(emptyStaffAvailability())
            setIsMultiStaffScore(null)
          }
        }

        setIsLoaded(true)
        setIsEnd(false)
        setEndStaffMode(null)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setScoreLayoutRevision((n) => n + 1)
          })
        })
      } catch (error) {
        console.error('[OSMD] Failed to load score:', error)
        setScoreMetadataTitle(null)
        setScoreError(error instanceof Error ? error.message : 'Failed to load score')
      }
    },
    [rebuildPlayableEventsFromScore]
  )

  const advanceCursor = useCallback(() => {
    const osmd = osmdRef.current
    if (!osmd || !osmd.cursor) return

    const cursor = osmd.cursor as CursorWithAdvance
    const events = playableEventsRef.current
    const nextIndex = currentEventIndexRef.current + 1

    if (nextIndex >= events.length) {
      const wrapSegment = wrapFilteredPlayableListAtEndRef?.current === true
      if (wrapSegment && events.length > 0) {
        setIsEnd(false)
        setLoopSegmentWrapCount((n) => n + 1)
        seekCursorToStep(cursor, events[0].cursorStep)
        applyPlayableEventAtIndex(0)
        return
      }
      setIsEnd(true)
      setExpectedNotes([])
      setExpectedPracticeNotes([])
      setEndStaffMode(null)
      setCurrentScoreDebug({ labels: [], halfTones: [] })
      setPracticeCursorMeta({ cursorStep: null, eventIndex: null, practiceEventKey: null, gridKind: null, requiresKeyboardInput: false })
      return
    }

    seekCursorToStep(cursor, events[nextIndex].cursorStep)
    applyPlayableEventAtIndex(nextIndex)
  }, [staffSelection, handMode])

  const resetCursor = useCallback(() => {
    const osmd = osmdRef.current
    if (!osmd || !osmd.cursor) return

    hasStartedFilteredSessionRef.current = false
    const cursor = osmd.cursor as CursorWithAdvance
    const events = playableEventsRef.current
    setIsEnd(false)
    setEndStaffMode(null)

    if (events.length === 0) {
      try {
        cursor.reset()
        ;(cursor as unknown as { show?: () => void }).show?.()
        cursor.update?.()
        ;(cursor as CursorWithAdvance & { updateCurrentPage?: () => void }).updateCurrentPage?.()
      } catch {
        // ignore
      }
      setExpectedNotes([])
      setExpectedPracticeNotes([])
      setCurrentScoreDebug({ labels: [], halfTones: [] })
      setPracticeCursorMeta({ cursorStep: null, eventIndex: null, practiceEventKey: null, gridKind: null, requiresKeyboardInput: false })
      return
    }

    currentEventIndexRef.current = 0
    seekCursorToStep(cursor, events[0].cursorStep)
    applyPlayableEventAtIndex(0)
  }, [staffSelection, handMode])

  useLayoutEffect(() => {
    if (!scoreContainerRef) return

    const update = () => {
      if (!isLoaded || !osmdRef.current?.cursor) {
        setStaffDimOverlayStyles(null)
        return
      }
      const container = scoreContainerRef.current
      if (!container) {
        setStaffDimOverlayStyles(null)
        return
      }
      const frame = container.parentElement
      if (!frame?.classList.contains('score-overlay-frame')) {
        setStaffDimOverlayStyles(null)
        return
      }
      const layout = scoreStaffVerticalLayoutRef.current
      const sorted = scoreSortedStaffIndicesRef.current
      if (!layout || !sorted || sorted.length < 2) {
        setStaffDimOverlayStyles(null)
        return
      }
      const next = measureStaffDimOverlayStyles(osmdRef.current, frame, layout)
      setStaffDimOverlayStyles(next)
    }

    if (!isLoaded) {
      setStaffDimOverlayStyles(null)
      return
    }

    update()
    let cancelled = false
    requestAnimationFrame(() => {
      if (cancelled) return
      requestAnimationFrame(() => {
        if (cancelled) return
        update()
      })
    })

    const container = scoreContainerRef.current
    const frame = container?.parentElement
    if (!frame?.classList.contains('score-overlay-frame')) return

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        update()
        setScoreLayoutRevision((n) => n + 1)
      })
    })
    ro.observe(frame)
    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [isLoaded, scoreContainerRef])

  const refreshExpectedNotes = useCallback(() => {
    const osmd = osmdRef.current
    if (!osmd?.cursor) return
    const cursor = osmd.cursor as CursorWithAdvance
    const events = playableEventsRef.current
    const idx = currentEventIndexRef.current
    if (!events[idx]) return
    seekCursorToStep(cursor, events[idx].cursorStep)
    applyPlayableEventAtIndex(idx)
  }, [staffSelection, handMode])

  return {
    osmd: osmdRef.current,
    loadScore,
    expectedNotes,
    expectedPracticeNotes,
    currentScoreDebug,
    practiceCursorMeta,
    advanceCursor,
    resetCursor,
    refreshExpectedNotes,
    isLoaded,
    isEnd,
    scoreError,
    endStaffMode,
    staffAvailability,
    // A false value definitively indicates a single-staff score; null means "unknown / not inspected yet".
    isMultiStaffScore,
    staffDimOverlayStyles,
    scoreLayoutRevision,
    focusFromMeasure,
    focusToMeasure,
    focusRange,
    setFocusFromMeasure,
    setFocusToMeasure,
    setFocusRange,
    getBeatRangeForMeasures,
    clearFocusRange,
    scoreMetadataTitle,
    staffFilteredPlayableEventCount,
    loopSegmentWrapCount,
  }
}
