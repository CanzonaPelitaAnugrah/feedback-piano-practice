/**
 * Local mock teacher prescriptions — shape matches a future dashboard/API feed.
 * Rendered in practice UI (AssignedPracticePanel); practice flow not driven by these yet.
 */

export type MockTeacherHandMode = 'upper' | 'lower' | 'both'
export type MockTeacherPracticeMode = 'learn' | 'practice' | 'play'
export type MockTeacherFocusLabel = 'accuracy' | 'rhythm' | 'fingering' | 'memory' | 'voicing'

export interface MockTeacherPracticeTask {
  assignmentId: string
  taskId: string
  pieceId: string
  pieceTitle: string
  /** Optional extra strings (titles, filenames, slugs) matched after normalization. */
  pieceAliases?: string[]
  weekLabel: string
  dayIndex: number
  totalDays: number
  barStart: number
  barEnd: number
  repsGoal: number
  cleanThreshold100: number
  handMode: MockTeacherHandMode
  practiceMode: MockTeacherPracticeMode
  focusLabel?: MockTeacherFocusLabel
  teacherNoteChild?: string
  teacherNoteParent?: string
  tempoTarget?: number
}

/** Active mission uses the same fields as assigned tasks (future API rows). */
export type ActivePracticeMission = MockTeacherPracticeTask

export type MissionPracticeProgressStatus =
  | 'not_started'
  | 'under_construction'
  | 'accurate_slowly'
  | 'completed'

/** Mission-level practice progress (not derived from completion-card stars). */
export type ActiveMissionPracticeProgress = {
  attemptsCount: number
  cleanRepetitionsCount: number
  bestScore100: number | null
  latestScore100: number | null
  completed: boolean
  status: MissionPracticeProgressStatus
}

export function initialActiveMissionPracticeProgress(): ActiveMissionPracticeProgress {
  return {
    attemptsCount: 0,
    cleanRepetitionsCount: 0,
    bestScore100: null,
    latestScore100: null,
    completed: false,
    status: 'not_started',
  }
}

/**
 * `completed` when clean repetitions meet the teacher rep goal.
 * Status is independent of visual star feedback.
 */
export function missionProgressFromCounts(
  attemptsCount: number,
  cleanRepetitionsCount: number,
  repsGoal: number
): Pick<ActiveMissionPracticeProgress, 'completed' | 'status'> {
  const completed = cleanRepetitionsCount >= repsGoal
  if (completed) {
    return { completed: true, status: 'completed' }
  }
  if (attemptsCount === 0) {
    return { completed: false, status: 'not_started' }
  }
  if (cleanRepetitionsCount === 0) {
    return { completed: false, status: 'under_construction' }
  }
  return { completed: false, status: 'accurate_slowly' }
}

const MINUET_MOCK_ALIASES = [
  'minuet-g-major',
  'minuet in g major',
  'bach minuet in g major',
  'lg-151411412.xml',
] as const

