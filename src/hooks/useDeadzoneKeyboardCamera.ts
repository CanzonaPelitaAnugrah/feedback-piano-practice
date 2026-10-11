import { useEffect } from "react";

type PianoKeyLayout = {
  midi: number;
  x: number;
  width: number;
};

type CameraParams = {
  targetMidi: number | null;
  keyLayouts: PianoKeyLayout[];
  viewportWidth: number;
  contentWidth: number;
  cameraOffsetX: number;
  setCameraOffsetX: (next: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function useDeadzoneKeyboardCamera({
  targetMidi,
  keyLayouts,
  viewportWidth,
  contentWidth,
  cameraOffsetX,
  setCameraOffsetX,
}: CameraParams) {
  useEffect(() => {
    if (targetMidi == null || viewportWidth <= 0) return;

    // Exact MIDI only. Never modulo 12 here.
    const key = keyLayouts.find((k) => k.midi === targetMidi);
    if (!key) return;

    const targetCenterX = key.x + key.width / 2;

    // Main "do nothing" zone
    const DEADZONE_LEFT = 0.30;
    const DEADZONE_RIGHT = 0.70;

    // Where the target should settle after a push
    // Slightly inward from the deadzone edges
    const SETTLE_LEFT = 0.38;
    const SETTLE_RIGHT = 0.62;

    // Prevent micro-jitter at boundaries
    const HYSTERESIS_PX = 10;
    const EPSILON_PX = 2;

    const viewportLeft = cameraOffsetX;
    const viewportRight = cameraOffsetX + viewportWidth;

    const leftTrigger = cameraOffsetX + viewportWidth * DEADZONE_LEFT - HYSTERESIS_PX;
    const rightTrigger = cameraOffsetX + viewportWidth * DEADZONE_RIGHT + HYSTERESIS_PX;

    let desiredOffset: number | null = null;

    // Push right only if note really exits right comfort zone
    if (targetCenterX > rightTrigger) {
      desiredOffset = targetCenterX - viewportWidth * SETTLE_RIGHT;
    }
    // Push left only if note really exits left comfort zone
    else if (targetCenterX < leftTrigger) {
      desiredOffset = targetCenterX - viewportWidth * SETTLE_LEFT;
    }

    if (desiredOffset == null) return;

    // Clamp within keyboard content
    const maxOffset = Math.max(0, contentWidth - viewportWidth);
    desiredOffset = clamp(desiredOffset, 0, maxOffset);

    // Cap movement per update so it glides instead of jumping
    const isOffscreen =
      targetCenterX < viewportLeft || targetCenterX > viewportRight;

    const maxPanPx = isOffscreen
      ? Math.max(140, viewportWidth * 0.42) // bigger rescue if target is offscreen
      : Math.max(80, viewportWidth * 0.20); // smaller drift if already visible

    const rawDelta = desiredOffset - cameraOffsetX;
    const limitedDelta = clamp(rawDelta, -maxPanPx, maxPanPx);

    const nextOffset = clamp(cameraOffsetX + limitedDelta, 0, maxOffset);

    if (Math.abs(nextOffset - cameraOffsetX) > EPSILON_PX) {
      setCameraOffsetX(nextOffset);
    }
  }, [
    targetMidi,
    keyLayouts,
    viewportWidth,
    contentWidth,
    cameraOffsetX,
    setCameraOffsetX,
  ]);
}
