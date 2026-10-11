import type { BannerTone } from '../lib/childFeedback'
import { BANNER_TONE_CLASS } from '../lib/childFeedback'

export interface TargetStripProps {
  handLabel: string
  handEmoji: string
  /** Main instruction / target action (e.g. "Tekan yang ini", "Hebat!") */
  message: string
  /** Optional note name / target label (e.g. "C4") */
  targetNoteLabel?: string
  /** Short feedback line (e.g. from CalmFeedbackText: "Play the note.", "Good.") */
  feedbackMessage: string
  /** Optional hint text when showHint is true (e.g. "Play C4") */
  hintText?: string
  /** Global toggle from settings: when false, hide hint text area. */
  showHint?: boolean
  bannerTone: BannerTone
  /** Visual variant for strip: default music vs beginner drill. */
  variant?: 'music' | 'beginnerDrill'
}

export function TargetStrip({
  handLabel,
  handEmoji,
  message,
  targetNoteLabel,
  feedbackMessage,
  hintText,
  bannerTone,
  showHint = true,
  variant = 'music',
}: TargetStripProps) {
  const isBeginnerDrill = variant === 'beginnerDrill'

  return (
    <div
      className="target-strip"
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: isBeginnerDrill ? '0.35rem' : '0.5rem',
        padding: isBeginnerDrill ? '0.65rem 0.75rem 0.5rem' : '0.5rem 0.75rem',
        background: isBeginnerDrill
          ? '#020617'
          : 'var(--target-strip-bg, #f8fafc)',
        borderTop: isBeginnerDrill
          ? '2px solid #0f172a'
          : '1px solid var(--target-strip-border, #e2e8f0)',
      }}
    >
      <div
        className={`target-strip-banner ${BANNER_TONE_CLASS[bannerTone]}`}
        style={{
          width: '100%',
          maxWidth: '32rem',
          textAlign: 'center',
          padding: isBeginnerDrill ? '0.55rem 0.9rem' : '0.5rem 0.75rem',
          borderRadius: '14px',
          borderWidth: isBeginnerDrill ? '0px' : '2px',
          borderStyle: 'solid',
          fontSize: isBeginnerDrill ? '1.2rem' : '1.1rem',
          fontWeight: 800,
          letterSpacing: isBeginnerDrill ? '0.02em' : undefined,
          transition: 'background 0.2s, border-color 0.2s, transform 0.15s',
          background: isBeginnerDrill ? '#22c55e' : undefined,
          color: isBeginnerDrill ? '#022c22' : undefined,
          boxShadow: isBeginnerDrill
            ? '0 6px 18px rgba(34,197,94,0.35)'
            : undefined,
        }}
      >
        {isBeginnerDrill && (
          <div
            style={{
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              opacity: 0.85,
              marginBottom: '0.15rem',
            }}
          >
            Beginner drill
          </div>
        )}
        <div>{message}</div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: isBeginnerDrill ? '0.95rem' : '0.9rem',
          fontWeight: 600,
          color: isBeginnerDrill
            ? '#e5e7eb'
            : 'var(--target-strip-hand-color, #475569)',
        }}
      >
        <span aria-hidden>{handEmoji}</span>
        <span>{handLabel}</span>
      </div>
      {targetNoteLabel && (
        <div
          style={{
            padding: '0.25rem 0.6rem',
            borderRadius: '999px',
            border: isBeginnerDrill
              ? '1px solid rgba(248,250,252,0.2)'
              : '1px solid var(--target-strip-note-border, #cbd5f5)',
            background: isBeginnerDrill
              ? 'rgba(15,23,42,0.9)'
              : 'var(--target-strip-note-bg, #e0edff)',
            color: isBeginnerDrill
              ? '#e5e7eb'
              : 'var(--target-strip-note-color, #1e3a8a)',
            fontSize: '0.9rem',
            fontWeight: 700,
          }}
        >
          {targetNoteLabel}
        </div>
      )}
      <p
        style={{
          margin: 0,
          fontSize: isBeginnerDrill ? '0.95rem' : '0.9rem',
          fontWeight: 500,
          color: isBeginnerDrill
            ? '#cbd5f5'
            : 'var(--target-strip-feedback-color, #525252)',
          textAlign: 'center',
        }}
      >
        {feedbackMessage}
      </p>
      {showHint && hintText && (
        <div
          style={{
            fontSize: '0.9rem',
            color: isBeginnerDrill
              ? '#a5b4fc'
              : 'var(--target-strip-hint-color, #64748b)',
            fontWeight: 500,
            textAlign: 'center',
          }}
        >
          {hintText}
        </div>
      )}
    </div>
  )
}
