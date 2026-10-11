export type HintLevel = 'none' | 'look' | 'region' | 'direction' | 'keyPulse';

/**
 * Very small, age-band-friendly buckets.
 *
 * Intent:
 * - Keep the surface area tiny for now
 * - Make it easy to tune per band later without touching callers
 */
export type AgeBand = 'earlyChild' | 'child' | 'teen' | 'adult';

/**
 * Beginner drill age-band presets, mapped to internal hint ladder config.
 *
 * These are intentionally coarse:
 * - 'age4_5': quicker auto-nudges for very young learners
 * - 'age6_7': medium timing (default)
 * - 'age8_10': slower hint escalation for more independent practice
 */
export type BeginnerAgeBandPreset = 'age4_5' | 'age6_7' | 'age8_10';

export interface HintLadderConfig {
  ageBand: AgeBand;
  autoNudgeEnabled: boolean;
}

/**
 * Central beginner drill timing presets, keyed by age band label.
 *
 * These presets are only intended for beginner drill mode; regular music
 * reading mode does not consult this table.
 */
export const BEGINNER_DRILL_HINT_PRESETS: Record<BeginnerAgeBandPreset, HintLadderConfig> = {
  // Age band 4–5: nudges appear sooner (maps to earlyChild thresholds).
  age4_5: {
    ageBand: 'earlyChild',
    autoNudgeEnabled: true,
  },
  // Age band 6–7: medium timing, current default.
  age6_7: {
    ageBand: 'child',
    autoNudgeEnabled: true,
  },
  // Age band 8–10: slower hint escalation (maps to teen thresholds).
  age8_10: {
    ageBand: 'teen',
    autoNudgeEnabled: true,
  },
};

export interface HintSnapshotInput {
  elapsedMs: number;
  mistakeCount: number;
  ageBand: AgeBand;
  autoNudgeEnabled: boolean;
  currentLevel?: HintLevel;
}

interface AgeBandThresholds {
  timeMs: {
    look: number;
    region: number;
    direction: number;
    keyPulse: number;
  };
  mistakes: {
    look: number;
    region: number;
    direction: number;
    keyPulse: number;
  };
}

const AGE_BAND_THRESHOLDS: Record<AgeBand, AgeBandThresholds> = {
  // Very young learners (mapped from 4–5 preset): nudges appear sooner.
  earlyChild: {
    timeMs: {
      look: 1500,
      region: 3000,
      direction: 4800,
      keyPulse: 7200,
    },
    mistakes: {
      look: 1,
      region: 2,
      direction: 3,
      keyPulse: 4,
    },
  },
  // Early elementary (mapped from 6–7 preset): medium timing, baseline.
  child: {
    timeMs: {
      look: 2000,
      region: 4000,
      direction: 6500,
      keyPulse: 9000,
    },
    mistakes: {
      look: 1,
      region: 2,
      direction: 3,
      keyPulse: 4,
    },
  },
  // Older elementary (mapped from 8–10 preset): slower hint escalation.
  teen: {
    timeMs: {
      look: 2600,
      region: 5200,
      direction: 7800,
      keyPulse: 11000,
    },
    mistakes: {
      look: 1,
      region: 2,
      direction: 3,
      keyPulse: 4,
    },
  },
  // Keep an adult profile available for future use; currently unused.
  adult: {
    timeMs: {
      look: 2200,
      region: 4400,
      direction: 7000,
      keyPulse: 9800,
    },
    mistakes: {
      look: 1,
      region: 2,
      direction: 3,
      keyPulse: 4,
    },
  },
};

const HINT_ORDER: HintLevel[] = ['none', 'look', 'region', 'direction', 'keyPulse'];

function levelIndex(level: HintLevel): number {
  return HINT_ORDER.indexOf(level);
}

function computeTargetLevel({
  elapsedMs,
  mistakeCount,
  ageBand,
  autoNudgeEnabled,
}: Omit<HintSnapshotInput, 'currentLevel'>): HintLevel {
  const config = AGE_BAND_THRESHOLDS[ageBand];

  let level: HintLevel = 'none';

  const allowTimeBased = autoNudgeEnabled;

  const enoughTimeFor = (key: keyof AgeBandThresholds['timeMs']) =>
    allowTimeBased && elapsedMs >= config.timeMs[key];

  const enoughMistakesFor = (key: keyof AgeBandThresholds['mistakes']) =>
    mistakeCount >= config.mistakes[key];

  if (enoughTimeFor('look') || enoughMistakesFor('look')) {
    level = 'look';
  }
  if (enoughTimeFor('region') || enoughMistakesFor('region')) {
    level = 'region';
  }
  if (enoughTimeFor('direction') || enoughMistakesFor('direction')) {
    level = 'direction';
  }
  if (enoughTimeFor('keyPulse') || enoughMistakesFor('keyPulse')) {
    level = 'keyPulse';
  }

  return level;
}

/**
 * Pure function for deriving the next hint level from a snapshot of state.
 * This is the core of the state machine and is easy to unit test.
 */
export function deriveHintLevelFromSnapshot({
  elapsedMs,
  mistakeCount,
  ageBand,
  autoNudgeEnabled,
  currentLevel = 'none',
}: HintSnapshotInput): HintLevel {
  const proposed = computeTargetLevel({
    elapsedMs,
    mistakeCount,
    ageBand,
    autoNudgeEnabled,
  });

  // Only move "up" the ladder; never snap backwards.
  const currentIdx = levelIndex(currentLevel);
  const proposedIdx = levelIndex(proposed);

  return proposedIdx > currentIdx ? proposed : currentLevel;
}

export interface HintLadderController {
  /** Current hint level for the active target. */
  readonly hintLevel: HintLevel;
  /** How many mistakes we've counted for the current target. */
  readonly mistakeCount: number;
  /**
   * Reset hints and mistakes for the current target (e.g. after a correct answer).
   */
  resetHint(): void;
  /**
   * Call when we advance to a new target. This clears all accumulated state.
   */
  registerTargetStart(): void;
  /**
   * Call when the learner makes a new mistake for the current target.
   * Pass in the elapsed time on the current target so we can update
   * the level using both time and mistake pressure.
   */
  registerMistake(elapsedMs: number): void;
  /**
   * Optional: call periodically with updated elapsed time when there are
   * no new mistakes but we still want time-based auto-nudges to kick in.
   */
  updateElapsed(elapsedMs: number): void;
}

/**
 * Small, framework-agnostic state machine for graded help in beginner drill mode.
 *
 * This keeps progression logic isolated from UI and answer-checking. Callers can
 * wire this into React state, a Redux slice, or plain functions as needed.
 */
export function createHintLadder(config: HintLadderConfig): HintLadderController {
  let level: HintLevel = 'none';
  let mistakes = 0;

  const updateLevel = (elapsedMs: number) => {
    level = deriveHintLevelFromSnapshot({
      elapsedMs,
      mistakeCount: mistakes,
      ageBand: config.ageBand,
      autoNudgeEnabled: config.autoNudgeEnabled,
      currentLevel: level,
    });
  };

  return {
    get hintLevel() {
      return level;
    },
    get mistakeCount() {
      return mistakes;
    },
    resetHint() {
      level = 'none';
      mistakes = 0;
    },
    registerTargetStart() {
      level = 'none';
      mistakes = 0;
    },
    registerMistake(elapsedMs: number) {
      mistakes += 1;
      updateLevel(elapsedMs);
    },
    updateElapsed(elapsedMs: number) {
      updateLevel(elapsedMs);
    },
  };
}

