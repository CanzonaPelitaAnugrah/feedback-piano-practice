import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MEASURE_SELECTOR = 'g.vf-measure'
/** New visual system row when a measure's top is at least this many px below the row baseline (min top in cluster). */
const SYSTEM_Y_GAP_PX = 12
/** De-emphasize outside the segment without washing out the score (Piano Marvel–style). */
const SEGMENT_VEIL_BACKGROUND = 'rgba(0, 0, 0, 0.10)'
/** Must match segment marker `line.width` and end-line `left: endM.left - width`. */
const MARKER_LINE_WIDTH_PX = 3
/** Touch-friendly drag handle (diameter). */
const HANDLE_SIZE_PX = 20

export type SegmentLoopOverlayProps = {
  enabled: boolean
  /** Initial / default loop bounds (1-based bars). Used only until the user commits a drag; committed range persists while the overlay stays mounted. */
  startMeasure: number
  endMeasure: number
  containerRef: RefObject<HTMLElement | null>
  layoutRevision?: number
  /** Fired after pointer-up when the user finishes dragging a handle (optional: e.g. sync focus range later). */
  onRangeCommit?: (startBar: number, endBar: number) => void
}

type MarkerStyle = { left: number; top: number; height: number }

type PxRect = { left: number; top: number; right: number; bottom: number }

type MeasureGeom = {
  /** 1-based measure id from SVG `g.vf-measure` `id` (same as `unionMeasure(groups, bar, cr)`). */
  barNo: number
  rect: PxRect
}

function collectGroups(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll(`svg ${MEASURE_SELECTOR}`)) as SVGGElement[]
}

function unionMeasure(groups: SVGGElement[], n: number, cr: DOMRect): DOMRect | null {
  const id = String(n)
  const ms = groups.filter((g) => g.id === id)
  if (!ms.length) return null
  let minL = Infinity,
    minT = Infinity,
    maxR = -Infinity,
    maxB = -Infinity
  for (const g of ms) {
    const r = g.getBoundingClientRect()
    minL = Math.min(minL, r.left)
    minT = Math.min(minT, r.top)
    maxR = Math.max(maxR, r.right)
    maxB = Math.max(maxB, r.bottom)
  }
  if (!Number.isFinite(minL)) return null
  return new DOMRect(minL - cr.left, minT - cr.top, maxR - minL, maxB - minT)
}

/**
 * Horizontal positions of the cyan segment markers (container coords), matching rendered `left` on both lines.
 */
function computeMarkerXs(
  groups: SVGGElement[],
  rangeLoBar: number,
  rangeHiBar: number,
  cr: DOMRect
): { startMarkerX: number; endMarkerX: number; sr: DOMRect; er: DOMRect } | null {
  const sr = unionMeasure(groups, rangeLoBar, cr)
  const er = unionMeasure(groups, rangeHiBar, cr)
  if (!sr || !er) return null
  return {
    startMarkerX: sr.left,
    endMarkerX: er.left + er.width - MARKER_LINE_WIDTH_PX,
    sr,
    er,
  }
}

function domRectToPx(r: DOMRect): PxRect {
  const left = r.left
  const top = r.top
  return { left, top, right: left + r.width, bottom: top + r.height }
}

function normalizeRect(r: PxRect): PxRect {
  return {
    left: Math.min(r.left, r.right),
    right: Math.max(r.left, r.right),
    top: Math.min(r.top, r.bottom),
    bottom: Math.max(r.top, r.bottom),
  }
}

