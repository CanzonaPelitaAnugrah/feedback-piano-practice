import type { StaffSelection } from './trainerTypes'

/** Normalize persisted or legacy payload values onto `StaffSelection`. */
export function normalizeStaffSelection(raw: unknown): StaffSelection {
  if (raw === 'treble' || raw === 'bass' || raw === 'both') return raw
  if (raw === 'upper') return 'treble'
  if (raw === 'lower') return 'bass'
  if (raw === 'all') return 'both'
  return 'both'
}

/** Existing UI dim overlays still use engraving `upper` / `lower` roles. */

export function staffSelectionToLegacyDimStaff(
  sel: StaffSelection
): 'both' | 'upper' | 'lower' {
  if (sel === 'treble') return 'upper'
  if (sel === 'bass') return 'lower'
  return 'both'
}
