import type { MockTeacherPracticeTask } from '../data/mockTeacherPrescriptions'

const HAND_LABEL: Record<MockTeacherPracticeTask['handMode'], string> = {
  upper: 'Upper',
  lower: 'Lower',
  both: 'Both',
}

function formatBars(t: MockTeacherPracticeTask): string {
  return t.barStart === t.barEnd ? `Bar ${t.barStart}` : `Bars ${t.barStart}–${t.barEnd}`
}

function capitalizeMode(m: string): string {
  return m.charAt(0).toUpperCase() + m.slice(1)
}

function AssignedPracticeDebugLine({
  resolvedPieceIdentity,
  rawSourceTitle,
  matchedCount,
}: {
  resolvedPieceIdentity: string
  rawSourceTitle: string
  matchedCount: number
}) {
  const resolvedPart =
    resolvedPieceIdentity !== '' ? `resolved: ${resolvedPieceIdentity}` : 'resolved: —'
  const rawPart = rawSourceTitle !== '' ? `raw: ${rawSourceTitle}` : 'raw: —'
  return (
    <p
      style={{
        margin: '0 0 0.35rem',
        fontSize: '0.72rem',
        color: '#94a3b8',
        fontFamily: 'ui-monospace, monospace',
        lineHeight: 1.35,
      }}
    >
      [debug] {resolvedPart} · {rawPart} · matched: {matchedCount}
    </p>
  )
}

export function AssignedPracticePanel({
  tasks,
  onStartTask,
  debugAssignedPractice,
}: {
  tasks: MockTeacherPracticeTask[]
  onStartTask?: (task: MockTeacherPracticeTask) => void
  debugAssignedPractice?: {
    resolvedPieceIdentity: string
    rawSourceTitle: string
    matchedCount: number
  }
}) {
  if (tasks.length === 0) {
    return (
      <section
        className="assigned-practice-panel"
        aria-label="Assigned practice"
        style={{
          width: '100%',
          maxWidth: '42rem',
          margin: '0 0 0.75rem',
          padding: '0.65rem 0.85rem',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          background: '#f8fafc',
        }}
      >
        <h2
          style={{
            margin: '0 0 0.35rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: '#64748b',
          }}
        >
          Assigned practice
        </h2>
        {debugAssignedPractice != null && (
          <AssignedPracticeDebugLine
            resolvedPieceIdentity={debugAssignedPractice.resolvedPieceIdentity}
            rawSourceTitle={debugAssignedPractice.rawSourceTitle}
            matchedCount={debugAssignedPractice.matchedCount}
          />
        )}
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b' }}>No assigned tasks</p>
      </section>
    )
  }

  const first = tasks[0]!

  return (
    <section
      className="assigned-practice-panel"
      aria-label="Assigned practice"
      style={{
        width: '100%',
        maxWidth: '42rem',
        margin: '0 0 0.75rem',
        padding: '0.65rem 0.85rem',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        background: '#f8fafc',
      }}
    >
      <h2
        style={{
          margin: '0 0 0.25rem',
          fontSize: '0.82rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: '#64748b',
        }}
      >
        What to practice
      </h2>
      {debugAssignedPractice != null && (
        <AssignedPracticeDebugLine
          resolvedPieceIdentity={debugAssignedPractice.resolvedPieceIdentity}
          rawSourceTitle={debugAssignedPractice.rawSourceTitle}
          matchedCount={debugAssignedPractice.matchedCount}
        />
      )}
      <div style={{ marginBottom: '0.5rem' }}>
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#334155', lineHeight: 1.35 }}>
          {first.pieceTitle}
        </p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>{first.weekLabel}</p>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {tasks.map((t) => (
          <li
            key={t.taskId}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              gap: '0.5rem 0.75rem',
              padding: '0.5rem 0.6rem',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              background: '#fff',
            }}
          >
            <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: '#334155',
                  lineHeight: 1.35,
                }}
              >
                {formatBars(t)}
                <span style={{ fontWeight: 400, color: '#94a3b8' }}> · </span>
                {HAND_LABEL[t.handMode]}
                <span style={{ fontWeight: 400, color: '#94a3b8' }}> · </span>
                {capitalizeMode(t.practiceMode)}
                <span style={{ fontWeight: 400, color: '#94a3b8' }}> · </span>
                {t.repsGoal} rep{t.repsGoal !== 1 ? 's' : ''}
              </div>
              {t.focusLabel != null && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#475569' }}>
                  Focus: {t.focusLabel}
                </p>
              )}
              {t.teacherNoteChild != null && t.teacherNoteChild !== '' && (
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
                  {t.teacherNoteChild}
                </p>
              )}
            </div>
            <button
              type="button"
              className="assigned-practice-start"
              onClick={() => onStartTask?.(t)}
              style={{
                flexShrink: 0,
                alignSelf: 'center',
                padding: '0.3rem 0.65rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid #94a3b8',
                background: '#fff',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              Start
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
