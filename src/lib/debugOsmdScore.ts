/**
 * Verbose OSMD / score-pipeline logs ([PLAYABLE_EVENT], event build, staff normalization, etc.).
 * Set to `true` to enable; leave `false` for normal use (default).
 */
export const DEBUG_OSMD_SCORE = false

export function logOsmd(...args: unknown[]): void {
  if (!DEBUG_OSMD_SCORE) return
  console.log(...args)
}

export function warnOsmd(...args: unknown[]): void {
  if (!DEBUG_OSMD_SCORE) return
  console.warn(...args)
}

export function tableOsmd(data: unknown): void {
  if (!DEBUG_OSMD_SCORE) return
  console.table(data)
}
