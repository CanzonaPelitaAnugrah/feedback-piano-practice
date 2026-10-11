import type { MockTeacherHandMode } from '../data/mockTeacherPrescriptions'
import type { HandSelection, StaffSelection } from './trainerTypes'

/** Resolved practice filters applied when starting a teacher mission. */
export type MissionPracticeScope = {
  staffSelection: StaffSelection
  handSelection: HandSelection
}

/**
 * Maps teacher mission `handMode` (staff-oriented: upper / lower / both) onto canonical
 * `StaffSelection` and `HandSelection`.
 *
 * Teacher `upper` / `lower` refer to score staff roles, not piano hands. Do not infer
 * right-hand from treble or left-hand from bass here — hand filter stays `both` unless a
 * future mission field adds explicit hand intent.
 */
export function resolveMissionPracticeScope(mission: {
  handMode: MockTeacherHandMode
}): MissionPracticeScope {
  const staffSelection: StaffSelection =
    mission.handMode === 'both'
      ? 'both'
      : mission.handMode === 'upper'
        ? 'treble'
        : 'bass'

  return {
    staffSelection,
    handSelection: 'both',
  }
}
