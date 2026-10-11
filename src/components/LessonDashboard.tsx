import { lessonProgressKey, type LessonProgress } from '../hooks/useProgress'
import type { StaffSelection } from '../lib/trainerTypes'

type LessonLike = {
  id: string
  label: string
}

interface LessonDashboardProps {
  lessons: LessonLike[]
  progress: Record<string, LessonProgress>
  /** Which staff filter the library stars reflect (isolated from other staff modes). */
  staffSelectionForProgress: StaffSelection
  selectedLessonIndex: number
  onSelectLesson: (index: number) => void
}

export function LessonDashboard({
  lessons,
  progress,
  staffSelectionForProgress,
  selectedLessonIndex,
  onSelectLesson,
}: LessonDashboardProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
      }}
    >
      {lessons.map((lesson, index) => {
        const isSelected = index === selectedLessonIndex
        const item = progress[lessonProgressKey(lesson.id, staffSelectionForProgress)]
        const isCompleted = item?.completed

        return (
          <button
            key={lesson.id}
            type="button"
            onClick={() => onSelectLesson(index)}
            style={{
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: '12px',
              border: isSelected ? '1px solid #3b82f6' : '1px solid #3f3f46',
              background: isSelected ? 'rgba(37, 99, 235, 0.18)' : '#262626',
              color: 'white',
              cursor: 'pointer',
              boxShadow: isSelected ? '0 8px 18px rgba(37, 99, 235, 0.12)' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '8px',
              }}
            >
              <div style={{ fontWeight: 700, color: isSelected ? '#93c5fd' : '#f5f5f5' }}>
                {lesson.label}
              </div>
              {isCompleted ? <span title="Completed">✅</span> : null}
            </div>

            <div style={{ fontSize: '0.85rem', color: '#a3a3a3' }}>
              {isCompleted ? `Best score: ${item.bestMistakes} mistakes` : 'Not started yet'}
            </div>
          </button>
        )
      })}
    </div>
  )
}
