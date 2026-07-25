/**
 * Two-finger gestures: pinch to zoom, twist to change bearing.
 *
 * Core stays DOM-free, so nothing here takes a TouchEvent. A gesture is described by the
 * positions of two contacts in cell coordinates; translating browser events into that is the
 * host's job (docs/ARCHITECTURE.md keeps core runnable in a worker and in Node).
 */
export interface TwoPointGesture {
  /** Midpoint, in cells. The anchor both zoom and rotation pivot around. */
  readonly centreCell: readonly [number, number];
  /** Distance between contacts, in cells. */
  readonly spread: number;
  /** Angle of the line between contacts, in degrees. */
  readonly angleDeg: number;
}

export function describeGesture(
  a: readonly [number, number],
  b: readonly [number, number],
  /** Cell aspect, so spread and angle are measured in square units rather than cells. */
  cellAspect: number,
): TwoPointGesture {
  // Cells are twice as tall as wide, so a raw dx/dy angle would be skewed. Converting x into
  // row units first makes "45 degrees" mean 45 degrees on screen.
  const dxRows = (b[0] - a[0]) * cellAspect;
  const dyRows = b[1] - a[1];

  return {
    centreCell: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    spread: Math.hypot(dxRows, dyRows),
    angleDeg: (Math.atan2(dyRows, dxRows) * 180) / Math.PI,
  };
}

export interface GestureDelta {
  /** Multiply altitude by this. Spreading fingers apart zooms in, so it is < 1. */
  readonly altitudeScale: number;
  /** Add to bearing, in degrees, wrapped to the short way round. */
  readonly bearingDeltaDeg: number;
  /** Midpoint movement, in cells. */
  readonly panCell: readonly [number, number];
}

/** Smallest spread we trust; below it the ratio is noise and the angle is meaningless. */
const MIN_SPREAD_CELLS = 0.5;

export function gestureDelta(from: TwoPointGesture, to: TwoPointGesture): GestureDelta {
  const usable = from.spread >= MIN_SPREAD_CELLS && to.spread >= MIN_SPREAD_CELLS;

  // Fingers moving apart (to > from) must *lower* altitude, hence the inversion.
  const altitudeScale = usable ? from.spread / to.spread : 1;

  let bearingDeltaDeg = usable ? to.angleDeg - from.angleDeg : 0;
  bearingDeltaDeg = ((bearingDeltaDeg + 180) % 360 + 360) % 360 - 180;

  return {
    altitudeScale,
    bearingDeltaDeg,
    panCell: [to.centreCell[0] - from.centreCell[0], to.centreCell[1] - from.centreCell[1]],
  };
}
