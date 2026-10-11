import type { RefObject } from 'react'
import { useCallback, useLayoutEffect, useState } from 'react'
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'

type GraphicalMusicPageLike = { PageNumber: number }
type MusicSystemLike = { Id: number; Parent: GraphicalMusicPageLike }
type GraphicalMeasureLike = {
  IsExtraGraphicalMeasure: boolean
  ParentMusicSystem: MusicSystemLike
  PositionAndShape: {
    BoundingRectangle: { x: number; y: number; width: number; height: number }
    Size: { width: number; height: number }
  }
}

type VexFlowBackendLike = {
  graphicalMusicPage?: GraphicalMusicPageLike
  getInnerElement?: () => HTMLElement
}

type VexFlowDrawerLike = {
  calculatePixelDistance: (unitDistance: number) => number
  Backends: VexFlowBackendLike[]
}

export type SegmentOverlayProps = {
  /** When false or focus range is empty, nothing is rendered. */
  enabled: boolean
  /** Inclusive bar numbers as shown to humans (first bar = 1). Mapped to OSMD `MeasureList` index via `index = barNo - 1`. */
  focusFromMeasure: number
  /** Inclusive end bar number (1-based). */
  focusToMeasure: number
  osmd: OpenSheetMusicDisplay | null
  containerRef: RefObject<HTMLElement | null>
  /** Bumped after OSMD render / layout-affecting updates (e.g. from useOsmdScore). */
  layoutRevision?: number
}

type PxRect = { left: number; top: number; right: number; bottom: number }

type MeasureGeom = {
  measureIndex: number
  systemKey: string
  rect: PxRect
}

