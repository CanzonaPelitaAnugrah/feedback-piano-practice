export interface Lesson {
  id: string
  title: string
  file: string
}

export const LESSONS: Lesson[] = [
  { id: 'lesson-1', title: 'Lesson 1: C D E F', file: '/scores/lesson-1.musicxml' },
  { id: 'lesson-2', title: 'Lesson 2: C C D E', file: '/scores/lesson-2.musicxml' },
  { id: 'lesson-3', title: 'Lesson 3: E D C D', file: '/scores/lesson-3.musicxml' },
]
