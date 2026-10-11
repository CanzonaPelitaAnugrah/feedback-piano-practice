import { useEffect, useRef } from "react";

type PianoKeyLayout = {
  midi: number;
  x: number;
  width: number;
};

type CameraParams = {
  targetNotes: number[];
  keyLayouts: PianoKeyLayout[];
  viewportWidth: number;
  contentWidth: number;
  cameraOffsetX: number;
  setCameraOffsetX: (next: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * First note is centered; then monotonic slide only (no recentering):
 * - First note: center the target key in the viewport.
 * - Ascending: keyboard may only slide right (target key never moves left on screen).
 * - Descending: keyboard may only slide left (target key never moves right on screen).
 * - Same/repeated: no camera change.
 */
export function useMonotonicKeyboardCamera({
  targetNotes,
  keyLayouts,
  viewportWidth,
  contentWidth,
  cameraOffsetX,
  setCameraOffsetX,
}: CameraParams) {
  const prevTargetMidiRef = useRef<number | null>(null);
  const prevScreenXRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetNotes.length === 0) return;
    if (viewportWidth <= 0 || contentWidth <= 0) return;

    const targetMidi = Math.min(...targetNotes);
    const key = keyLayouts.find((k) => k.midi === targetMidi);
    if (!key) return;

    const maxOffset = Math.max(0, contentWidth - viewportWidth);
    const targetCenterX = key.x + key.width / 2;

    const margin = Math.min(80, viewportWidth * 0.15);
    const viewportLeft = cameraOffsetX;
    const viewportRight = cameraOffsetX + viewportWidth;
    const safeLeft = viewportLeft + margin;
    const safeRight = viewportRight - margin;

    const prevTargetMidi = prevTargetMidiRef.current;
    const prevScreenX = prevScreenXRef.current;

    const direction =
      prevTargetMidi === null
        ? "same"
        : targetMidi > prevTargetMidi
          ? "ascending"
          : targetMidi < prevTargetMidi
            ? "descending"
            : "same";

    let nextOffset = cameraOffsetX;
    const isLeftOverflow = targetCenterX < safeLeft;
    const isRightOverflow = targetCenterX > safeRight;

    if (!isLeftOverflow && !isRightOverflow) {
      // Target comfortably visible; do nothing.
      prevTargetMidiRef.current = targetMidi;
      prevScreenXRef.current = targetCenterX - cameraOffsetX;
      return;
    }

    if (prevTargetMidi === null) {
      // First note or after reset: gently nudge so target comes into view near center-ish.
      const desired = targetCenterX - viewportWidth / 2;
      const delta = desired - cameraOffsetX;
      const maxStep = viewportWidth * 0.3;
      nextOffset = cameraOffsetX + clamp(delta, -maxStep, maxStep);
    } else if (direction === "ascending" && prevScreenX !== null && isRightOverflow) {
      // Slide right only: offset may only increase; keep target within safe band, minimal nudge.
      const desired = targetCenterX - (viewportLeft + margin);
      const delta = desired - cameraOffsetX;
      const maxStep = viewportWidth * 0.3;
      nextOffset = Math.max(cameraOffsetX, Math.min(maxOffset, cameraOffsetX + clamp(delta, 0, maxStep)));
    } else if (direction === "descending" && prevScreenX !== null && isLeftOverflow) {
      // Slide left only: offset may only decrease; keep target within safe band, minimal nudge.
      const desired = targetCenterX - (viewportRight - margin);
      const delta = desired - cameraOffsetX;
      const maxStep = viewportWidth * 0.3;
      nextOffset = Math.min(cameraOffsetX, Math.max(0, cameraOffsetX + clamp(delta, -maxStep, 0)));
    } else {
      nextOffset = cameraOffsetX;
    }

    nextOffset = clamp(nextOffset, 0, maxOffset);

    if (Math.abs(nextOffset - cameraOffsetX) > 1) {
      setCameraOffsetX(nextOffset);
    }

    prevTargetMidiRef.current = targetMidi;
    prevScreenXRef.current = targetCenterX - nextOffset;
  }, [
    targetNotes,
    keyLayouts,
    viewportWidth,
    contentWidth,
    cameraOffsetX,
    setCameraOffsetX,
  ]);
}
