import { useRef, useState, useMemo, useEffect, useLayoutEffect, useCallback } from 'react'
import { FULL_KEYBOARD_WINDOW } from './lib/keyboardWindow'
import { deriveChildFeedback, type DeriveChildFeedbackInput } from './lib/childFeedback'
import { useStepCoach } from './hooks/useStepCoach'
import { useMidi } from './hooks/useMidi'
import { useOsmdScore } from './hooks/useOsmdScore'
import type { FirstTryScoringSnapshot } from './hooks/usePracticeEngine'
import { lessonProgressKey, useProgress } from './hooks/useProgress'
import { scrollMissionFirstBarIntoView, useScoreFollow } from './hooks/useScoreFollow'
import { AssignedPracticePanel } from './components/AssignedPracticePanel'
import { LessonDashboard } from './components/LessonDashboard'
import { StudentPracticeShell } from './components/StudentPracticeShell'
import {
  getMockTeacherPrescriptionsForCurrentPiece,
  initialActiveMissionPracticeProgress,
  missionProgressFromCounts,
  resolvePieceIdentityForAssignedPractice,
  type ActiveMissionPracticeProgress,
  type ActivePracticeMission,
} from './data/mockTeacherPrescriptions'
import { SegmentLoopOverlay } from './components/SegmentLoopOverlay'
import { TeacherSettingsDrawer } from './components/TeacherSettingsDrawer'
import { getCalmFeedbackMessage } from './components/CalmFeedbackText'
import { formatNoteArray } from './lib/midiUtils'
import { normalizeStaffSelection } from './lib/staffSelectionBridge'
import { resolveMissionPracticeScope } from './lib/resolveMissionPracticeScope'
import type { HandMode, PracticeMode, StaffSelection } from './lib/trainerTypes'
import { LESSONS } from './config/lessons'
import { DEBUG_CHORD_PROGRESS, logChordProgress } from './lib/debugChordProgress'
import { warnOsmd } from './lib/debugOsmdScore'
import { useSightReadingSession } from './hooks/useSightReadingSession'
import './App.css'

const KEYBOARD_RANGES = {
  '2-oct': {
    both: { startMidi: 48, endMidi: 71 },  // C3-B4
    upper: { startMidi: 60, endMidi: 83 }, // C4-B5
    lower: { startMidi: 36, endMidi: 59 }, // C2-B3
  },
  '3-oct': {
    both: { startMidi: 36, endMidi: 71 },  // C2-B4
    upper: { startMidi: 60, endMidi: 95 }, // C4-B6
    lower: { startMidi: 36, endMidi: 71 }, // C2-B4
  },
} as const

const SETTINGS_STORAGE_KEY = 'feedback-piano-practice.settings.v1'

type KeyboardSpanKey = keyof typeof KEYBOARD_RANGES

/** Top-level student surface: Learn (hints on keyboard) vs Practice (no hints) vs Play (placeholder). */
type LearnPracticePlayMode = 'learn' | 'practice' | 'play'

/** Hint under target strip: chord/interval events show engine progress (completed vs still needed). */
function practicePlayHintText(
  expectedNotes: number[],
  isChordLike: boolean,
  currentExpectedMidi: number[],
  currentCompletedMidi: number[],
  currentRemainingMidi: number[],
): string {
  if (expectedNotes.length === 0) return 'Wait…'
  if (!isChordLike) return `Play ${formatNoteArray(expectedNotes)}`
  const exp =
    currentExpectedMidi.length > 0 ? currentExpectedMidi : [...expectedNotes].sort((a, b) => a - b)
  if (currentCompletedMidi.length === 0) return `Play ${formatNoteArray(exp)}`
  if (currentRemainingMidi.length === 0) return `✓ ${formatNoteArray(currentCompletedMidi)}`
  return `✓ ${formatNoteArray(currentCompletedMidi)} · still play ${formatNoteArray(currentRemainingMidi)}`
}

const STAFF_SELECTION_LABELS: Record<StaffSelection, string> = {
  both: 'Both staves',
  treble: 'Treble staff only',
  bass: 'Bass staff only',
}

function readStoredKeyboardSettings(): {
  keyboardSpan: KeyboardSpanKey
  staffSelection: StaffSelection
  handMode: HandMode
  practiceMode: PracticeMode
} | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    const keyboardSpan = o.keyboardSpan
    const staffSelRaw =
      typeof o.staffSelection === 'string'
        ? o.staffSelection
        : normalizeStaffSelection(o.staffMode)
    const practiceModeStored = o.practiceMode as PracticeMode | undefined
    const practiceMode: PracticeMode =
      practiceModeStored === 'drill'
        ? 'drill'
        : practiceModeStored === 'music'
          ? 'music'
          : 'regular'
    const staffSelection = normalizeStaffSelection(staffSelRaw)
    if (keyboardSpan !== '2-oct' && keyboardSpan !== '3-oct') return null

    const handModeRaw = o.handMode
    const h: HandMode =
      handModeRaw === 'right' || handModeRaw === 'left' ? handModeRaw : 'both'

    return { keyboardSpan: keyboardSpan as KeyboardSpanKey, staffSelection, handMode: h, practiceMode }
  } catch {
    return null
  }
}

function writeStoredKeyboardSettings(
  keyboardSpan: KeyboardSpanKey,
  staffSelection: StaffSelection,
  handMode: HandMode,
  practiceMode: PracticeMode
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ keyboardSpan, staffSelection, handMode, practiceMode })
    )
  } catch {
    // ignore
  }
}

function getStars(mistakes: number): string {
  if (mistakes === 0) return '⭐⭐⭐'
  if (mistakes <= 2) return '⭐⭐'
  return '⭐'
}

function getGrade(mistakes: number): { text: string; color: string } {
  if (mistakes === 0) return { text: 'Perfect!', color: '#34d399' }
  if (mistakes <= 2) return { text: 'Great Job!', color: '#60a5fa' }
  if (mistakes <= 4) return { text: 'Good Effort', color: '#fbbf24' }
  return { text: 'Keep Practicing', color: '#fb923c' }
}

