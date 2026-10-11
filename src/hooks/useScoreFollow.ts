import { useCallback, useRef } from 'react'

/** Matches OSMD/VexFlow output and `SegmentLoopOverlay` (1-based bar id on `g.vf-measure`). */
const VF_MEASURE_SELECTOR = 'svg g.vf-measure'

/**
 * Scroll the score viewport so the first bar of the mission range is visible (one-shot on mission start).
 * Uses the union of all `g.vf-measure` nodes whose `id` is the 1-based bar number.
 * @returns true if the measure geometry was found (scroll applied or already in view); false if not ready yet.
 */
export function scrollMissionFirstBarIntoView(
  viewport: HTMLDivElement | null,
  scoreRoot: HTMLDivElement | null,
  firstBar1Based: number
): boolean {
  if (!viewport || !scoreRoot) return false
  const bar = Math.round(firstBar1Based)
  if (!Number.isFinite(bar) || bar < 1) return false

  const groups = Array.from(scoreRoot.querySelectorAll(VF_MEASURE_SELECTOR)) as SVGGElement[]
  const id = String(bar)
  const ms = groups.filter((g) => g.id === id)
  if (ms.length === 0) return false

  let minTop = Number.POSITIVE_INFINITY
  let maxBottom = Number.NEGATIVE_INFINITY
  for (const g of ms) {
    const r = g.getBoundingClientRect()
    if (!Number.isFinite(r.top) || !Number.isFinite(r.bottom)) continue
    minTop = Math.min(minTop, r.top)
    maxBottom = Math.max(maxBottom, r.bottom)
  }
  if (!Number.isFinite(minTop) || !Number.isFinite(maxBottom)) return false

  const viewportRect = viewport.getBoundingClientRect()
  const vh = viewport.clientHeight
  if (vh <= 0) return true

  const noteTop = minTop - viewportRect.top + viewport.scrollTop
  const noteBottom = maxBottom - viewportRect.top + viewport.scrollTop

  const st = viewport.scrollTop
  const safeTop = st + vh * 0.2
  const safeBottom = st + vh * 0.8
  if (noteTop >= safeTop && noteBottom <= safeBottom) {
    return true
  }

  const desiredNoteTop = st + vh * 0.22
  let targetScrollTop = st + (noteTop - desiredNoteTop)
  const maxScrollTop = Math.max(0, viewport.scrollHeight - vh)
  targetScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop))

  if (Math.abs(targetScrollTop - st) < 1) {
    return true
  }

  viewport.scrollTo({ top: targetScrollTop, behavior: 'auto' })
  return true
}

type CursorLike = {
  GNotesUnderCursor?: () => unknown[]
}

type OsmdLike = {
  cursor?: CursorLike
  Graphic?: { getSVGGElement?: () => SVGGElement | null }
  getSVGGElement?: () => SVGGElement | null
}

type GraphicalNoteLike = {
  getSVGGElement?: () => SVGGElement | null
}

type NoteZone = 'above_safe_zone' | 'inside_safe_zone' | 'below_safe_zone'

function safeGetCursorGNotes(osmd: OsmdLike | null | undefined): unknown[] {
  try {
    const cursor = osmd?.cursor
    const gNotes = cursor?.GNotesUnderCursor?.()
    return Array.isArray(gNotes) ? gNotes : []
  } catch {
    return []
  }
}

function safeGetAnySvgGroup(osmd: OsmdLike | null | undefined): SVGGElement | null {
  try {
    return osmd?.Graphic?.getSVGGElement?.() ?? osmd?.getSVGGElement?.() ?? null
  } catch {
    return null
  }
}

function safeGetGNoteSvgEl(gNote: unknown): SVGGElement | null {
  try {
    return (gNote as GraphicalNoteLike | null)?.getSVGGElement?.() ?? null
  } catch {
    return null
  }
}

function classifyZone(noteTop: number, noteBottom: number, viewportScrollTop: number, viewportHeight: number): NoteZone {
  const safeTop = viewportScrollTop + viewportHeight * 0.2
  const safeBottom = viewportScrollTop + viewportHeight * 0.8
  if (noteBottom < safeTop) return 'above_safe_zone'
  if (noteTop > safeBottom) return 'below_safe_zone'
  return 'inside_safe_zone'
}

export function useScoreFollow() {
  const rafIdRef = useRef<number | null>(null)

  const ensureCurrentNoteVisible = useCallback(
    (osmd: unknown, viewport: HTMLDivElement | null) => {
      if (!viewport) return

      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current)
      }

      rafIdRef.current = requestAnimationFrame(() => {
        const osmdLike = osmd as OsmdLike

        // Required safe reads (even if not all data is used yet).
        const gNotes = safeGetCursorGNotes(osmdLike)
        void safeGetAnySvgGroup(osmdLike)

        if (gNotes.length === 0) return

        const viewportRect = viewport.getBoundingClientRect()

        let minTop = Number.POSITIVE_INFINITY
        let maxBottom = Number.NEGATIVE_INFINITY

        for (const g of gNotes) {
          const el = safeGetGNoteSvgEl(g)
          if (!el) continue
          const r = el.getBoundingClientRect()
          if (!Number.isFinite(r.top) || !Number.isFinite(r.bottom)) continue
          minTop = Math.min(minTop, r.top)
          maxBottom = Math.max(maxBottom, r.bottom)
        }

        if (!Number.isFinite(minTop) || !Number.isFinite(maxBottom)) return

        // Convert from viewport-relative pixels to scroll container coordinates.
        const noteTop = minTop - viewportRect.top + viewport.scrollTop
        const noteBottom = maxBottom - viewportRect.top + viewport.scrollTop

        const zone = classifyZone(noteTop, noteBottom, viewport.scrollTop, viewport.clientHeight)

        if (viewport.clientHeight <= 0) return

        const viewportHeight = viewport.clientHeight
        const currentScrollTop = viewport.scrollTop

        // Safe band in scroll coordinates.
        const safeTop = currentScrollTop + viewportHeight * 0.2
        const safeBottom = currentScrollTop + viewportHeight * 0.8
        void safeTop
        void safeBottom

        let targetScrollTop = currentScrollTop

        if (zone === 'above_safe_zone') {
          // Cursor note has crept above the 20% band – scroll up just enough so it sits near 25%.
          const desiredNoteTop = currentScrollTop + viewportHeight * 0.25
          const delta = noteTop - desiredNoteTop
          targetScrollTop = currentScrollTop + delta
        } else if (zone === 'below_safe_zone') {
          // Cursor note has fallen below the 80% band – scroll down just enough so it settles near 75%.
          const desiredNoteTop = currentScrollTop + viewportHeight * 0.75
          const delta = noteTop - desiredNoteTop
          targetScrollTop = currentScrollTop + delta
        } else {
          // Inside safe band – nothing to do.
          return
        }

        // Clamp to scrollable bounds.
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewportHeight)
        targetScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop))

        const delta = targetScrollTop - currentScrollTop
        if (Math.abs(delta) < 1) {
          return
        }

        // Small nudges scroll smoothly; large jumps (e.g. system changes) jump immediately.
        const largeJumpThreshold = viewportHeight * 0.5
        const behavior: ScrollBehavior = Math.abs(delta) <= largeJumpThreshold ? 'smooth' : 'auto'

        viewport.scrollTo({
          top: targetScrollTop,
          behavior,
        })
      })
    },
    []
  )

  return { ensureCurrentNoteVisible }
}

