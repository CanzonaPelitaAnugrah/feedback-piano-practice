/**
 * Set to `true` to log multi-note / alignment diagnostics (search console for `CHORD_PROG`).
 * This file is the single switch — edit the constant below, save, and reload the app.
 * Score / OSMD pipeline verbosity: `debugOsmdScore.ts` (`DEBUG_OSMD_SCORE`).
 */
export const DEBUG_CHORD_PROGRESS = false

export function logChordProgress(tag: string, payload: Record<string, unknown>): void {
  if (!DEBUG_CHORD_PROGRESS) return
  console.log(`[CHORD_PROG:${tag}]`, payload)
}
