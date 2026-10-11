import type { AttemptResult, InputFeedback, PracticeMode } from '../lib/trainerTypes'

const CALM_MESSAGE: Record<string, string> = {
  idle: 'Play the note.',
  correct: 'Good.',
  'almost-higher': 'Almost, try higher.',
  'almost-lower': 'Almost, try lower.',
  wrong: 'Try another key.',
}

const DRILL_MESSAGE: Record<AttemptResult, string> = {
  correct: "Yes, that's it.",
  wrongOctaveHigh: 'That was the same note name, but too high.',
  wrongOctaveLow: 'That was the same note name, but too low.',
  nearby: 'Very close. Try the next key.',
  wrongPitch: 'Try a different key.',
}

interface DrillClassificationContext {
  practiceMode?: PracticeMode
  targetMidi?: number
  activeNotes?: ReadonlySet<number>
}

function classifyDrillAttempt(
  feedback: InputFeedback,
  context: DrillClassificationContext
): AttemptResult {
  if (feedback.kind === 'correct') {
    return 'correct'
  }

  if (feedback.kind === 'almost') {
    // Same pitch class, different octave – direction tells us whether the played note was below or above target.
    return feedback.direction === 'higher' ? 'wrongOctaveLow' : 'wrongOctaveHigh'
  }

  // For generic "wrong" feedback, fall back to wrongPitch,
  // with a safe "nearby" detection when we have a single active note and target.
  const { targetMidi, activeNotes } = context
  if (feedback.kind === 'wrong' && targetMidi != null && activeNotes && activeNotes.size === 1) {
    const played = Math.round(Array.from(activeNotes)[0])
    const target = Math.round(targetMidi)
    const diff = Math.abs(played - target)

    // Treat an adjacent semitone as "nearby" – a gentle, safe hint.
    if (diff === 1) {
      return 'nearby'
    }
  }

  return 'wrongPitch'
}

/** Exported for use in TargetStrip / student view. */
export function getCalmFeedbackMessage(
  feedback: InputFeedback,
  context?: DrillClassificationContext
): string {
  if (context?.practiceMode === 'drill') {
    const result = classifyDrillAttempt(feedback, context)
    return DRILL_MESSAGE[result]
  }

  // Non-drill modes keep the existing, compact feedback language.
  if (feedback.kind === 'idle') return CALM_MESSAGE.idle
  if (feedback.kind === 'correct') return CALM_MESSAGE.correct
  if (feedback.kind === 'almost') return CALM_MESSAGE[`almost-${feedback.direction}`]
  return CALM_MESSAGE.wrong
}

function getMessage(feedback: InputFeedback): string {
  return getCalmFeedbackMessage(feedback)
}

interface CalmFeedbackTextProps {
  feedback: InputFeedback
}

export function CalmFeedbackText({ feedback }: CalmFeedbackTextProps) {
  const message = getMessage(feedback)
  return (
    <p
      style={{
        margin: 0,
        padding: '0.5rem 0',
        fontSize: '1rem',
        fontWeight: 500,
        color: '#525252',
        textAlign: 'center',
      }}
    >
      {message}
    </p>
  )
}