/** All mock rows (multiple pieces allowed; filter with `getMockTeacherPrescriptionsForPiece`). */
export const MOCK_TEACHER_PRESCRIPTION_TASKS: MockTeacherPracticeTask[] = [
  {
    assignmentId: 'asgn-demo-week3',
    taskId: 'task-sample-bars-2-5-both-learn',
    pieceId: 'sample',
    pieceTitle: 'Sample',
    weekLabel: 'Week 3',
    dayIndex: 1,
    totalDays: 5,
    barStart: 2,
    barEnd: 5,
    repsGoal: 3,
    cleanThreshold100: 85,
    handMode: 'both',
    practiceMode: 'learn',
    focusLabel: 'accuracy',
    teacherNoteChild: 'Bars 2–5: play slowly and match each note before speeding up.',
    teacherNoteParent: 'Aim for three clean passes in a row at a steady tempo.',
    tempoTarget: 60,
  },
  {
    assignmentId: 'asgn-demo-week3',
    taskId: 'task-sample-bars-8-10-upper-practice',
    pieceId: 'sample',
    pieceTitle: 'Sample',
    weekLabel: 'Week 3',
    dayIndex: 2,
    totalDays: 5,
    barStart: 8,
    barEnd: 10,
    repsGoal: 3,
    cleanThreshold100: 80,
    handMode: 'upper',
    practiceMode: 'practice',
    focusLabel: 'rhythm',
    teacherNoteChild: 'Right hand only — keep the eighth notes even.',
    tempoTarget: 72,
  },
  {
    assignmentId: 'asgn-demo-week3',
    taskId: 'task-sample-bars-12-14-lower-learn',
    pieceId: 'sample',
    pieceTitle: 'Sample',
    weekLabel: 'Week 3',
    dayIndex: 2,
    totalDays: 5,
    barStart: 12,
    barEnd: 14,
    repsGoal: 3,
    cleanThreshold100: 85,
    handMode: 'lower',
    practiceMode: 'learn',
    focusLabel: 'fingering',
    teacherNoteChild: 'Left hand alone; say finger numbers out loud once.',
  },
  {
    assignmentId: 'asgn-demo-week3',
    taskId: 'task-sample-bars-1-8-both-practice',
    pieceId: 'sample',
    pieceTitle: 'Sample',
    weekLabel: 'Week 3',
    dayIndex: 3,
    totalDays: 5,
    barStart: 1,
    barEnd: 8,
    repsGoal: 3,
    cleanThreshold100: 80,
    handMode: 'both',
    practiceMode: 'practice',
    focusLabel: 'memory',
    teacherNoteParent: 'Try one run with eyes on the score, then one from memory if it feels safe.',
  },
  {
    assignmentId: 'asgn-demo-week3',
    taskId: 'task-sample-bars-15-18-both-play',
    pieceId: 'sample',
    pieceTitle: 'Sample',
    weekLabel: 'Week 3',
    dayIndex: 4,
    totalDays: 5,
    barStart: 15,
    barEnd: 18,
    repsGoal: 2,
    cleanThreshold100: 75,
    handMode: 'both',
    practiceMode: 'play',
    focusLabel: 'voicing',
    teacherNoteChild: 'Performance mode: sing the melody in the top line.',
    tempoTarget: 88,
  },
  {
    assignmentId: 'asgn-minuet-week3',
    taskId: 'task-minuet-bars-2-5-both-learn',
    pieceId: 'minuet-in-g-major',
    pieceTitle: 'Minuet in G Major',
    pieceAliases: [...MINUET_MOCK_ALIASES],
    weekLabel: 'Week 3',
    dayIndex: 1,
    totalDays: 5,
    barStart: 2,
    barEnd: 5,
    repsGoal: 3,
    cleanThreshold100: 85,
    handMode: 'both',
    practiceMode: 'learn',
    focusLabel: 'accuracy',
    teacherNoteChild: 'Bars 2–5: play slowly and match each note before speeding up.',
    teacherNoteParent: 'Aim for three clean passes in a row at a steady tempo.',
    tempoTarget: 60,
  },
  {
    assignmentId: 'asgn-minuet-week3',
    taskId: 'task-minuet-bars-8-10-upper-practice',
    pieceId: 'minuet-in-g-major',
    pieceTitle: 'Minuet in G Major',
    pieceAliases: [...MINUET_MOCK_ALIASES],
    weekLabel: 'Week 3',
    dayIndex: 2,
    totalDays: 5,
    barStart: 8,
    barEnd: 10,
    repsGoal: 3,
    cleanThreshold100: 80,
    handMode: 'upper',
    practiceMode: 'practice',
    focusLabel: 'rhythm',
    teacherNoteChild: 'Right hand only — keep the eighth notes even.',
    tempoTarget: 72,
  },
  {
    assignmentId: 'asgn-minuet-week3',
    taskId: 'task-minuet-bars-12-14-lower-learn',
    pieceId: 'minuet-in-g-major',
    pieceTitle: 'Minuet in G Major',
    pieceAliases: [...MINUET_MOCK_ALIASES],
    weekLabel: 'Week 3',
    dayIndex: 2,
    totalDays: 5,
    barStart: 12,
    barEnd: 14,
    repsGoal: 3,
    cleanThreshold100: 85,
    handMode: 'lower',
    practiceMode: 'learn',
    focusLabel: 'fingering',
    teacherNoteChild: 'Left hand alone; say finger numbers out loud once.',
  },
  {
    assignmentId: 'asgn-minuet-week3',
    taskId: 'task-minuet-bars-1-8-both-practice',
    pieceId: 'minuet-in-g-major',
    pieceTitle: 'Minuet in G Major',
    pieceAliases: [...MINUET_MOCK_ALIASES],
    weekLabel: 'Week 3',
    dayIndex: 3,
    totalDays: 5,
    barStart: 1,
    barEnd: 8,
    repsGoal: 3,
    cleanThreshold100: 80,
    handMode: 'both',
    practiceMode: 'practice',
    focusLabel: 'memory',
    teacherNoteParent: 'Try one run with eyes on the score, then one from memory if it feels safe.',
  },
  {
    assignmentId: 'asgn-minuet-week3',
    taskId: 'task-minuet-bars-15-18-both-play',
    pieceId: 'minuet-in-g-major',
    pieceTitle: 'Minuet in G Major',
    pieceAliases: [...MINUET_MOCK_ALIASES],
    weekLabel: 'Week 3',
    dayIndex: 4,
    totalDays: 5,
    barStart: 15,
    barEnd: 18,
    repsGoal: 2,
    cleanThreshold100: 75,
    handMode: 'both',
    practiceMode: 'play',
    focusLabel: 'voicing',
    teacherNoteChild: 'Performance mode: sing the melody in the top line.',
    tempoTarget: 88,
  },
]