/** First-try score readout for the practice top bar (full song + optional loop segment). */
function FirstTryScoreReadout({
  scoring,
  loopScoringActive,
  loopPlayableEventCount,
}: {
  scoring: FirstTryScoringSnapshot
  loopScoringActive: boolean
  /** Staff-filtered playable events in the current loop (mission uses this length for a full rep). */
  loopPlayableEventCount?: number | null
}) {
  const mainLine =
    scoring.totalScoredEvents <= 0 ? 'Pitch: --' : `Pitch (1st try): ${scoring.fullSongScore100} / 100`
  const mainSubtitle =
    scoring.totalScoredEvents > 0
      ? `${scoring.firstTryCorrectEvents} / ${scoring.totalScoredEvents} pitches correct first try`
      : null

  const showLoop = loopScoringActive
  const loopLine = showLoop
    ? scoring.loopTotalScoredEvents <= 0
      ? 'Loop 1× pitch: --'
      : loopPlayableEventCount != null && loopPlayableEventCount > 0
        ? `Loop 1× pitch: ${scoring.loopTotalScoredEvents} / ${loopPlayableEventCount} targets (${scoring.loopScore100}% first try on played)`
        : `Loop 1× pitch: ${scoring.loopScore100} / 100`
    : null
  const loopSubtitle =
    showLoop && scoring.loopTotalScoredEvents > 0
      ? loopPlayableEventCount != null && loopPlayableEventCount > 0
        ? `${scoring.loopFirstTryCorrectEvents} / ${scoring.loopTotalScoredEvents} pitches first try within loop`
        : `${scoring.loopFirstTryCorrectEvents} / ${scoring.loopTotalScoredEvents} pitches first try`
      : null

  const subStyle = { fontSize: '0.78rem', color: '#64748b', lineHeight: 1.25 } as const

  return (
    <div
      className="first-try-score-readout"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}
    >
      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569', lineHeight: 1.3 }}>
        {mainLine}
      </span>
      {mainSubtitle && <span style={subStyle}>{mainSubtitle}</span>}
      {loopLine != null && (
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', lineHeight: 1.3 }}>
          {loopLine}
        </span>
      )}
      {loopSubtitle && <span style={subStyle}>{loopSubtitle}</span>}
    </div>
  )
}

