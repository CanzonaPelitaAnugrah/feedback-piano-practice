import { useCallback, useEffect, useState } from 'react'
import type { StaffSelection } from '../lib/trainerTypes'

export interface LessonProgress {
  completed: boolean
  bestMistakes: number
  lastMistakes: number
  completedAt: string
}

const STORAGE_KEY = 'feedback-piano-practice.progress.v1'

/** Progress is per lesson (or score) and staff filter so upper/lower/both do not share completion state. */
export function lessonProgressKey(lessonId: string, staffSelection: StaffSelection): string {
  return `${lessonId}::${staffSelection}`
}

function isLessonProgress(value: unknown): value is LessonProgress {
  if (!value || typeof value !== 'object') return false

  const item = value as LessonProgress
  return (
    typeof item.completed === 'boolean' &&
    typeof item.bestMistakes === 'number' &&
    typeof item.lastMistakes === 'number' &&
    typeof item.completedAt === 'string'
  )
}

function readProgress(): Record<string, LessonProgress> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const clean: Record<string, LessonProgress> = {}

    for (const [lessonId, value] of Object.entries(parsed)) {
      if (isLessonProgress(value)) {
        clean[lessonId] = value
      }
    }

    return clean
  } catch (error) {
    console.error('Failed to read progress:', error)
    return {}
  }
}

function writeProgress(progress: Record<string, LessonProgress>) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch (error) {
    console.error('Failed to save progress:', error)
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({})

  useEffect(() => {
    setProgress(readProgress())
  }, [])

  const saveProgress = useCallback((lessonId: string, mistakes: number) => {
    const safeMistakes = Number.isFinite(mistakes) ? Math.max(0, mistakes) : 0

    setProgress((prev) => {
      const existing = prev[lessonId]

      const nextEntry: LessonProgress = {
        completed: true,
        bestMistakes: existing ? Math.min(existing.bestMistakes, safeMistakes) : safeMistakes,
        lastMistakes: safeMistakes,
        completedAt: new Date().toISOString(),
      }

      const next = {
        ...prev,
        [lessonId]: nextEntry,
      }

      writeProgress(next)
      return next
    })
  }, [])

  const clearProgress = useCallback(() => {
    setProgress({})
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return {
    progress,
    saveProgress,
    clearProgress,
  }
}