/** Normalize for matching lesson ids / labels / filenames to mock rows (future API parity). */
export function normalizePieceMatchKey(s: string | null | undefined): string {
  if (s == null || s === '') return ''
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripXmlLikeExtension(s: string): string {
  const t = s.trim()
  const lower = t.toLowerCase()
  if (lower.endsWith('.musicxml')) return t.slice(0, -9).trim()
  if (lower.endsWith('.xml')) return t.slice(0, -4).trim()
  return t
}

function normalizedMatchKeysFromString(s: string | null | undefined): string[] {
  if (s == null) return []
  const t = String(s).trim()
  if (!t) return []
  const keys = new Set<string>()
  const add = (x: string) => {
    const k = normalizePieceMatchKey(x)
    if (k) keys.add(k)
  }
  add(t)
  const stripped = stripXmlLikeExtension(t)
  if (stripped !== t) add(stripped)
  return [...keys]
}

function collectCandidateMatchKeys(
  canonicalPieceId: string | null | undefined,
  scoreMetadataTitle: string | null | undefined,
  rawSourceTitle: string | null | undefined
): string[] {
  const keys = new Set<string>()
  for (const part of [canonicalPieceId, scoreMetadataTitle, rawSourceTitle]) {
    for (const k of normalizedMatchKeysFromString(typeof part === 'string' ? part : '')) {
      keys.add(k)
    }
  }
  return [...keys]
}

function normalizedKeysForTask(t: MockTeacherPracticeTask): string[] {
  const keys = new Set<string>()
  for (const k of normalizedMatchKeysFromString(t.pieceId)) keys.add(k)
  for (const k of normalizedMatchKeysFromString(t.pieceTitle)) keys.add(k)
  if (t.pieceAliases) {
    for (const a of t.pieceAliases) {
      for (const k of normalizedMatchKeysFromString(a)) keys.add(k)
    }
  }
  return [...keys]
}

const MINUET_IN_G_MAJOR_KEY = normalizePieceMatchKey('Minuet in G Major')

function titleLooksLikeMinuetInGMajor(raw: string | null | undefined): boolean {
  const n = normalizePieceMatchKey(raw)
  if (!n) return false
  return n === MINUET_IN_G_MAJOR_KEY || n.includes('minuet in g major')
}

/**
 * Human/debug chain: canonical id → OSMD sheet title → upload/lesson label or filename.
 */
export function resolvePieceIdentityForAssignedPractice(
  canonicalPieceId: string | null | undefined,
  scoreMetadataTitle: string | null | undefined,
  rawSourceTitle: string | null | undefined
): string {
  const id = typeof canonicalPieceId === 'string' ? canonicalPieceId.trim() : ''
  if (id) return id
  const meta = typeof scoreMetadataTitle === 'string' ? scoreMetadataTitle.trim() : ''
  if (meta) return meta
  const raw = typeof rawSourceTitle === 'string' ? rawSourceTitle.trim() : ''
  return raw
}

/**
 * Resolve mock prescriptions: exact `pieceId` when present on rows; else normalized match of
 * canonical id, sheet metadata title, and raw source label/filename against task `pieceId`,
 * `pieceTitle`, and optional `pieceAliases`.
 */
export function getMockTeacherPrescriptionsForCurrentPiece(
  currentPieceId: string | null | undefined,
  scoreMetadataTitle: string | null | undefined,
  rawSourceTitle: string | null | undefined
): MockTeacherPracticeTask[] {
  const id = typeof currentPieceId === 'string' ? currentPieceId.trim() : ''

  if (id) {
    const byId = MOCK_TEACHER_PRESCRIPTION_TASKS.filter((t) => t.pieceId === id)
    if (byId.length > 0) return byId
  }

  const candKeys = collectCandidateMatchKeys(currentPieceId, scoreMetadataTitle, rawSourceTitle)
  if (candKeys.length > 0) {
    const byKeys = MOCK_TEACHER_PRESCRIPTION_TASKS.filter((t) => {
      const taskKeys = normalizedKeysForTask(t)
      return taskKeys.some((tk) => candKeys.includes(tk))
    })
    if (byKeys.length > 0) return byKeys
  }

  if (titleLooksLikeMinuetInGMajor(scoreMetadataTitle) || titleLooksLikeMinuetInGMajor(rawSourceTitle)) {
    return MOCK_TEACHER_PRESCRIPTION_TASKS.filter((t) => t.pieceId === 'minuet-in-g-major')
  }

  return []
}

export function getMockTeacherPrescriptionsForPiece(pieceId: string): MockTeacherPracticeTask[] {
  return getMockTeacherPrescriptionsForCurrentPiece(pieceId, null, null)
}
