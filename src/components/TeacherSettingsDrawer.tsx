import type { HandMode, PracticeMode } from '../lib/trainerTypes'
import type { InputFeedback } from '../lib/trainerTypes'
import type { ChildFeedback } from '../lib/childFeedback'
import { formatNoteArray } from '../lib/midiUtils'

type KeyboardSpanKey = '2-oct' | '3-oct'

interface PracticeSettingsValue {
  showLabels: boolean
  showHint: boolean
  autoNext: boolean
}

export interface TeacherSettingsDrawerProps {
  open: boolean
  onClose: () => void
  /** Navigate back to lesson library */
  onBackToLessons?: () => void
  /** Upload */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onUploadClick: () => void
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Progress */
  onResetProgress: () => void
  /** Keyboard span */
  keyboardSpan: KeyboardSpanKey
  setKeyboardSpan: (v: KeyboardSpanKey) => void
  /** Hand (optional; staff is controlled above the score) */
  handMode: HandMode
  setHandMode: (v: HandMode) => void
  /** Practice mode: regular vs beginner drill */
  practiceMode: PracticeMode
  setPracticeMode: (v: PracticeMode) => void
  /** Practice toggles */
  settings: PracticeSettingsValue
  setSettings: (v: PracticeSettingsValue) => void
  /** Debug */
  debugMode: boolean
  setDebugMode: (v: boolean) => void
  /** Debug-only data (shown when debugMode) */
  expectedNotes?: number[]
  combinedNotes?: Set<number>
  mistakes?: number
  bestScore?: number
  feedbackLabel?: string
  attemptFeedback?: InputFeedback
  childUi?: ChildFeedback
  currentScoreDebug?: { labels: string[]; halfTones: number[] }
  midiError?: string | null
  midiReady?: boolean
  scoreError?: string | null
  isSingleStaffScore?: boolean
  /** Whether staff filter actually changes which notes become targets for this score. */
  staffFilterSupported?: boolean
  /** Whether hand filter actually changes which notes become targets for this score. */
  handFilterSupported?: boolean
  /** Whether auto-next actually advances to the next built-in lesson (not custom uploads). */
  autoNextSupported?: boolean
  /** Optional: focus segment by measure number (1-based bars; visual overlay). */
  focusFromMeasure?: string
  focusToMeasure?: string
  onFocusFromMeasureChange?: (value: string) => void
  onFocusToMeasureChange?: (value: string) => void
  onApplyFocusRange?: () => void
  onClearFocusRange?: () => void
  focusRangeActive?: boolean
}

