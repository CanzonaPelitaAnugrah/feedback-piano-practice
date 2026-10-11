export interface LessonOption {
  id: string
  label: string
  scoreUrl: string
}

export const LESSONS: LessonOption[] = [
  { id: 'sample', label: 'Sample', scoreUrl: '/sample.musicxml' },
  { id: 'lesson-2', label: 'Lesson 2', scoreUrl: '/scores/lesson-2.musicxml' },
  { id: 'lesson-3', label: 'Lesson 3', scoreUrl: '/scores/lesson-3.musicxml' },
]
