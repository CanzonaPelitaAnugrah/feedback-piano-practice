import type { MusicSheet as MusicSheetEntity } from 'opensheetmusicdisplay'

export const STAFF_UPPER_ID = 1
export const STAFF_LOWER_ID = 2

export const DUAL_STAFF_LAYOUT = {
  upperStaffId: STAFF_UPPER_ID,
  lowerStaffId: STAFF_LOWER_ID,
} as const

export const DUAL_STAFF_INDICES = [STAFF_UPPER_ID, STAFF_LOWER_ID]

export function mockPitchNote(opts: {
  midi: number
  staffId: number
  tieContinuation?: boolean
  isCue?: boolean
  printObject?: boolean
}) {
  const note: Record<string, unknown> = {
    halfTone: opts.midi - 12,
    ParentStaff: { Id: opts.staffId },
    isRest: () => false,
    IsCueNote: opts.isCue ?? false,
  }
  if (opts.printObject === false) note.PrintObject = false
  if (opts.tieContinuation) {
    note.NoteTie = { StartNote: {} }
  }
  return note
}

export function mockRestNote(staffId: number) {
  return {
    halfTone: 0,
    ParentStaff: { Id: staffId },
    isRest: () => true,
  }
}

export function mockVoiceEntry(notes: unknown[], isGrace = false) {
  return { Notes: notes, IsGrace: isGrace }
}

export function mockStaffEntry(staffId: number, voiceEntries: unknown[]) {
  return {
    ParentStaff: { Id: staffId },
    VoiceEntries: voiceEntries,
  }
}

export function mockVerticalContainer(
  absoluteQuarterBeat: number,
  staffEntries: unknown[]
) {
  return {
    StaffEntries: staffEntries,
    getAbsoluteTimestamp: () => ({ RealValue: absoluteQuarterBeat }),
  }
}

export function mockSourceMeasure(measureListIndex: number, containers: unknown[]) {
  return {
    measureListIndex,
    VerticalSourceStaffEntryContainers: containers,
  }
}

export function buildMockMusicSheet(measures: unknown[]): MusicSheetEntity {
  return { SourceMeasures: measures } as MusicSheetEntity
}