export function TeacherSettingsDrawer({
  open,
  onClose,
  onBackToLessons,
  fileInputRef,
  onUploadClick,
  onFileUpload,
  onResetProgress,
  keyboardSpan,
  setKeyboardSpan,
  handMode,
  setHandMode,
  practiceMode,
  setPracticeMode,
  settings,
  setSettings,
  debugMode,
  setDebugMode,
  expectedNotes = [],
  combinedNotes = new Set(),
  mistakes = 0,
  bestScore,
  feedbackLabel = '—',
  attemptFeedback = { kind: 'idle' },
  childUi,
  currentScoreDebug = { labels: [], halfTones: [] },
  midiError,
  midiReady,
  scoreError,
  handFilterSupported = true,
  autoNextSupported = true,
  focusFromMeasure = '',
  focusToMeasure = '',
  onFocusFromMeasureChange,
  onFocusToMeasureChange,
  onApplyFocusRange,
  onClearFocusRange,
  focusRangeActive = false,
}: TeacherSettingsDrawerProps) {
  const toggle = (key: keyof PracticeSettingsValue) => {
    setSettings({ ...settings, [key]: !settings[key] })
  }

  if (!open) return null

  return (
    <>
      <div
        className="teacher-drawer-backdrop"
        role="button"
        tabIndex={-1}
        aria-label="Close settings"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 1000,
        }}
      />
      <div
        className="teacher-drawer"
        role="dialog"
        aria-label="Teacher settings"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(360px, 90vw)',
          background: '#1e293b',
          color: '#e2e8f0',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
          zIndex: 1001,
          overflowY: 'auto',
          padding: '1rem 1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Teacher settings</h2>
          <button type="button" onClick={onClose} style={{ padding: '0.35rem 0.5rem', fontSize: '0.9rem' }}>
            Close
          </button>
        </div>

        <input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept=".xml,.musicxml"
          onChange={onFileUpload}
          style={{ display: 'none' }}
          aria-hidden
          tabIndex={-1}
        />

        <section style={{ marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {onBackToLessons && (
            <button type="button" onClick={onBackToLessons}>
              Back to lessons
            </button>
          )}
          <button type="button" onClick={onUploadClick}>
            Upload XML
          </button>
          <button
            type="button"
            onClick={onResetProgress}
            style={{
              display: 'block',
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Reset all progress
          </button>
        </section>

        <section style={{ marginBottom: '1.25rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Keyboard span</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="drawer-keyboardSpan"
                checked={keyboardSpan === '2-oct'}
                onChange={() => setKeyboardSpan('2-oct')}
              />
              <span>2 octaves</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="drawer-keyboardSpan"
                checked={keyboardSpan === '3-oct'}
                onChange={() => setKeyboardSpan('3-oct')}
              />
              <span>3 octaves</span>
            </label>
          </div>
        </section>

        <section style={{ marginBottom: '1.25rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Practice mode</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', alignItems: 'center' }}>
            {(['regular', 'drill'] as const).map((m) => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="drawer-practiceMode"
                  checked={practiceMode === m}
                  onChange={() => setPracticeMode(m)}
                />
                <span>{m === 'regular' ? 'Music reading' : 'Beginner drill'}</span>
              </label>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: '1.25rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 500, fontSize: '0.85rem', color: '#94a3b8' }}>Hand (optional)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', alignItems: 'center' }}>
            {(['both', 'right', 'left'] as const).map((h) => (
              <label key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="drawer-handMode"
                  checked={handMode === h}
                  onChange={() => setHandMode(h)}
                  disabled={!handFilterSupported && h !== 'both'}
                />
                <span>{h === 'both' ? 'Both' : h === 'right' ? 'Right' : 'Left'}</span>
              </label>
            ))}
          </div>
          {!handFilterSupported && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Hand filter not available for this score.
            </p>
          )}
        </section>

        {onApplyFocusRange && onClearFocusRange && onFocusFromMeasureChange && onFocusToMeasureChange && (
          <section style={{ marginBottom: '1.25rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Advanced: Set by measure numbers</p>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
              Measure numbers (1-based). White veil outside range per system; green = start bar, red = end bar.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                From
                <input
                  type="number"
                  min={1}
                  value={focusFromMeasure}
                  onChange={(e) => onFocusFromMeasureChange(e.target.value)}
                  style={{ width: '4rem', padding: '0.25rem' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                To
                <input
                  type="number"
                  min={1}
                  value={focusToMeasure}
                  onChange={(e) => onFocusToMeasureChange(e.target.value)}
                  style={{ width: '4rem', padding: '0.25rem' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" onClick={onApplyFocusRange}>
                Apply focus
              </button>
              <button type="button" onClick={onClearFocusRange} disabled={!focusRangeActive}>
                Clear focus
              </button>
            </div>
          </section>
        )}

        <section style={{ marginBottom: '1.25rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Practice</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.showLabels} onChange={() => toggle('showLabels')} />
              Key labels
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.showHint} onChange={() => toggle('showHint')} />
              Show hint
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autoNext}
                onChange={() => toggle('autoNext')}
                disabled={!autoNextSupported}
              />
              Auto-next lesson
            </label>
          </div>
          {!autoNextSupported && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Auto-next is only available for built-in lessons, not custom uploads.
            </p>
          )}
        </section>

        <section style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={debugMode} onChange={(e) => setDebugMode(e.target.checked)} />
            <span>Debug mode</span>
          </label>
        </section>

        {debugMode && (
          <section
            className="teacher-drawer-debug"
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#0f172a',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            }}
          >
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Expected: {formatNoteArray(expectedNotes)}</p>
            <p style={{ margin: '0 0 0.5rem' }}>Pressed: {formatNoteArray(Array.from(combinedNotes))}</p>
            <p style={{ margin: '0 0 0.5rem' }}>Mistakes: {mistakes}</p>
            <p style={{ margin: '0 0 0.5rem' }}>Best: {bestScore ?? '—'}</p>
            <p style={{ margin: '0 0 0.5rem' }}>Feedback: {feedbackLabel}</p>
            <p style={{ margin: '0 0 0.5rem', color: '#94a3b8' }}>
              Attempt:{' '}
              {attemptFeedback.kind === 'idle'
                ? 'idle'
                : attemptFeedback.kind === 'correct'
                  ? 'correct'
                  : attemptFeedback.kind === 'almost'
                    ? `almost (${attemptFeedback.direction})`
                    : 'wrong'}
            </p>
            {childUi && (
              <p style={{ margin: '0 0 0.5rem', color: '#94a3b8' }}>
                Child: {childUi.handEmoji} {childUi.message}
              </p>
            )}
            <p style={{ margin: '0 0 0.5rem', color: '#94a3b8' }}>
              Score labels: {(currentScoreDebug?.labels ?? []).join(', ') || '—'}
            </p>
            <p style={{ margin: '0 0 0.5rem', color: '#94a3b8' }}>
              HalfTone: {(currentScoreDebug?.halfTones ?? []).join(', ') || '—'}
            </p>
            <p style={{ margin: '0 0 0.5rem', color: '#94a3b8' }}>
              Expected midi: {(expectedNotes ?? []).join(', ') || '—'}
            </p>
            {midiError && <p style={{ margin: '0 0 0.5rem', color: '#f87171' }}>MIDI: {midiError}</p>}
            {!midiError && !midiReady && <p style={{ margin: '0 0 0.5rem', color: '#94a3b8' }}>Requesting MIDI…</p>}
            {scoreError && <p style={{ margin: '0 0 0.5rem', color: '#f87171' }}>Score: {scoreError}</p>}
          </section>
        )}
      </div>
    </>
  )
}
