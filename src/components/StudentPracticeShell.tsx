import type { CSSProperties, ReactNode, Ref } from 'react'
import { staffSelectionToLegacyDimStaff } from '../lib/staffSelectionBridge'
import type { StaffSelection } from '../lib/trainerTypes'
import { TargetStrip } from './TargetStrip'
import type { TargetStripProps } from './TargetStrip'
import { VirtualPiano } from './VirtualPiano'

export interface StudentPracticeShellProps {
  /** Ref for the score container (OSMD mounts here) */
  scoreContainerRef: React.RefObject<HTMLDivElement | null>
  /** Ref for the actual scroll/viewport wrapper around the score */
  scoreViewportRef?: React.RefObject<HTMLDivElement | null>
  /** Content for compact top bar (e.g. lesson name + settings button) */
  topBarContent: ReactNode
  /** Target strip: hand label, message, feedback, and visual variant */
  targetStrip: TargetStripProps
  /** Loading state for score */
  isScoreLoading?: boolean
  scoreError?: string | null
  /** Virtual piano props (activeNotes, handlers, guidance, etc.) */
  pianoProps: React.ComponentProps<typeof VirtualPiano>
  /** Completion overlay when isEnd */
  completionOverlay?: ReactNode
  /** Optional: reset button or other controls below score, above strip */
  scoreActions?: ReactNode
  /** Optional: staff segmented control (Play: Both / Upper / Lower) – always visible above score */
  staffControl?: ReactNode
  /** Optional: assigned-practice / mission list (above the score scroll viewport, not inside it) */
  assignedPracticePanel?: ReactNode
  /** Optional: small label near score e.g. "Both staves" / "Upper staff only" / "Lower staff only" */
  staffModeLabel?: string
  /** Which staff(ves) are active; inactive staves are dimmed when not `both`. */
  staffSelection?: StaffSelection
  /** Measured top/height for each veil (OSMD staff bounds); null = use legacy 50% bands */
  staffDimOverlayStyles?: { upperVeil: CSSProperties; lowerVeil: CSSProperties } | null
  /** `position: relative` frame wrapping the OSMD container; used for absolute overlays. */
  scoreOverlayFrameRef?: Ref<HTMLDivElement>
  /** e.g. focus segment veil; mounted inside the overlay frame */
  segmentOverlay?: ReactNode
  /** e.g. loop range markers over the score */
  loopOverlay?: ReactNode
}

export function StudentPracticeShell({
  scoreContainerRef,
  scoreViewportRef,
  topBarContent,
  targetStrip,
  isScoreLoading,
  scoreError,
  pianoProps,
  completionOverlay,
  scoreActions,
  staffControl,
  assignedPracticePanel,
  staffModeLabel,
  staffSelection = 'both',
  staffDimOverlayStyles = null,
  scoreOverlayFrameRef,
  segmentOverlay,
  loopOverlay,
}: StudentPracticeShellProps) {
  const staffModeForDimming = staffSelectionToLegacyDimStaff(staffSelection)

  return (
    <div
      className="student-practice-shell"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--shell-bg, #fafafa)',
      }}
    >
      {/* Compact top bar */}
      <header
        className="student-practice-topbar"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--topbar-border, #e5e7eb)',
          background: 'var(--topbar-bg, #fff)',
          minHeight: '48px',
        }}
      >
        {topBarContent}
      </header>

      {/* Large score workspace */}
      <div
        className="student-practice-score-workspace"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {assignedPracticePanel != null && (
          <div
            className="student-practice-mission-panels"
            style={{
              flexShrink: 0,
              width: '100%',
              maxWidth: '48rem',
              margin: '0 auto',
              padding: '0.5rem 1rem 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxSizing: 'border-box',
            }}
          >
            {assignedPracticePanel}
          </div>
        )}
        <div
          ref={scoreViewportRef as React.RefObject<HTMLDivElement>}
          className="score-workspace-inner"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '0.75rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {scoreError && (
            <p style={{ margin: '0 0 0.5rem', color: '#b91c1c', fontSize: '0.9rem' }}>{scoreError}</p>
          )}
          {staffControl}
          {staffModeLabel !== undefined && staffModeLabel !== '' && (
            <p
              className="staff-mode-label"
              style={{
                margin: '0.25rem 0 0.5rem',
                fontSize: '0.85rem',
                color: 'var(--staff-label-color, #64748b)',
              }}
            >
              {staffModeLabel}
            </p>
          )}
          <div
            className="score-wrapper"
            data-staff-mode={staffModeForDimming}
            style={{
              width: '100%',
              flex: 1,
              minHeight: '200px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              ref={scoreOverlayFrameRef}
              className="score-overlay-frame"
              style={{ position: 'relative', width: '100%', flexShrink: 0 }}
            >
              <div
                ref={scoreContainerRef as React.RefObject<HTMLDivElement>}
                className="score-container student-score-container"
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '100%',
                  minHeight: '200px',
                  background: '#ffffff',
                }}
              />
              {(staffModeForDimming === 'upper' || staffModeForDimming === 'lower') && (
                <div
                  className="staff-dim-veil-layer"
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 50,
                    pointerEvents: 'none',
                  }}
                >
                  {staffModeForDimming === 'upper' && (
                    <div
                      className="staff-dim-overlay staff-dim-overlay--lower"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        pointerEvents: 'none',
                        background: 'rgba(255, 255, 255, 0.75)',
                        ...(staffDimOverlayStyles
                          ? staffDimOverlayStyles.lowerVeil
                          : { top: '50%', height: '50%', bottom: 'auto' }),
                      }}
                    />
                  )}
                  {staffModeForDimming === 'lower' && (
                    <div
                      className="staff-dim-overlay staff-dim-overlay--upper"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        pointerEvents: 'none',
                        background: 'rgba(255, 255, 255, 0.75)',
                        ...(staffDimOverlayStyles
                          ? staffDimOverlayStyles.upperVeil
                          : { top: 0, bottom: 'auto', height: '50%' }),
                      }}
                    />
                  )}
                </div>
              )}
              {segmentOverlay}
              {loopOverlay}
            </div>
          </div>
          {isScoreLoading && !scoreError && (
            <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>Loading score…</p>
          )}
          {scoreActions}
          {completionOverlay}
        </div>
      </div>

      {/* Target / feedback strip */}
      <TargetStrip {...targetStrip} />

      {/* Keyboard dock – visually attached to score task */}
      <div
        className="student-practice-keyboard-dock"
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--keyboard-dock-border, #e5e7eb)',
          background: 'var(--keyboard-dock-bg, #f1f5f9)',
          padding: '0.5rem 0.75rem 0.75rem',
        }}
      >
        <VirtualPiano {...pianoProps} />
      </div>
    </div>
  )
}