function clampMeasureRange(from: number, to: number): { from: number; to: number } {
  const a = Math.round(from)
  const b = Math.round(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { from: 0, to: 0 }
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

function unionRects(a: PxRect, b: PxRect): PxRect {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }
}

function normalizeRect(r: PxRect): PxRect {
  return {
    left: Math.min(r.left, r.right),
    right: Math.max(r.left, r.right),
    top: Math.min(r.top, r.bottom),
    bottom: Math.max(r.top, r.bottom),
  }
}

function backendForPage(drawer: VexFlowDrawerLike, page: GraphicalMusicPageLike) {
  const backends = drawer.Backends
  if (!Array.isArray(backends) || backends.length === 0) return null

  const pageNo = page?.PageNumber
  if (typeof pageNo === 'number' && Number.isFinite(pageNo)) {
    const byNo = backends.find((b) => b.graphicalMusicPage?.PageNumber === pageNo)
    if (byNo?.getInnerElement) return byNo
  }

  const byRef = backends.find((b) => b.graphicalMusicPage === page)
  if (byRef?.getInnerElement) return byRef

  const withInner = backends.find((b) => typeof b.getInnerElement === 'function')
  return withInner ?? backends[0] ?? null
}

function measureToFrameRect(
  osmd: OpenSheetMusicDisplay,
  gm: GraphicalMeasureLike,
  frameRect: DOMRect
): PxRect | null {
  const drawer = osmd.Drawer as unknown as VexFlowDrawerLike
  if (!drawer?.calculatePixelDistance || !Array.isArray(drawer.Backends)) return null

  const sys = gm.ParentMusicSystem
  const page = sys?.Parent
  if (!page) return null

  const backend = backendForPage(drawer, page)
  if (!backend) return null

  const inner = backend.getInnerElement?.()
  if (!inner) return null

  const innerRect = inner.getBoundingClientRect()
  const ox = innerRect.left - frameRect.left
  const oy = innerRect.top - frameRect.top

  const bb = gm.PositionAndShape
  if (!bb) return null

  const br = bb.BoundingRectangle
  if (!br || !Number.isFinite(br.x) || !Number.isFinite(br.y)) return null

  const w = Number.isFinite(br.width) ? br.width : bb.Size?.width ?? 0
  const h = Number.isFinite(br.height) ? br.height : bb.Size?.height ?? 0
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null

  const left = ox + drawer.calculatePixelDistance(br.x)
  const top = oy + drawer.calculatePixelDistance(br.y)
  const right = left + drawer.calculatePixelDistance(w)
  const bottom = top + drawer.calculatePixelDistance(h)

  if (![left, top, right, bottom].every((v) => Number.isFinite(v))) return null
  return normalizeRect({ left, top, right, bottom })
}

function flattenMeasureList(osmd: OpenSheetMusicDisplay, frameEl: HTMLElement): MeasureGeom[] {
  const sheet = osmd.GraphicSheet
  const measureList = sheet?.MeasureList
  if (!Array.isArray(measureList)) return []

  const frameRect = frameEl.getBoundingClientRect()
  const out: MeasureGeom[] = []

  for (let measureIndex = 0; measureIndex < measureList.length; measureIndex++) {
    const staffRow = measureList[measureIndex]
    if (!staffRow) continue

    for (let s = 0; s < staffRow.length; s++) {
      const gm = staffRow[s] as GraphicalMeasureLike | undefined
      if (!gm) continue
      if (gm.IsExtraGraphicalMeasure) continue

      const sys = gm.ParentMusicSystem
      const page = sys?.Parent
      if (!sys || !page) continue

      const rect = measureToFrameRect(osmd, gm, frameRect)
      if (!rect) continue

      const systemKey = `${page.PageNumber ?? 0}:${sys.Id}`
      out.push({ measureIndex, systemKey, rect })
    }
  }

  return out
}

function groupBySystemKey(measures: MeasureGeom[]): Map<string, MeasureGeom[]> {
  const map = new Map<string, MeasureGeom[]>()
  for (const m of measures) {
    const list = map.get(m.systemKey)
    if (list) list.push(m)
    else map.set(m.systemKey, [m])
  }
  return map
}

function unionByMeasureIndex(rows: MeasureGeom[]): Map<number, PxRect> {
  const map = new Map<number, PxRect>()
  for (const m of rows) {
    const prev = map.get(m.measureIndex)
    map.set(m.measureIndex, prev ? unionRects(prev, m.rect) : m.rect)
  }
  return map
}

/** OSMD `MeasureList` is 0-based on measure index; UI uses 1-based bar numbers. */
function humanBarsToMeasureIndices(fromBar: number, toBar: number): { fromIdx: number; toIdx: number } {
  const { from: a, to: b } = clampMeasureRange(fromBar, toBar)
  const fromIdx = Math.max(0, a - 1)
  const toIdx = Math.max(0, b - 1)
  return fromIdx <= toIdx ? { fromIdx, toIdx } : { fromIdx: toIdx, toIdx: fromIdx }
}

export function SegmentOverlay({
  enabled,
  focusFromMeasure,
  focusToMeasure,
  osmd,
  containerRef,
  layoutRevision = 0,
}: SegmentOverlayProps) {
  const [veilRects, setVeilRects] = useState<PxRect[]>([])
  const [startLines, setStartLines] = useState<PxRect[]>([])
  const [endLines, setEndLines] = useState<PxRect[]>([])

  const recompute = useCallback(() => {
    if (!enabled || !osmd) {
      setVeilRects([])
      setStartLines([])
      setEndLines([])
      return
    }

    const frameEl = containerRef.current
    if (!frameEl || !frameEl.isConnected) {
      setVeilRects([])
      setStartLines([])
      setEndLines([])
      return
    }

    const { fromIdx, toIdx } = humanBarsToMeasureIndices(focusFromMeasure, focusToMeasure)
    const flat = flattenMeasureList(osmd, frameEl)
    if (flat.length === 0) {
      setVeilRects([])
      setStartLines([])
      setEndLines([])
      return
    }

    const bySystem = groupBySystemKey(flat)

    const veils: PxRect[] = []
    const starts: PxRect[] = []
    const ends: PxRect[] = []

    const frameH = frameEl.clientHeight
    const frameW = frameEl.clientWidth
    if (frameW < 2 || frameH < 2) {
      setVeilRects([])
      setStartLines([])
      setEndLines([])
      return
    }

    const markerThickness = 3
    const markerOverhang = 4

    for (const [, combined] of bySystem) {
      if (combined.length === 0) continue

      let systemBounds = combined[0].rect
      for (let i = 1; i < combined.length; i++) {
        systemBounds = unionRects(systemBounds, combined[i].rect)
      }
      systemBounds = normalizeRect(systemBounds)
      const sysLeft = systemBounds.left
      const sysRight = systemBounds.right

      const byM = unionByMeasureIndex(combined)
      const inRangeRects: PxRect[] = []
      for (const [mi, r] of byM) {
        if (mi >= fromIdx && mi <= toIdx) inRangeRects.push(r)
      }

      if (inRangeRects.length === 0) {
        veils.push({
          left: sysLeft,
          top: systemBounds.top,
          right: sysRight,
          bottom: systemBounds.bottom,
        })
        continue
      }

      let focusUnion = inRangeRects[0]
      for (let i = 1; i < inRangeRects.length; i++) {
        focusUnion = unionRects(focusUnion, inRangeRects[i])
      }
      focusUnion = normalizeRect(focusUnion)

      if (focusUnion.left > sysLeft + 0.5) {
        veils.push({
          left: sysLeft,
          top: systemBounds.top,
          right: focusUnion.left,
          bottom: systemBounds.bottom,
        })
      }
      if (focusUnion.right < sysRight - 0.5) {
        veils.push({
          left: focusUnion.right,
          top: systemBounds.top,
          right: sysRight,
          bottom: systemBounds.bottom,
        })
      }

      const fromRect = byM.get(fromIdx)
      if (fromRect) {
        starts.push({
          left: fromRect.left - markerThickness / 2,
          top: fromRect.top - markerOverhang,
          right: fromRect.left + markerThickness / 2,
          bottom: fromRect.bottom + markerOverhang,
        })
      }

      const toRect = byM.get(toIdx)
      if (toRect) {
        ends.push({
          left: toRect.right - markerThickness / 2,
          top: toRect.top - markerOverhang,
          right: toRect.right + markerThickness / 2,
          bottom: toRect.bottom + markerOverhang,
        })
      }
    }

    setVeilRects(veils)
    setStartLines(starts)
    setEndLines(ends)
  }, [containerRef, enabled, focusFromMeasure, focusToMeasure, osmd, layoutRevision])

  useLayoutEffect(() => {
    recompute()
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(recompute)
    })
    return () => cancelAnimationFrame(id)
  }, [recompute])

  useLayoutEffect(() => {
    const frameEl = containerRef.current
    if (!frameEl) return

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(recompute)
    })
    ro.observe(frameEl)
    return () => ro.disconnect()
  }, [containerRef, recompute])

  if (!enabled) return null

  return (
    <div
      className="segment-focus-overlay"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
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
            background: 'rgba(255, 255, 255, 0.82)',
            boxSizing: 'border-box',
          }}
        />
      ))}
      {startLines.map((r, i) => (
        <div
          key={`start-${i}`}
          style={{
            position: 'absolute',
            left: r.left,
            top: r.top,
            width: Math.max(1, r.right - r.left),
            height: Math.max(0, r.bottom - r.top),
            background: 'rgba(34, 197, 94, 0.98)',
            boxShadow: '0 0 0 1px rgba(21,128,61,0.45)',
          }}
        />
      ))}
      {endLines.map((r, i) => (
        <div
          key={`end-${i}`}
          style={{
            position: 'absolute',
            left: r.left,
            top: r.top,
            width: Math.max(1, r.right - r.left),
            height: Math.max(0, r.bottom - r.top),
            background: 'rgba(239, 68, 68, 0.98)',
            boxShadow: '0 0 0 1px rgba(185,28,28,0.45)',
          }}
        />
      ))}
    </div>
  )
}