function clampMeasureRange(from: number, to: number): { from: number; to: number } {
  const a = Math.round(from)
  const b = Math.round(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { from: 0, to: 0 }
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

/**
 * Group measures into one row per system: sort by top, start a new cluster when top is
 * at least SYSTEM_Y_GAP_PX below the current cluster's minimum top.
 */
function bucketMeasuresIntoSystems(measures: MeasureGeom[]): MeasureGeom[][] {
  if (measures.length === 0) return []
  const sorted = [...measures].sort((x, y) => x.rect.top - y.rect.top || x.rect.left - y.rect.left)
  const systems: MeasureGeom[][] = []
  for (const m of sorted) {
    const last = systems[systems.length - 1]
    if (!last) {
      systems.push([m])
      continue
    }
    const rowBaseline = Math.min(...last.map((x) => x.rect.top))
    if (m.rect.top - rowBaseline >= SYSTEM_Y_GAP_PX) systems.push([m])
    else last.push(m)
  }
  return systems
}

/** Ordered edges and non-negative size; returns null if width or height is 0. */
function clampVeilRect(left: number, top: number, right: number, bottom: number): PxRect | null {
  const l = Math.min(left, right)
  const r = Math.max(left, right)
  const t = Math.min(top, bottom)
  const b = Math.max(top, bottom)
  const w = Math.max(0, r - l)
  const h = Math.max(0, b - t)
  if (w <= 0 || h <= 0) return null
  return { left: l, top: t, right: r, bottom: b }
}

/**
 * Per-system dimming: left/right veils only; horizontal gap between marker Xs stays clear.
 * Do not merge veils across systems — bounding-box merge can fill horizontal gaps when rects overlap vertically.
 */
function computeVeilRectsForSystems(
  systems: MeasureGeom[][],
  rangeLoBar: number,
  rangeHiBar: number,
  startMarkerX: number,
  endMarkerX: number
): PxRect[] {
  const veils: PxRect[] = []
  const segL = Math.min(startMarkerX, endMarkerX)
  const segR = Math.max(startMarkerX, endMarkerX)

  for (const measures of systems) {
    if (measures.length === 0) continue

    let sysX1 = Infinity,
      sysY1 = Infinity,
      sysX2 = -Infinity,
      sysY2 = -Infinity
    for (const m of measures) {
      const r = normalizeRect(m.rect)
      sysX1 = Math.min(sysX1, r.left)
      sysY1 = Math.min(sysY1, r.top)
      sysX2 = Math.max(sysX2, r.right)
      sysY2 = Math.max(sysY2, r.bottom)
    }
    if (!Number.isFinite(sysX1) || !Number.isFinite(sysY1)) continue

    const inRange = measures.some(
      (m) => m.barNo >= rangeLoBar && m.barNo <= rangeHiBar
    )

    const spansSegmentGap = !(sysX2 < segL || sysX1 > segR)

    const pushLeftRightVeils = () => {
      if (sysX1 < segL) {
        const rBound = Math.min(segL, sysX2)
        if (rBound > sysX1) {
          const leftEdge = clampVeilRect(sysX1, sysY1, rBound, sysY2)
          if (leftEdge) veils.push(leftEdge)
        }
      }
      if (sysX2 > segR) {
        const lBound = Math.max(segR, sysX1)
        if (sysX2 > lBound) {
          const rightEdge = clampVeilRect(lBound, sysY1, sysX2, sysY2)
          if (rightEdge) veils.push(rightEdge)
        }
      }
    }

    if (inRange) {
      pushLeftRightVeils()
      continue
    }

    // Fully outside measure range but still under the cyan X-span: never full veil (keeps gap clear).
    if (spansSegmentGap) {
      pushLeftRightVeils()
      continue
    }

    const full = clampVeilRect(sysX1, sysY1, sysX2, sysY2)
    if (full) veils.push(full)
  }

  return veils
}

function collectMeasureGeoms(container: HTMLElement, cr: DOMRect): MeasureGeom[] {
  const groups = collectGroups(container)
  if (groups.length === 0) return []

  const idSet = new Set<number>()
  for (const g of groups) {
    const id = g.id
    if (!/^\d+$/.test(id)) continue
    const n = parseInt(id, 10)
    if (Number.isFinite(n) && n >= 1) idSet.add(n)
  }

  const pending: MeasureGeom[] = []
  for (const bar of idSet) {
    const r = unionMeasure(groups, bar, cr)
    if (!r || r.width < 1 || r.height < 1) continue
    pending.push({ barNo: bar, rect: domRectToPx(r) })
  }
  pending.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
  return pending
}

/** Nearest measure by left barline (`rect.left`). */
function nearestBarByLeftX(pointerX: number, geoms: MeasureGeom[]): number | null {
  if (geoms.length === 0) return null
  let best = geoms[0].barNo
  let bestD = Infinity
  for (const m of geoms) {
    const d = Math.abs(pointerX - m.rect.left)
    if (d < bestD) {
      bestD = d
      best = m.barNo
    }
  }
  return best
}

/** Nearest measure by right barline (`rect.right`). */
function nearestBarByRightX(pointerX: number, geoms: MeasureGeom[]): number | null {
  if (geoms.length === 0) return null
  let best = geoms[0].barNo
  let bestD = Infinity
  for (const m of geoms) {
    const d = Math.abs(pointerX - m.rect.right)
    if (d < bestD) {
      bestD = d
      best = m.barNo
    }
  }
  return best
}

type DragKind = 'start' | 'end'

type DragSession = {
  kind: DragKind
  previewLo: number
  previewHi: number
  pointerId: number
  captureEl: HTMLElement
}

export function SegmentLoopOverlay({
  enabled,
  startMeasure,
  endMeasure,
  containerRef,
  layoutRevision = 0,
  onRangeCommit,
}: SegmentLoopOverlayProps) {
  const [veilRects, setVeilRects] = useState<PxRect[]>([])
  const [startM, setStartM] = useState<MarkerStyle | null>(null)
  const [endM, setEndM] = useState<MarkerStyle | null>(null)

  const [committedStartBar, setCommittedStartBar] = useState(
    () => clampMeasureRange(startMeasure, endMeasure).from
  )
  const [committedEndBar, setCommittedEndBar] = useState(
    () => clampMeasureRange(startMeasure, endMeasure).to
  )

  const [dragging, setDragging] = useState<DragKind | null>(null)
  const [draftStartBar, setDraftStartBar] = useState(
    () => clampMeasureRange(startMeasure, endMeasure).from
  )
  const [draftEndBar, setDraftEndBar] = useState(
    () => clampMeasureRange(startMeasure, endMeasure).to
  )
  const onRangeCommitRef = useRef(onRangeCommit)
  onRangeCommitRef.current = onRangeCommit
  const dragSessionRef = useRef<DragSession | null>(null)

  const displayLo = dragging !== null ? draftStartBar : committedStartBar
  const displayHi = dragging !== null ? draftEndBar : committedEndBar

  useEffect(() => {
    if (!enabled) {
      const sess = dragSessionRef.current
      if (sess?.captureEl) {
        try {
          sess.captureEl.releasePointerCapture(sess.pointerId)
        } catch {
          /* already released */
        }
      }
      dragSessionRef.current = null
      setDragging(null)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const { from, to } = clampMeasureRange(startMeasure, endMeasure)
    setCommittedStartBar(from)
    setCommittedEndBar(to)
    if (dragging === null) {
      setDraftStartBar(from)
      setDraftEndBar(to)
    }
  }, [enabled, startMeasure, endMeasure, dragging])

  useEffect(() => {
    if (dragging == null || !enabled) return
    const el = containerRef.current
    if (!el) return

    const onPointerMove = (e: PointerEvent) => {
      const sess = dragSessionRef.current
      if (!sess || !el.isConnected) return
      if (e.pointerId !== sess.pointerId) return
      const cr = el.getBoundingClientRect()
      const pointerX = e.clientX - cr.left
      const flat = collectMeasureGeoms(el, cr)
      if (flat.length === 0) return

      if (sess.kind === 'start') {
        const bar = nearestBarByLeftX(pointerX, flat)
        if (bar == null) return
        const nextLo = Math.min(bar, sess.previewHi)
        if (nextLo === sess.previewLo) return
        sess.previewLo = nextLo
        setDraftStartBar(nextLo)
      } else {
        const bar = nearestBarByRightX(pointerX, flat)
        if (bar == null) return
        const nextHi = Math.max(bar, sess.previewLo)
        if (nextHi === sess.previewHi) return
        sess.previewHi = nextHi
        setDraftEndBar(nextHi)
      }
    }

    const endDrag = (e: PointerEvent) => {
      const sess = dragSessionRef.current
      if (!sess || e.pointerId !== sess.pointerId) return
      const cr = el.getBoundingClientRect()
      const pointerX = e.clientX - cr.left
      const flat = collectMeasureGeoms(el, cr)
      if (flat.length > 0) {
        if (sess.kind === 'start') {
          const bar = nearestBarByLeftX(pointerX, flat)
          if (bar != null) sess.previewLo = Math.min(bar, sess.previewHi)
        } else {
          const bar = nearestBarByRightX(pointerX, flat)
          if (bar != null) sess.previewHi = Math.max(bar, sess.previewLo)
        }
      }
      const lo = sess.previewLo
      const hi = sess.previewHi
      if (sess.captureEl) {
        try {
          sess.captureEl.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
      }
      dragSessionRef.current = null
      setCommittedStartBar(lo)
      setCommittedEndBar(hi)
      onRangeCommitRef.current?.(lo, hi)
      setDragging(null)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', endDrag)
    document.addEventListener('pointercancel', endDrag)
    return () => {
      const sess = dragSessionRef.current
      if (sess?.captureEl) {
        try {
          sess.captureEl.releasePointerCapture(sess.pointerId)
        } catch {
          /* noop */
        }
      }
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', endDrag)
      document.removeEventListener('pointercancel', endDrag)
    }
  }, [dragging, enabled, containerRef])

  useLayoutEffect(() => {
    if (!enabled) {
      setVeilRects([])
      setStartM(null)
      setEndM(null)
      return
    }
    const el = containerRef.current
    if (!el) {
      setVeilRects([])
      setStartM(null)
      setEndM(null)
      return
    }

    const run = () => {
      const cr = el.getBoundingClientRect()
      if (cr.width < 2 || cr.height < 2) {
        setVeilRects([])
        setStartM(null)
        setEndM(null)
        return
      }

      const groups = collectGroups(el)
      const { from: rangeLoBar, to: rangeHiBar } = clampMeasureRange(displayLo, displayHi)
      const flat = collectMeasureGeoms(el, cr)
      const systems = bucketMeasuresIntoSystems(flat)

      const markerLayout = computeMarkerXs(groups, rangeLoBar, rangeHiBar, cr)
      if (!markerLayout) {
        setVeilRects([])
        setStartM(null)
        setEndM(null)
        return
      }

      const { startMarkerX, endMarkerX, sr, er } = markerLayout
      const veilBlocks =
        groups.length > 0
          ? computeVeilRectsForSystems(systems, rangeLoBar, rangeHiBar, startMarkerX, endMarkerX)
          : []
      setVeilRects(veilBlocks)
      const top = Math.min(sr.top, er.top)
      const bot = Math.max(sr.top + sr.height, er.top + er.height)
      const h = Math.max(0, bot - top)
      setStartM({ left: startMarkerX, top, height: h })
      setEndM({ left: er.left + er.width, top, height: h })
    }

    const schedule = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(run)
      })
    }

    schedule()
    const ro = new ResizeObserver(() => schedule())
    ro.observe(el)
    const ev = () => schedule()
    window.addEventListener('scroll', ev, true)
    window.addEventListener('resize', ev)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', ev, true)
      window.removeEventListener('resize', ev)
    }
  }, [enabled, displayLo, displayHi, containerRef, layoutRevision])

  if (!enabled) return null

  const line = {
    position: 'absolute' as const,
    width: MARKER_LINE_WIDTH_PX,
    background: 'rgba(6, 182, 212, 0.95)',
    boxShadow: '0 0 6px rgba(6, 182, 212, 0.6)',
    pointerEvents: 'none' as const,
    zIndex: 60,
    borderRadius: 1,
  }

  const beginDrag = (kind: DragKind, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const { from, to } = clampMeasureRange(committedStartBar, committedEndBar)
    const t = e.currentTarget
    t.setPointerCapture(e.pointerId)
    dragSessionRef.current = {
      kind,
      previewLo: from,
      previewHi: to,
      pointerId: e.pointerId,
      captureEl: t,
    }
    setDraftStartBar(from)
    setDraftEndBar(to)
    setDragging(kind)
  }

  return (
    <div
      className="segment-loop-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 55,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {veilRects.map((r, i) => (
        <div
          key={`veil-${i}`}
          style={{
            position: 'absolute',
            left: r.left,
            top: r.top,
            width: Math.max(0, r.right - r.left),
            height: Math.max(0, r.bottom - r.top),
            background: SEGMENT_VEIL_BACKGROUND,
            boxSizing: 'border-box',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 56,
          }}
        />
      ))}
      {startM && endM && (
        <>
          <div aria-hidden style={{ ...line, left: startM.left, top: startM.top, height: startM.height }} />
          <div
            aria-hidden
            style={{ ...line, left: endM.left - MARKER_LINE_WIDTH_PX, top: endM.top, height: endM.height }}
          />
          <button
            type="button"
            aria-label="Drag loop start to a measure"
            className="segment-loop-handle segment-loop-handle--start"
            onPointerDown={(e) => beginDrag('start', e)}
            style={{
              position: 'absolute',
              left: startM.left + MARKER_LINE_WIDTH_PX / 2,
              top: startM.top,
              width: HANDLE_SIZE_PX,
              height: HANDLE_SIZE_PX,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: '2px solid #fff',
              padding: 0,
              background: 'rgba(6, 182, 212, 0.98)',
              boxShadow: '0 1px 5px rgba(0, 0, 0, 0.28)',
              zIndex: 62,
              pointerEvents: 'auto',
              touchAction: 'none',
              cursor: dragging === 'start' ? 'grabbing' : 'grab',
            }}
          />
          <button
            type="button"
            aria-label="Drag loop end to a measure"
            className="segment-loop-handle segment-loop-handle--end"
            onPointerDown={(e) => beginDrag('end', e)}
            style={{
              position: 'absolute',
              left: endM.left - MARKER_LINE_WIDTH_PX / 2,
              top: endM.top,
              width: HANDLE_SIZE_PX,
              height: HANDLE_SIZE_PX,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: '2px solid #fff',
              padding: 0,
              background: 'rgba(6, 182, 212, 0.98)',
              boxShadow: '0 1px 5px rgba(0, 0, 0, 0.28)',
              zIndex: 62,
              pointerEvents: 'auto',
              touchAction: 'none',
              cursor: dragging === 'end' ? 'grabbing' : 'grab',
            }}
          />
        </>
      )}
    </div>
  )
}