function App() {
  const scoreContainerRef = useRef<HTMLDivElement>(null)
  const scoreOverlayFrameRef = useRef<HTMLDivElement>(null)
  const scoreViewportRef = useRef<HTMLDivElement>(null)
  const completionSavedRef = useRef<string | null>(null)
  const autoNextTimerRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const missionViewFocusBarRef = useRef(1)
  const lastMissionViewFocusHandledTickRef = useRef(0)

  const { ensureCurrentNoteVisible } = useScoreFollow()
  const [missionViewFocusTick, setMissionViewFocusTick] = useState(0)

  const [mode, setMode] = useState<'lesson' | 'upload'>('lesson')
  const [uploadedScore, setUploadedScore] = useState<{ name: string; xml: string } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [debugNotes, setDebugNotes] = useState<Set<number>>(new Set())
  const [selectedLessonIndex, setSelectedLessonIndex] = useState(0)
  const [stepToken, setStepToken] = useState(0)
  const [view, setView] = useState<'library' | 'practice'>('library')
  const [debugMode, setDebugMode] = useState(false)
  const [teacherDrawerOpen, setTeacherDrawerOpen] = useState(false)
  const [settings, setSettings] = useState({
    showLabels: true,
    showHint: true,
    autoNext: false,
  })
  const [keyboardSpan, setKeyboardSpan] = useState<KeyboardSpanKey>(() => {
    const stored = readStoredKeyboardSettings()
    return stored?.keyboardSpan ?? '2-oct'
  })
  const [staffSelection, setStaffSelection] = useState<StaffSelection>(() => {
    const stored = readStoredKeyboardSettings()
    return stored?.staffSelection ?? 'both'
  })
  const [handMode, setHandMode] = useState<HandMode>(() => {
    const stored = readStoredKeyboardSettings()
    return stored?.handMode ?? 'both'
  })
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(() => {
    const stored = readStoredKeyboardSettings()
    return stored?.practiceMode ?? 'regular'
  })
  const [loopOn, setLoopOn] = useState(false)
  /** 1-based loop bar bounds (drives overlay + engine when loop is on). */
  const [loopMeasureStart, setLoopMeasureStart] = useState(1)
  const [loopMeasureEnd, setLoopMeasureEnd] = useState(4)
  const [learnPracticePlayMode, setLearnPracticePlayMode] =
    useState<LearnPracticePlayMode>('learn')
  /** Teacher-assigned task currently driving loop/staff/Learn–Practice–Play (progress counting not wired yet). */
  const [activeMission, setActiveMission] = useState<ActivePracticeMission | null>(null)
  /**
   * After "Start" on an assigned task, keep the mission list hidden even if `activeMission` is cleared
   * by validation/score-load timing while loop practice is still active.
   */
  const [assignedPracticeListSuppressed, setAssignedPracticeListSuppressed] = useState(false)
  useEffect(() => {
    if (view !== 'practice') setAssignedPracticeListSuppressed(false)
  }, [view])
  /** Completed loop passes attributed to a mission (task + bar span + score at OSMD wrap). Mission UI derives counts from this list. */
  const [missionLoopPassHistory, setMissionLoopPassHistory] = useState<
    {
      taskId: string
      barStart: number
      barEnd: number
      score100: number
    }[]
  >([])
  /** Consumed wrap count from `useOsmdScore` so each physical segment wrap commits at most once. */
  const prevCommittedLoopWrapCountRef = useRef(0)
  const missionLoopPassHistoryRef = useRef(missionLoopPassHistory)
  missionLoopPassHistoryRef.current = missionLoopPassHistory
  /** Mirrors latest derived progress for wrap-commit guard (skip reps after mission completed). */
  const activeMissionProgressRef = useRef<ActiveMissionPracticeProgress>(
    initialActiveMissionPracticeProgress()
  )
  /** Latest mission row for loop-completion logic; avoids effect churn from `activeMission` object identity. */
  const activeMissionRef = useRef<ActivePracticeMission | null>(null)
  activeMissionRef.current = activeMission
  /**
   * Last non-null `activeMission.taskId` seen by the mission-progress effect.
   * Not cleared when `activeMission` is briefly null so replay / re-arm keeps the same taskId path.
   */
  const priorMissionTaskIdForProgressRef = useRef<string | null>(null)
  /** Adapter: existing logic used hint vs no-hint; Learn keeps hints, Practice and Play do not. */
  const hintsOn = learnPracticePlayMode === 'learn'
  const prevStaffSelectionRef = useRef<StaffSelection>(staffSelection)

  useEffect(() => {
    writeStoredKeyboardSettings(keyboardSpan, staffSelection, handMode, practiceMode)
  }, [keyboardSpan, staffSelection, handMode, practiceMode])

  const currentLesson = LESSONS[selectedLessonIndex]

  const { pressedNotes, error: midiError, ready: midiReady } = useMidi()
  const { progress, saveProgress, clearProgress } = useProgress()

  const combinedNotes = useMemo(() => {
    const combined = new Set<number>(pressedNotes)
    debugNotes.forEach((n) => combined.add(n))
    return combined
  }, [pressedNotes, debugNotes])

  /** Drives OSMD advance: wrap at segment end when loop scoring is on (see `useOsmdScore`). */
  const wrapLoopSegmentAtEndRef = useRef(false)

  const {
    osmd,
    loadScore,
    expectedNotes,
    currentScoreDebug,
    practiceCursorMeta,
    advanceCursor,
    resetCursor,
    isLoaded,
    isEnd,
    scoreError,
    staffAvailability,
    staffDimOverlayStyles,
    scoreLayoutRevision,
    staffFilteredPlayableEventCount,
    loopSegmentWrapCount,
    setFocusFromMeasure,
    setFocusToMeasure,
    setFocusRange,
    getBeatRangeForMeasures,
    clearFocusRange,
    focusRange,
    scoreMetadataTitle,
  } = useOsmdScore(staffSelection, handMode, scoreContainerRef, wrapLoopSegmentAtEndRef)

  const loopSegmentWrapCountRef = useRef(loopSegmentWrapCount)
  loopSegmentWrapCountRef.current = loopSegmentWrapCount

  const assignedPrescriptionTasks = useMemo(() => {
    if (mode === 'lesson' && currentLesson) {
      return getMockTeacherPrescriptionsForCurrentPiece(
        currentLesson.id,
        scoreMetadataTitle,
        currentLesson.label
      )
    }
    if (mode === 'upload' && uploadedScore) {
      return getMockTeacherPrescriptionsForCurrentPiece(null, scoreMetadataTitle, uploadedScore.name)
    }
    return []
  }, [mode, currentLesson, uploadedScore, scoreMetadataTitle])

  useEffect(() => {
    setActiveMission((m) => {
      if (!m) return m
      if (mode === 'lesson') {
        if (!currentLesson) return null
        const allowed = getMockTeacherPrescriptionsForCurrentPiece(
          currentLesson.id,
          scoreMetadataTitle,
          currentLesson.label
        )
        if (!allowed.some((t) => t.taskId === m.taskId)) {
          return null
        }
        return m
      }
      if (mode === 'upload') {
        if (!uploadedScore) return null
        const allowed = getMockTeacherPrescriptionsForCurrentPiece(
          null,
          scoreMetadataTitle,
          uploadedScore.name
        )
        if (!allowed.some((t) => t.taskId === m.taskId)) {
          return null
        }
        return m
      }
      return null
    })
  }, [mode, currentLesson?.id, currentLesson?.label, uploadedScore?.name, scoreMetadataTitle])

  useEffect(() => {
    const nextTaskId = activeMission?.taskId ?? null
    const priorTaskId = priorMissionTaskIdForProgressRef.current

    if (nextTaskId === null) {
      return
    }

    const missionChanged = priorTaskId !== null && priorTaskId !== nextTaskId
    priorMissionTaskIdForProgressRef.current = nextTaskId

    if (missionChanged) {
      if (import.meta.env.DEV) {
        console.log('[mission-progress-reset]', {
          taskId: nextTaskId,
          reason: 'taskId-changed',
          priorTaskId,
        })
      }
      setMissionLoopPassHistory([])
    }

    if (missionChanged || priorTaskId === null) {
      prevCommittedLoopWrapCountRef.current = loopSegmentWrapCountRef.current
    }
  }, [activeMission?.taskId])

  const handleStartAssignedMission = useCallback(
    (task: ActivePracticeMission) => {
      setAssignedPracticeListSuppressed(true)
      setMissionLoopPassHistory([])
      prevCommittedLoopWrapCountRef.current = loopSegmentWrapCountRef.current
      setActiveMission(task)
      setLearnPracticePlayMode(task.practiceMode)
      const scope = resolveMissionPracticeScope(task)
      setStaffSelection(scope.staffSelection)
      setHandMode(scope.handSelection)
      setLoopOn(true)
      setLoopMeasureStart(task.barStart)
      setLoopMeasureEnd(task.barEnd)
      missionViewFocusBarRef.current = task.barStart
      setMissionViewFocusTick((n) => n + 1)
      if (isLoaded) {
        setFocusFromMeasure(task.barStart)
        setFocusToMeasure(task.barEnd)
        const br = getBeatRangeForMeasures(task.barStart, task.barEnd)
        if (br) setFocusRange(br)
      }
    },
    [
      isLoaded,
      setFocusFromMeasure,
      setFocusToMeasure,
      setFocusRange,
      getBeatRangeForMeasures,
    ]
  )

  useLayoutEffect(() => {
    if (missionViewFocusTick === 0) return
    if (lastMissionViewFocusHandledTickRef.current === missionViewFocusTick) return
    if (!isLoaded) return

    const viewport = scoreViewportRef.current
    const container = scoreContainerRef.current
    if (!viewport || !container) return

    const ok = scrollMissionFirstBarIntoView(viewport, container, missionViewFocusBarRef.current)
    if (ok) {
      lastMissionViewFocusHandledTickRef.current = missionViewFocusTick
    }
  }, [missionViewFocusTick, isLoaded, scoreLayoutRevision, staffSelection, handMode])

  const prevMidiPressedRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!DEBUG_CHORD_PROGRESS) {
      prevMidiPressedRef.current = new Set(pressedNotes)
      return
    }
    const prev = prevMidiPressedRef.current
    const now = new Set(pressedNotes)
    for (const n of pressedNotes) {
      if (!prev.has(n)) {
        logChordProgress('INPUT', {
          source: 'midi',
          midiPressed: n,
          cursorStep: practiceCursorMeta.cursorStep,
          eventIndex: practiceCursorMeta.eventIndex,
          expectedMidi: [...expectedNotes].sort((a, b) => a - b),
        })
      }
    }
    prevMidiPressedRef.current = now
  }, [pressedNotes, expectedNotes, practiceCursorMeta.cursorStep, practiceCursorMeta.eventIndex])

  useEffect(() => {
    if (!loopOn) clearFocusRange()
  }, [loopOn, clearFocusRange])

  /**
   * When loop is on and the score is ready, sync engine focus from the last committed loop bars.
   * Runs when toggling loop on, when `isLoaded` flips, or when loop bounds change (e.g. assigned mission
   * while loop was already on). Drag commits still call `setFocusRange` directly; an extra rebuild here is safe.
   */
  useEffect(() => {
    if (!loopOn || !isLoaded) return
    setFocusFromMeasure(loopMeasureStart)
    setFocusToMeasure(loopMeasureEnd)
    const br = getBeatRangeForMeasures(loopMeasureStart, loopMeasureEnd)
    if (br) setFocusRange(br)
  }, [
    loopOn,
    isLoaded,
    loopMeasureStart,
    loopMeasureEnd,
    setFocusFromMeasure,
    setFocusToMeasure,
    setFocusRange,
    getBeatRangeForMeasures,
  ])

  const isSingleStaffScore = staffAvailability.isSingleStaff
  const staffFilterSupported = staffAvailability.hasUpper && staffAvailability.hasLower
  const handFilterSupported = staffAvailability.hasUpper && staffAvailability.hasLower
  const autoNextSupported = mode === 'lesson'

  /** Full C1–C10 keyboard; camera glides left/right with music (no recentering). */
  const [keyboardWindow, setKeyboardWindow] = useState(FULL_KEYBOARD_WINDOW)

  const handleAdvance = useCallback(() => {
    advanceCursor()
    if (osmd && scoreViewportRef.current) {
      ensureCurrentNoteVisible(osmd, scoreViewportRef.current)
    }
    setStepToken((prev) => prev + 1)
  }, [advanceCursor, osmd, ensureCurrentNoteVisible])

  const handleNoteDown = useCallback(
    (n: number) => {
      if (DEBUG_CHORD_PROGRESS) {
        logChordProgress('INPUT', {
          source: 'virtual keyboard',
          midiPressed: n,
          cursorStep: practiceCursorMeta.cursorStep,
          eventIndex: practiceCursorMeta.eventIndex,
          expectedMidi: [...expectedNotes].sort((a, b) => a - b),
        })
      }
      setDebugNotes((prev) => {
        const next = new Set(prev)
        next.add(n)
        return next
      })
    },
    [expectedNotes, practiceCursorMeta.cursorStep, practiceCursorMeta.eventIndex]
  )

  const handleNoteUp = useCallback((n: number) => {
    setDebugNotes((prev) => {
      const next = new Set(prev)
      next.delete(n)
      return next
    })
  }, [])

  const elapsedMs = useStepCoach(stepToken)

  const {
    feedback,
    mistakes,
    resetEngine,
    resetLoopPassScoring,
    attemptFeedback,
    eventNoteProgress,
    firstTryScoring,
    loopScoringActive,
  } = useSightReadingSession({
    wrapLoopSegmentAtEndRef,
    combinedNotes,
    expectedNotes,
    onAdvanceAfterCorrect: handleAdvance,
    practiceMode,
    practiceCursorMeta: {
      cursorStep: practiceCursorMeta.cursorStep,
      eventIndex: practiceCursorMeta.eventIndex,
      practiceEventKey: practiceCursorMeta.practiceEventKey,
      gridKind: practiceCursorMeta.gridKind,
      requiresKeyboardInput: practiceCursorMeta.requiresKeyboardInput,
    },
    loopOn,
    loopMeasureStart,
    loopMeasureEnd,
    focusRange,
  })

  const activeMissionProgress: ActiveMissionPracticeProgress = useMemo(() => {
    if (!activeMission) return initialActiveMissionPracticeProgress()
    const passes = missionLoopPassHistory.filter(
      (r) =>
        r.taskId === activeMission.taskId &&
        r.barStart === activeMission.barStart &&
        r.barEnd === activeMission.barEnd
    )
    const attemptsCount = passes.length
    const cleanRepetitionsCount = passes.filter(
      (r) => r.score100 >= activeMission.cleanThreshold100
    ).length
    const latestScore100 = attemptsCount > 0 ? passes[attemptsCount - 1]!.score100 : null
    const bestScore100 = attemptsCount > 0 ? Math.max(...passes.map((r) => r.score100)) : null
    const derived = missionProgressFromCounts(
      attemptsCount,
      cleanRepetitionsCount,
      activeMission.repsGoal
    )
    return {
      attemptsCount,
      cleanRepetitionsCount,
      bestScore100,
      latestScore100,
      completed: derived.completed,
      status: derived.status,
    }
  }, [activeMission, missionLoopPassHistory])

  activeMissionProgressRef.current = activeMissionProgress

  /** Hide list during an assigned-task run; show when idle, after mission completed, or before any Start this visit. */
  const showAssignedPracticeMissionList =
    !assignedPracticeListSuppressed || activeMissionProgress.completed

  /** Same path as “Retry” on the completion card: clears engine + seeks cursor to first loop event. */
  const rearmMissionLoopForNextRep = useCallback(() => {
    setDebugNotes(new Set())
    setStepToken(0)
    resetEngine()
    resetCursor()
    if (osmd && scoreViewportRef.current) {
      ensureCurrentNoteVisible(osmd, scoreViewportRef.current)
    }
  }, [resetEngine, resetCursor, osmd, ensureCurrentNoteVisible])

  /** When OSMD wrap counter resets (e.g. new score load), stay aligned so the next wrap is not skipped. */
  const prevLoopSegmentWrapCountForSyncRef = useRef(loopSegmentWrapCount)
  useEffect(() => {
    if (loopSegmentWrapCount < prevLoopSegmentWrapCountForSyncRef.current) {
      prevCommittedLoopWrapCountRef.current = loopSegmentWrapCount
    }
    prevLoopSegmentWrapCountForSyncRef.current = loopSegmentWrapCount
  }, [loopSegmentWrapCount])

  /**
   * Mission rep = one physical loop cycle: `useOsmdScore` increments `loopSegmentWrapCount` when the cursor
   * wraps from the last staff-filtered playable event to the first (same moment as segment loop restart).
   * Score for the pass is `firstTryScoring.loopScore100` after the batched engine update that advanced into the wrap.
   * Guards: loop scoring on, loop bars match mission (do not attribute off-mission loops).
   */
  useEffect(() => {
    const delta = loopSegmentWrapCount - prevCommittedLoopWrapCountRef.current
    if (delta <= 0) return
    prevCommittedLoopWrapCountRef.current = loopSegmentWrapCount

    const mission = activeMissionRef.current
    const barsMatch =
      mission != null &&
      loopMeasureStart === mission.barStart &&
      loopMeasureEnd === mission.barEnd

    const logSkip = (reason: string) => {
      if (!import.meta.env.DEV) return
      console.log('[loop-pass-skip]', {
        taskId: mission?.taskId ?? null,
        reason,
        loopScoringActive,
        barsMatch,
        loopSegmentWrapDelta: delta,
        loopScore100: firstTryScoring.loopScore100,
      })
    }

    if (!loopScoringActive || mission == null || !barsMatch) {
      logSkip(
        !loopScoringActive
          ? 'wrap-without-loop-scoring'
          : mission == null
            ? 'wrap-without-mission'
            : 'wrap-loop-bars-mismatch-mission'
      )
      return
    }

    if (activeMissionProgressRef.current.completed) {
      logSkip('mission-already-completed')
      return
    }

    const latestScore100 = firstTryScoring.loopScore100
    const rec = {
      taskId: mission.taskId,
      barStart: loopMeasureStart,
      barEnd: loopMeasureEnd,
      score100: latestScore100,
    }

    const prior = missionLoopPassHistoryRef.current.filter(
      (r) =>
        r.taskId === mission.taskId &&
        r.barStart === mission.barStart &&
        r.barEnd === mission.barEnd
    )
    const attemptsAfter = prior.length + delta
    const cleanAfter =
      prior.filter((r) => r.score100 >= mission.cleanThreshold100).length +
      (latestScore100 >= mission.cleanThreshold100 ? delta : 0)
    const derived = missionProgressFromCounts(attemptsAfter, cleanAfter, mission.repsGoal)

    setMissionLoopPassHistory((prev) => {
      const next = [...prev]
      for (let i = 0; i < delta; i++) next.push({ ...rec })
      return next
    })

    if (import.meta.env.DEV) {
      console.log('[mission-status-eval]', {
        taskId: mission.taskId,
        repsGoal: mission.repsGoal,
        attemptsCount: attemptsAfter,
        cleanRepetitionsCount: cleanAfter,
        latestScore100,
        derivedStatus: derived.status,
        reason: 'loop-segment-wrap',
      })
      console.log('[mission-progress-commit]', {
        taskId: mission.taskId,
        attemptsCountAfter: attemptsAfter,
        cleanRepetitionsCountAfter: cleanAfter,
        latestScore100,
        statusAfter: derived.status,
        reArmed: !derived.completed,
        reason: 'osmd-loop-wrap',
      })
    }

    if (!derived.completed) {
      if (import.meta.env.DEV) {
        console.log('[LOOP_PASS_RESET]', {
          taskId: mission.taskId,
          lo: loopMeasureStart,
          hi: loopMeasureEnd,
        })
      }
      resetLoopPassScoring()
      rearmMissionLoopForNextRep()
    }
  }, [
    loopSegmentWrapCount,
    loopScoringActive,
    loopMeasureStart,
    loopMeasureEnd,
    firstTryScoring.loopScore100,
    activeMission?.taskId,
    activeMission?.barStart,
    activeMission?.barEnd,
    activeMission?.repsGoal,
    activeMission?.cleanThreshold100,
    rearmMissionLoopForNextRep,
    resetLoopPassScoring,
  ])

  const childUi = useMemo(() => {
    const input: DeriveChildFeedbackInput = {
      expectedNotes,
      pressedNotes: combinedNotes,
      elapsedMs,
      staffSelection,
      handMode,
      isEnd,
      eventProgress: eventNoteProgress,
    }
    return deriveChildFeedback(input)
  }, [
    expectedNotes,
    combinedNotes,
    elapsedMs,
    staffSelection,
    handMode,
    isEnd,
    eventNoteProgress,
  ])

  /** Chord/interval: use engine progress so released correct keys stay "completed" and only still-needed keys pulse. */
  const virtualKeyboardGuidance = useMemo(() => {
    const base = {
      targetNotes: hintsOn ? childUi.targetNotes : [],
      pulseNotes: hintsOn ? childUi.pulseNotes : [],
      successNotes: childUi.successNotes,
      wrongNotes: childUi.wrongNotes,
    }
    if (!childUi.isCurrentEventChordLike) return base
    const withCompleted = {
      ...base,
      successNotes: childUi.currentCompletedMidi,
    }
    if (!hintsOn) return withCompleted
    return {
      ...withCompleted,
      pulseNotes: childUi.currentRemainingMidi,
    }
  }, [
    hintsOn,
    childUi.isCurrentEventChordLike,
    childUi.targetNotes,
    childUi.pulseNotes,
    childUi.successNotes,
    childUi.wrongNotes,
    childUi.currentCompletedMidi,
    childUi.currentRemainingMidi,
  ])

  const lastGuideDebugJsonRef = useRef('')
  useEffect(() => {
    if (!DEBUG_CHORD_PROGRESS) return
    const payload: Record<string, unknown> = {
      hintsOn,
      guidanceTargetNotes: hintsOn ? [...childUi.targetNotes] : [],
      guidancePulseNotes: hintsOn ? [...childUi.pulseNotes] : [],
      targetMidiHighlight:
        hintsOn && expectedNotes.length === 1 ? expectedNotes[0] : undefined,
    }
    const s = JSON.stringify(payload)
    if (s === lastGuideDebugJsonRef.current) return
    lastGuideDebugJsonRef.current = s
    logChordProgress('GUIDE_VK', payload)
  }, [hintsOn, childUi.targetNotes, childUi.pulseNotes, expectedNotes])

  useEffect(() => {
    if (prevStaffSelectionRef.current === staffSelection) return
    prevStaffSelectionRef.current = staffSelection
    if (!isLoaded) return
    setStepToken(0)
    resetEngine()
    resetCursor()
  }, [staffSelection, isLoaded, resetEngine, resetCursor])

  /** Reset engine when hand mode changes so lesson targets (filtered by hand) are re-evaluated. */
  const prevHandModeRef = useRef<HandMode>(handMode)
  useEffect(() => {
    if (prevHandModeRef.current === handMode) return
    prevHandModeRef.current = handMode
    if (!isLoaded) return
    setStepToken(0)
    resetEngine()
    resetCursor()
  }, [handMode, isLoaded, resetEngine, resetCursor])

  /** Reset coach token when the learning step changes externally (new lesson, new score, staff/hand mode, or cursor reset). */
  useEffect(() => {
    setStepToken((prev) => prev + 1)
  }, [staffSelection, handMode, selectedLessonIndex, uploadedScore])

  /** Reset keyboard window when the source changes (new lesson or new uploaded score). */
  useEffect(() => {
    setKeyboardWindow(FULL_KEYBOARD_WINDOW)
  }, [selectedLessonIndex, uploadedScore])

  const isPracticeView = view === 'practice'
  const selectedLessonId = currentLesson?.id ?? ''
  const scoreSource =
    mode === 'upload' && uploadedScore ? uploadedScore.xml : currentLesson?.scoreUrl ?? ''

  const lastLoadedSourceRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isPracticeView) {
      lastLoadedSourceRef.current = null
      return
    }

    if (scoreSource && scoreSource === lastLoadedSourceRef.current) {
      return
    }

    setDebugNotes(new Set())
    setStepToken(0)
    resetEngine()
    setKeyboardWindow(FULL_KEYBOARD_WINDOW)
    setLoopMeasureStart(1)
    setLoopMeasureEnd(4)
    if (import.meta.env.DEV) {
      const p = activeMissionProgressRef.current
      console.log('[mission-progress-reset]', {
        taskId: activeMission?.taskId ?? null,
        latestScore: p.latestScore100,
        bestScore: p.bestScore100,
        cleanReps: p.cleanRepetitionsCount,
        status: p.status,
        reason: 'practice-score-source-change-clears-active-mission',
        scoreSource: scoreSource.slice(0, 80),
      })
    }
    setActiveMission(null)
    setMissionLoopPassHistory([])
    completionSavedRef.current = null
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current)
      autoNextTimerRef.current = null
    }

    const runLoad = () => {
      const container = scoreContainerRef.current
      if (!container) {
        warnOsmd('[OSMD] Practice view effect: scoreContainerRef.current is null after rAF')
        return
      }
      if (mode === 'upload' && uploadedScore) {
        lastLoadedSourceRef.current = uploadedScore.xml
        loadScore(container, uploadedScore.xml, {
          isPracticeView: true,
          selectedLessonId: '',
        })
      } else if (currentLesson) {
        lastLoadedSourceRef.current = currentLesson.scoreUrl
        loadScore(container, currentLesson.scoreUrl, {
          isPracticeView: true,
          selectedLessonId: currentLesson.id,
        })
      }
    }

    const rafId = requestAnimationFrame(runLoad)
    return () => cancelAnimationFrame(rafId)
  }, [
    isPracticeView,
    scoreSource,
    selectedLessonId,
    mode,
    uploadedScore,
    currentLesson,
    loadScore,
    resetEngine,
  ])

  useEffect(() => {
    if (mode !== 'lesson') return
    if (!isEnd || !currentLesson) return
    const key = lessonProgressKey(currentLesson.id, staffSelection)
    if (completionSavedRef.current === key) return

    saveProgress(key, mistakes)
    completionSavedRef.current = key
  }, [mode, isEnd, currentLesson, mistakes, saveProgress, staffSelection])

  useEffect(() => {
    if (!isEnd || !settings.autoNext) return
    if (selectedLessonIndex >= LESSONS.length - 1) return

    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current)
    }

    autoNextTimerRef.current = window.setTimeout(() => {
      setSelectedLessonIndex((prev) => {
        if (prev >= LESSONS.length - 1) return prev
        return prev + 1
      })
    }, 3000)

    return () => {
      if (autoNextTimerRef.current) {
        window.clearTimeout(autoNextTimerRef.current)
        autoNextTimerRef.current = null
      }
    }
  }, [isEnd, settings.autoNext, selectedLessonIndex])

  const handleRetryLesson = useCallback(() => {
    setDebugNotes(new Set())
    setStepToken(0)
    resetEngine()
    completionSavedRef.current = null

    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current)
      autoNextTimerRef.current = null
    }

    resetCursor()
    if (osmd && scoreViewportRef.current) {
      ensureCurrentNoteVisible(osmd, scoreViewportRef.current)
    }
  }, [resetCursor, resetEngine, osmd, ensureCurrentNoteVisible])

  useEffect(() => {
    if (!isLoaded) return
    if (!osmd || !scoreViewportRef.current) return
    ensureCurrentNoteVisible(osmd, scoreViewportRef.current)
  }, [isLoaded, osmd, ensureCurrentNoteVisible])

  const handleNextLesson = useCallback(() => {
    if (selectedLessonIndex >= LESSONS.length - 1) return
    setSelectedLessonIndex((prev) => prev + 1)
  }, [selectedLessonIndex])

  const handleLessonSelect = useCallback((index: number) => {
    setSelectedLessonIndex(index)
    setMode('lesson')
    setView('practice')
  }, [])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      try {
        const xml = await file.text()
        setUploadError(null)
        setUploadedScore({ name: file.name, xml })
        setMode('upload')
        setView('practice')
        setDebugNotes(new Set())
        setStepToken(0)
        resetEngine()
        completionSavedRef.current = null
      } catch {
        setUploadError('Could not read the file. Please check the file and try again.')
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [resetEngine]
  )

  const handleBackToLessons = useCallback(() => {
    setMode('lesson')
    setView('library')
    setUploadError(null)
    setDebugNotes(new Set())
    setStepToken(0)
    resetEngine()
    completionSavedRef.current = null
  }, [resetEngine])

  const grade = getGrade(mistakes)
  const bestScore = currentLesson
    ? progress[lessonProgressKey(currentLesson.id, staffSelection)]?.bestMistakes
    : undefined

  const feedbackLabels: Record<string, string> = {
    idle: 'Waiting',
    waiting: 'Play the note',
    correct: 'Correct',
    wrong: 'Wrong note',
    need_release: 'Release the key',
  }

  const feedbackLabel = isEnd
    ? 'Finished ðŸŽ‰'
    : (feedbackLabels[feedback?.toLowerCase() ?? ''] ?? '—')

  const practiceTitle =
    mode === 'lesson' ? (currentLesson?.label ?? 'Practice') : (uploadedScore?.name ?? 'Custom score')

  const completionOverlay = isEnd ? (
    <section
      className="card completion-card"
      style={{
        textAlign: 'center',
        padding: '1.25rem',
        border: '1px solid rgba(59,130,246,0.35)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        marginTop: '1rem',
        maxWidth: '28rem',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.75rem', color: grade.color }}>
        {grade.text}
      </h2>
      <div style={{ fontSize: '1.75rem', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
        {getStars(mistakes)}
      </div>
      <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontSize: '0.95rem' }}>
        You finished <strong>{practiceTitle}</strong> with <strong>{mistakes}</strong> mistake{mistakes !== 1 ? 's' : ''}.
      </p>
      <p style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
        Best score: <strong style={{ color: '#e2e8f0' }}>{mode === 'lesson' ? (bestScore ?? mistakes) : mistakes}</strong>
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleRetryLesson}>
          {mode === 'lesson' ? 'Retry' : 'Retry'}
        </button>
        {mode === 'lesson' && selectedLessonIndex < LESSONS.length - 1 && (
          <button type="button" onClick={handleNextLesson}>
            Next lesson
          </button>
        )}
      </div>
      {mode === 'lesson' && settings.autoNext && selectedLessonIndex < LESSONS.length - 1 && (
        <p style={{ marginTop: '0.75rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          Auto-advancing in 3 seconds…
        </p>
      )}
    </section>
  ) : undefined

  return (
    <div
      className={`app ${view === 'practice' ? 'app--practice' : ''}`}
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.musicxml"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {view === 'library' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '1rem',
          }}
        >
          <header className="app-header" style={{ marginBottom: '1rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Choose a lesson</h1>
            <p style={{ margin: '0.35rem 0 0', color: '#9ca3af', fontSize: '0.9rem' }}>
              Tap a lesson to start practicing
            </p>
          </header>
          {uploadError && (
            <section
              className="card error"
              style={{
                border: '1px solid rgba(239, 68, 68, 0.5)',
                background: 'rgba(239, 68, 68, 0.08)',
                marginBottom: '1rem',
              }}
            >
              <p style={{ margin: 0, color: '#fca5a5' }}>{uploadError}</p>
            </section>
          )}
          <section className="card">
            <LessonDashboard
              lessons={LESSONS}
              progress={progress}
              staffSelectionForProgress={staffSelection}
              selectedLessonIndex={selectedLessonIndex}
              onSelectLesson={handleLessonSelect}
            />
          </section>
          <p style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleUploadClick}
              style={{ background: 'transparent', color: '#94a3b8', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              Or upload your own MusicXML
            </button>
          </p>
        </div>
      )}

      {view === 'practice' && (
        <>
          <StudentPracticeShell
            scoreContainerRef={scoreContainerRef}
            scoreOverlayFrameRef={scoreOverlayFrameRef}
            scoreViewportRef={scoreViewportRef}
            staffModeLabel={STAFF_SELECTION_LABELS[staffSelection]}
            staffSelection={staffSelection}
            staffDimOverlayStyles={staffDimOverlayStyles}
            loopOverlay={
              <SegmentLoopOverlay
                enabled={loopOn}
                startMeasure={loopMeasureStart}
                endMeasure={loopMeasureEnd}
                containerRef={scoreContainerRef}
                layoutRevision={scoreLayoutRevision}
                onRangeCommit={(startBar, endBar) => {
                  setLoopMeasureStart(startBar)
                  setLoopMeasureEnd(endBar)
                  setFocusFromMeasure(startBar)
                  setFocusToMeasure(endBar)
                  const br = getBeatRangeForMeasures(startBar, endBar)
                  if (br) setFocusRange(br)
                }}
              />
            }
            assignedPracticePanel={
              showAssignedPracticeMissionList ? (
                <AssignedPracticePanel
                  tasks={assignedPrescriptionTasks}
                  onStartTask={handleStartAssignedMission}
                  debugAssignedPractice={{
                    resolvedPieceIdentity: resolvePieceIdentityForAssignedPractice(
                      mode === 'lesson' && currentLesson ? currentLesson.id : null,
                      scoreMetadataTitle,
                      mode === 'lesson' && currentLesson
                        ? currentLesson.label
                        : mode === 'upload' && uploadedScore
                          ? uploadedScore.name
                          : ''
                    ),
                    rawSourceTitle:
                      mode === 'lesson' && currentLesson
                        ? currentLesson.label
                        : mode === 'upload' && uploadedScore
                          ? uploadedScore.name
                          : '',
                    matchedCount: assignedPrescriptionTasks.length,
                  }}
                />
              ) : undefined
            }
            staffControl={
              <div
                className="staff-play-control"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem 0.75rem',
                  width: '100%',
                }}
              >
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>Play:</span>
                <div
                  role="radiogroup"
                  aria-label="Which staff to play"
                  style={{
                    display: 'inline-flex',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    overflow: 'hidden',
                    background: '#f8fafc',
                  }}
                >
                  {(['both', 'treble', 'bass'] as const).map((s, idx, arr) => {
                    const disabled =
                      s === 'treble'
                        ? !staffAvailability.hasUpper
                        : s === 'bass'
                          ? !staffAvailability.hasLower
                          : false
                    const isLast = idx === arr.length - 1
                    const isSelected = staffSelection === s
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={disabled}
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          if (!disabled) setStaffSelection(s)
                        }}
                        style={{
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.88rem',
                          border: 'none',
                          borderRight: isLast ? 'none' : '1px solid #cbd5e1',
                          background: isSelected ? '#e0f2fe' : 'transparent',
                          color: disabled ? '#94a3b8' : '#334155',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {s === 'both' ? 'Both' : s === 'treble' ? 'Treble' : 'Bass'}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setLoopOn((on) => !on)}
                  aria-pressed={loopOn}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.88rem',
                    borderRadius: '10px',
                    border: loopOn ? '2px solid #06b6d4' : '1px solid #cbd5e1',
                    background: loopOn ? 'rgba(6, 182, 212, 0.12)' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  🔁 Loop
                </button>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <div
                    role="radiogroup"
                    aria-label="Learn, practice, or play mode"
                    style={{
                      display: 'inline-flex',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      overflow: 'hidden',
                      background: '#f8fafc',
                    }}
                  >
                    {(['learn', 'practice', 'play'] as const).map((m, idx, arr) => {
                      const isLast = idx === arr.length - 1
                      const isSelected = learnPracticePlayMode === m
                      const label = m === 'learn' ? 'Learn' : m === 'practice' ? 'Practice' : 'Play'
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setLearnPracticePlayMode(m)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.88rem',
                            border: 'none',
                            borderRight: isLast ? 'none' : '1px solid #cbd5e1',
                            background: isSelected ? '#e0f2fe' : 'transparent',
                            color: '#334155',
                            cursor: 'pointer',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {learnPracticePlayMode === 'play' && (
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Play mode coming soon</span>
                  )}
                </div>
                <span style={{ fontSize: '0.85rem', color: '#64748b', marginLeft: '0.25rem' }}>
                  Keys: {keyboardSpan === '2-oct' ? '2 oct' : '3 oct'}
                </span>
              </div>
            }
            topBarContent={
              <>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '1rem', lineHeight: 1.2 }}>
                    {practiceTitle}
                  </span>
                  <FirstTryScoreReadout
                    scoring={firstTryScoring}
                    loopScoringActive={loopScoringActive}
                    loopPlayableEventCount={loopScoringActive ? staffFilteredPlayableEventCount : null}
                  />
                </div>
                <div style={{ flexShrink: 0, alignSelf: 'flex-start', paddingTop: '0.1rem' }}>
                  <button
                    type="button"
                    onClick={() => setTeacherDrawerOpen(true)}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.9rem' }}
                  >
                    Settings
                  </button>
                </div>
              </>
            }
            targetStrip={{
              handLabel: childUi.handLabel,
              handEmoji: childUi.handEmoji,
              message: childUi.message,
              feedbackMessage: getCalmFeedbackMessage(attemptFeedback),
              hintText: settings.showHint
                ? practicePlayHintText(
                    expectedNotes,
                    childUi.isCurrentEventChordLike,
                    childUi.currentExpectedMidi,
                    childUi.currentCompletedMidi,
                    childUi.currentRemainingMidi,
                  )
                : undefined,
              bannerTone: childUi.bannerTone,
            }}
            isScoreLoading={!isLoaded && !scoreError}
            scoreError={scoreError}
            pianoProps={{
              activeNotes: combinedNotes,
              onNoteDown: handleNoteDown,
              onNoteUp: handleNoteUp,
              showLabels: settings.showLabels,
              startMidi: keyboardWindow.startMidi,
              endMidi: keyboardWindow.endMidi,
              guidance: virtualKeyboardGuidance,
              targetMidi:
                hintsOn && expectedNotes.length === 1 ? expectedNotes[0] : undefined,
            }}
            completionOverlay={completionOverlay}
            scoreActions={
              !isEnd && (
                <div style={{ marginTop: '0.5rem' }}>
                  <button type="button" onClick={handleRetryLesson} style={{ fontSize: '0.9rem' }}>
                    Reset
                  </button>
                </div>
              )
            }
          />
          <TeacherSettingsDrawer
            open={teacherDrawerOpen}
            onClose={() => setTeacherDrawerOpen(false)}
            onBackToLessons={handleBackToLessons}
            fileInputRef={fileInputRef}
            onUploadClick={handleUploadClick}
            onFileUpload={handleFileUpload}
            onResetProgress={clearProgress}
            keyboardSpan={keyboardSpan}
            setKeyboardSpan={setKeyboardSpan}
            handMode={handMode}
            setHandMode={setHandMode}
            practiceMode={practiceMode}
            setPracticeMode={setPracticeMode}
            settings={settings}
            setSettings={setSettings}
            debugMode={debugMode}
            setDebugMode={setDebugMode}
            expectedNotes={expectedNotes}
            combinedNotes={combinedNotes}
            mistakes={mistakes}
            bestScore={bestScore}
            feedbackLabel={feedbackLabel}
            attemptFeedback={attemptFeedback}
            childUi={childUi}
            currentScoreDebug={currentScoreDebug}
            midiError={midiError}
            midiReady={midiReady}
            scoreError={scoreError}
            isSingleStaffScore={isSingleStaffScore}
            staffFilterSupported={staffFilterSupported}
            handFilterSupported={handFilterSupported}
            autoNextSupported={autoNextSupported}
          />
        </>
      )}
    </div>
  )
}

export default App

