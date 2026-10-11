interface PracticeSettingsValue {
  showLabels: boolean
  showHint: boolean
  autoNext: boolean
}

interface PracticeSettingsProps {
  settings: PracticeSettingsValue
  onChange: (next: PracticeSettingsValue) => void
  expectedNoteText: string
}

export function PracticeSettings({
  settings,
  onChange,
  expectedNoteText,
}: PracticeSettingsProps) {
  const toggle = (key: keyof PracticeSettingsValue) => {
    onChange({
      ...settings,
      [key]: !settings[key],
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #3f3f46',
        background: '#262626',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#a3a3a3',
          }}
        >
          Target
        </span>

        {settings.showHint ? (
          <span
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #1d4ed8',
              background: 'rgba(30, 64, 175, 0.18)',
              color: '#93c5fd',
              fontWeight: 700,
              fontSize: '1.15rem',
            }}
          >
            {expectedNoteText !== '—' ? `Play ${expectedNoteText}` : 'Wait...'}
          </span>
        ) : (
          <span style={{ color: '#737373', fontStyle: 'italic' }}>Hint hidden</span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e5e5e5', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.showLabels}
            onChange={() => toggle('showLabels')}
          />
          Key labels
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e5e5e5', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.showHint}
            onChange={() => toggle('showHint')}
          />
          Show hint
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e5e5e5', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.autoNext}
            onChange={() => toggle('autoNext')}
          />
          Auto-next
        </label>
      </div>
    </div>
  )
}
