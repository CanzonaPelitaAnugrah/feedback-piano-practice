import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMonotonicKeyboardCamera } from '../hooks/useMonotonicKeyboardCamera';
import { displayWhiteKeyLabel, displayCLabel } from '../lib/displayNoteLabel';
import { getNoteName } from '../lib/midiUtils';

export interface PianoGuidance {
  targetNotes?: number[];
  pulseNotes?: number[];
  successNotes?: number[];
  wrongNotes?: number[];
}

interface VirtualPianoProps {
  activeNotes: Set<number>;
  onNoteDown: (note: number) => void;
  onNoteUp: (note: number) => void;
  showLabels?: boolean;
  startMidi?: number;
  endMidi?: number;
  guidance?: PianoGuidance;
  /** Exact MIDI of the current target key; badge is shown only on this key (not octave-equivalent). */
  targetMidi?: number;
  /** Optional soft region highlight for beginner drill "region" hint level. */
  regionHighlight?: {
    startMidi: number;
    endMidi: number;
  };
  /** Optional: gently pulse a single exact key (e.g. drill keyPulse hint stage). */
  keyPulseMidi?: number;
}

type PianoKey = {
  note: number;
  isBlack: boolean;
  label: string;
  whiteIndex: number;
  blackCenterX: number;
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const WHITE_KEY_WIDTH = 52;
const WHITE_KEY_HEIGHT = 170;
const BLACK_KEY_WIDTH = 32;
const BLACK_KEY_HEIGHT = 105;

function isBlackMidi(note: number): boolean {
  return [1, 3, 6, 8, 10].includes(note % 12);
}

function makeKeys(startMidi: number, endMidi: number): PianoKey[] {
  const keys: PianoKey[] = [];
  let whiteCount = 0;

  for (let note = startMidi; note <= endMidi; note++) {
    const isBlack = isBlackMidi(note);
    const name = NOTE_NAMES[note % 12];

    if (isBlack) {
      keys.push({
        note,
        isBlack: true,
        label: name,
        whiteIndex: -1,
        blackCenterX: whiteCount * WHITE_KEY_WIDTH,
      });
    } else {
      keys.push({
        note,
        isBlack: false,
        label: name.replace('#', ''),
        whiteIndex: whiteCount,
        blackCenterX: -1,
      });
      whiteCount += 1;
    }
  }

  return keys;
}

function getWhiteKeyStyle(params: {
  isPressed: boolean;
  isPulse: boolean;
  isSuccess: boolean;
  isWrong: boolean;
}): CSSProperties {
  const { isPressed, isPulse, isSuccess, isWrong } = params;

  let background = '#ffffff';
  let borderColor = '#cbd5e1';
  let boxShadow = 'inset 0 -8px 0 rgba(0,0,0,0.04)';
  let color = '#475569';

  if (isWrong) {
    background = '#ffe4e6';
    borderColor = '#fb7185';
    boxShadow = 'inset 0 0 0 2px rgba(244,63,94,0.18)';
    color = '#9f1239';
  } else if (isSuccess) {
    background = '#dcfce7';
    borderColor = '#34d399';
    boxShadow = 'inset 0 0 0 2px rgba(16,185,129,0.18)';
    color = '#065f46';
  } else if (isPulse) {
    background = '#e0f2fe';
    borderColor = '#38bdf8';
    boxShadow = 'inset 0 0 0 2px rgba(56,189,248,0.18), 0 0 12px rgba(56,189,248,0.18)';
    color = '#0c4a6e';
  } else if (isPressed) {
    background = '#e5e7eb';
    borderColor = '#94a3b8';
    boxShadow = 'inset 0 0 0 2px rgba(100,116,139,0.14)';
    color = '#334155';
  }

  return {
    width: WHITE_KEY_WIDTH,
    height: WHITE_KEY_HEIGHT,
    background,
    border: `1px solid ${borderColor}`,
    borderRadius: '0 0 14px 14px',
    boxShadow,
    color,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 22,
    lineHeight: 1,
    paddingBottom: 14,
    userSelect: 'none',
    cursor: 'pointer',
    position: 'relative',
    zIndex: 1,
    flexShrink: 0,
    touchAction: 'pan-x',
    boxSizing: 'border-box',
  };
}

function getBlackKeyStyle(params: {
  isPressed: boolean;
  isPulse: boolean;
  isSuccess: boolean;
  isWrong: boolean;
}): CSSProperties {
  const { isPressed, isPulse, isSuccess, isWrong } = params;

  let background = '#111827';
  let borderColor = '#020617';
  let boxShadow = '0 8px 14px rgba(0,0,0,0.35)';

  if (isWrong) {
    background = '#f43f5e';
    borderColor = '#9f1239';
    boxShadow = '0 8px 14px rgba(244,63,94,0.28)';
  } else if (isSuccess) {
    background = '#10b981';
    borderColor = '#047857';
    boxShadow = '0 8px 14px rgba(16,185,129,0.28)';
  } else if (isPulse) {
    background = '#0ea5e9';
    borderColor = '#0369a1';
    boxShadow = '0 8px 14px rgba(14,165,233,0.28)';
  } else if (isPressed) {
    background = '#374151';
    borderColor = '#111827';
    boxShadow = '0 8px 14px rgba(55,65,81,0.28)';
  }

  return {
    width: BLACK_KEY_WIDTH,
    height: BLACK_KEY_HEIGHT,
    background,
    borderLeft: `1px solid ${borderColor}`,
    borderRight: `1px solid ${borderColor}`,
    borderBottom: `1px solid ${borderColor}`,
    borderRadius: '0 0 10px 10px',
    boxShadow,
    position: 'absolute',
    top: 0,
    zIndex: 3,
    cursor: 'pointer',
    touchAction: 'pan-x',
    boxSizing: 'border-box',
    transform: 'translateX(-50%)',
  };
}

function getTargetNotesForCamera(guidance?: PianoGuidance): number[] {
  if (!guidance) return [];
  if (guidance.pulseNotes && guidance.pulseNotes.length > 0) return guidance.pulseNotes;
  if (guidance.targetNotes && guidance.targetNotes.length > 0) return guidance.targetNotes;
  return [];
}

export function VirtualPiano({
  activeNotes,
  onNoteDown,
  onNoteUp,
  showLabels = true,
  startMidi = 48,
  endMidi = 83,
  guidance,
  targetMidi,
  regionHighlight,
  keyPulseMidi,
}: VirtualPianoProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cameraOffsetX, setCameraOffsetX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const keys = useMemo(() => makeKeys(startMidi, endMidi), [startMidi, endMidi]);
  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const pulseSet = useMemo(() => new Set(guidance?.pulseNotes ?? []), [guidance?.pulseNotes]);
  const successSet = useMemo(() => new Set(guidance?.successNotes ?? []), [guidance?.successNotes]);
  const wrongSet = useMemo(() => new Set(guidance?.wrongNotes ?? []), [guidance?.wrongNotes]);

  const targetNotes = useMemo(
    () => (targetMidi !== undefined ? [targetMidi] : getTargetNotesForCamera(guidance)),
    [guidance, targetMidi]
  );
  // Badge only on exact target key (targetMidi); when absent, no badge.
  const showBadgeOnKey = useCallback(
    (note: number) => targetMidi !== undefined && note === targetMidi,
    [targetMidi]
  );

  const keyboardWidth = whiteKeys.length * WHITE_KEY_WIDTH;

  const contentWidth = keyboardWidth + 20;

  // Key layouts for camera: left edge x and width per key (hook uses center = x + width/2).
  const keyLayouts = useMemo(() => {
    const layout: { midi: number; x: number; width: number }[] = [];
    for (const k of whiteKeys) {
      layout.push({ midi: k.note, x: k.whiteIndex * WHITE_KEY_WIDTH, width: WHITE_KEY_WIDTH });
    }
    for (const k of blackKeys) {
      layout.push({
        midi: k.note,
        x: k.blackCenterX - BLACK_KEY_WIDTH / 2,
        width: BLACK_KEY_WIDTH,
      });
    }
    return layout.sort((a, b) => a.midi - b.midi);
  }, [whiteKeys, blackKeys]);

  const regionOverlay = useMemo(() => {
    if (!regionHighlight) return null;
    const { startMidi: regionStart, endMidi: regionEnd } = regionHighlight;

    const firstWhite = whiteKeys.find((k) => !k.isBlack && k.note >= regionStart);
    const lastWhite = [...whiteKeys].reverse().find((k) => !k.isBlack && k.note <= regionEnd);

    if (!firstWhite || !lastWhite) return null;

    const left = firstWhite.whiteIndex * WHITE_KEY_WIDTH;
    const right = (lastWhite.whiteIndex + 1) * WHITE_KEY_WIDTH;

    if (right <= left) return null;

    return { left, width: right - left };
  }, [regionHighlight, whiteKeys]);

  const scrollBackToTarget = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;

    if (!targetNotes.length || viewportWidth <= 0 || contentWidth <= 0) return;

    const targetMidiForCamera = Math.min(...targetNotes);
    const key = keyLayouts.find((k) => k.midi === targetMidiForCamera);
    if (!key) return;

    const targetCenterX = key.x + key.width / 2;
    const maxOffset = Math.max(0, contentWidth - viewportWidth);

    const desiredOffset = Math.max(
      0,
      Math.min(targetCenterX - viewportWidth / 2, maxOffset)
    );

    if (Math.abs(desiredOffset - cameraOffsetX) < 1) return;

    setCameraOffsetX(desiredOffset);
    el.scrollTo({ left: desiredOffset, behavior: 'smooth' });
  }, [targetNotes, viewportWidth, contentWidth, keyLayouts, cameraOffsetX, setCameraOffsetX]);

  // Measure viewport width for camera.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useMonotonicKeyboardCamera({
    targetNotes,
    keyLayouts,
    viewportWidth,
    contentWidth,
    cameraOffsetX,
    setCameraOffsetX,
  });

  // Keep native horizontal scroll position in sync with the camera offset
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (Math.abs(el.scrollLeft - cameraOffsetX) > 1) {
      el.scrollLeft = cameraOffsetX;
    }
  }, [cameraOffsetX]);

  // OLD camera logic commented out so useMonotonicKeyboardCamera can control the view (no fighting).
  // Camera as secondary support: only pan when target key(s) would go off-screen.
  // Lookup by exact MIDI only (never note % 12) so we never target the wrong octave.
  // useEffect(() => {
  //   const el = viewportRef.current;
  //   if (!el) return;
  //
  //   const viewportWidth = el.clientWidth;
  //   const visibleTargets = targetNotes
  //     .map((note) => noteCenterMap.get(note))
  //     .filter((x): x is number => typeof x === 'number');
  //
  //   if (!visibleTargets.length) return;
  //
  //   const targetMin = Math.min(...visibleTargets);
  //   const targetMax = Math.max(...visibleTargets);
  //   const margin = Math.min(80, viewportWidth * 0.15);
  //
  //   const viewportLeft = cameraOffsetX;
  //   const viewportRight = cameraOffsetX + viewportWidth;
  //   const safeLeft = viewportLeft + margin;
  //   const safeRight = viewportRight - margin;
  //
  //   let nextOffset = cameraOffsetX;
  //   if (targetMin < safeLeft) {
  //     nextOffset = Math.max(0, cameraOffsetX + (targetMin - safeLeft));
  //   } else if (targetMax > safeRight) {
  //     nextOffset = cameraOffsetX + (targetMax - safeRight);
  //   }
  //
  //   const maxScroll = Math.max(0, contentWidth - viewportWidth);
  //   nextOffset = Math.max(0, Math.min(nextOffset, maxScroll));
  //
  //   if (nextOffset !== cameraOffsetX) {
  //     setCameraOffsetX(nextOffset);
  //   }
  // }, [targetSignature, noteCenterMap, targetNotes, contentWidth, cameraOffsetX]);

  const pressStart = (note: number) => {
    onNoteDown(note);
  };

  const pressEnd = (note: number) => {
    onNoteUp(note);
  };

  return (
    <>
      <style>{`
        @keyframes pianoBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-6px); }
        }

        /* Gentle, low-amplitude key pulse for exact-target hinting in drill mode. */
        @keyframes pianoKeySoftPulseWhite {
          0%, 100% {
            box-shadow: inset 0 0 0 2px rgba(56,189,248,0.14), 0 0 0 rgba(56,189,248,0.0);
          }
          50% {
            box-shadow: inset 0 0 0 2px rgba(56,189,248,0.26), 0 0 14px rgba(56,189,248,0.35);
          }
        }

        @keyframes pianoKeySoftPulseBlack {
          0%, 100% {
            box-shadow: 0 8px 14px rgba(15,23,42,0.6);
          }
          50% {
            box-shadow: 0 10px 20px rgba(56,189,248,0.55);
          }
        }
      `}</style>
      <div
        ref={viewportRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (Math.abs(el.scrollLeft - cameraOffsetX) > 1) {
            setCameraOffsetX(el.scrollLeft);
          }
        }}
        style={{
          width: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 8,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: contentWidth,
            background: '#1f2937',
            borderRadius: 18,
            padding: 10,
            boxShadow: 'inset 0 2px 8px rgba(255,255,255,0.04)',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: keyboardWidth,
              height: WHITE_KEY_HEIGHT,
            }}
          >
            {regionOverlay && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: regionOverlay.left,
                  width: regionOverlay.width,
                  height: WHITE_KEY_HEIGHT,
                  background:
                    'linear-gradient(to top, rgba(129,140,248,0.16), rgba(191,219,254,0.08))',
                  borderRadius: 16,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
            )}
            {/* White keys */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'stretch',
              }}
            >
            {whiteKeys.map((key) => {
                const isPressed = activeNotes.has(key.note);
                const isPulse = pulseSet.has(key.note);
                const isSuccess = successSet.has(key.note);
                const isWrong = wrongSet.has(key.note);
                const isTarget = showLabels && showBadgeOnKey(key.note) && !isSuccess;
            const isKeyPulseTarget =
              keyPulseMidi !== undefined && key.note === keyPulseMidi && !isSuccess;

            const style = getWhiteKeyStyle({
              isPressed,
              isPulse,
              isSuccess,
              isWrong,
            });

            if (isKeyPulseTarget) {
              (style as CSSProperties).animation = 'pianoKeySoftPulseWhite 1.6s ease-in-out infinite';
            }

                return (
                  <div
                    key={key.note}
                    role="button"
                    aria-label={`Piano key ${key.label}`}
                    onPointerDown={() => pressStart(key.note)}
                    onPointerUp={() => pressEnd(key.note)}
                    onPointerLeave={() => pressEnd(key.note)}
                    onPointerCancel={() => pressEnd(key.note)}
                    style={style}
                  >
                    {isTarget ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: -34,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          pointerEvents: 'none',
                          zIndex: 6,
                        }}
                      >
                        <div
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#e2e8f0',
                            border: '1px solid #94a3b8',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#334155',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {getNoteName(key.note)}
                        </div>
                      </div>
                    ) : null}
                    {showLabels
                      ? key.note % 12 === 0
                        ? displayCLabel(key.note)
                        : displayWhiteKeyLabel(key.note)
                      : ''}
                  </div>
                );
              })}
            </div>

            {/* Black keys */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
              }}
            >
              {blackKeys.map((key) => {
                const isPressed = activeNotes.has(key.note);
                const isPulse = pulseSet.has(key.note);
                const isSuccess = successSet.has(key.note);
                const isWrong = wrongSet.has(key.note);
                const isKeyPulseTarget =
                  keyPulseMidi !== undefined && key.note === keyPulseMidi && !isSuccess;

                const style = getBlackKeyStyle({
                  isPressed,
                  isPulse,
                  isSuccess,
                  isWrong,
                });

                if (isKeyPulseTarget) {
                  (style as CSSProperties).animation =
                    'pianoKeySoftPulseBlack 1.6s ease-in-out infinite';
                }

                const showBadge = showLabels && showBadgeOnKey(key.note) && !successSet.has(key.note);

                return (
                  <div
                    key={key.note}
                    role="button"
                    aria-label={`Piano key ${key.label}`}
                    onPointerDown={() => pressStart(key.note)}
                    onPointerUp={() => pressEnd(key.note)}
                    onPointerLeave={() => pressEnd(key.note)}
                    onPointerCancel={() => pressEnd(key.note)}
                    style={{
                      ...style,
                      left: key.blackCenterX,
                      pointerEvents: 'auto',
                    }}
                  >
                    {showBadge ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: -34,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          pointerEvents: 'none',
                          zIndex: 6,
                        }}
                      >
                        <div
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#e2e8f0',
                            border: '1px solid #94a3b8',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#334155',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {getNoteName(key.note)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {targetNotes.length > 0 && (
          <button
            type="button"
            onClick={scrollBackToTarget}
            aria-label="Back to target note on keyboard"
            style={{
              position: 'absolute',
              right: 12,
              bottom: 10,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.7)',
              background: 'rgba(15,23,42,0.78)',
              color: '#e5e7eb',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(15,23,42,0.55)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Back to target
          </button>
        )}
      </div>
    </>
  );
}
