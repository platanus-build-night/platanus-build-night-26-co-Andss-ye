/**
 * Exponential damping, per docs/CAMERA.md. The camera never jumps: every mutation moves a
 * target, and the effective camera chases it. Six lines, and docs/AESTHETIC.md calls it 90 %
 * of the feeling of quality.
 */

/** Time constants in ms. Rotation settles faster than altitude, which reads as weight. */
export const ALTITUDE_TIME_CONSTANT_MS = 90;
export const ROTATION_TIME_CONSTANT_MS = 60;

/** Below this the value is snapped, so `isSettled` can actually become true. */
const EPSILON = 1e-6;

/**
 * Frame-rate independent: the exponential means a 32 ms frame moves exactly as far as two
 * 16 ms frames would. A naive `current += (target - current) * 0.1` does not, and the camera
 * then drifts at a different speed on a 120 Hz display.
 */
export function damp(current: number, target: number, dtMs: number, timeConstantMs: number): number {
  if (dtMs <= 0) return current;
  const next = current + (target - current) * (1 - Math.exp(-dtMs / timeConstantMs));
  return Math.abs(target - next) < EPSILON ? target : next;
}

/** Signed shortest angular distance from a to b, in (-180, 180]. */
function shortestDelta(fromDeg: number, toDeg: number): number {
  const delta = ((toDeg - fromDeg + 180) % 360 + 360) % 360 - 180;
  // Exactly antipodal: pick a direction rather than stalling on a tie.
  return delta === -180 ? 180 : delta;
}

/**
 * Damps an angle across the ±180 seam. Interpolating 179 -> -179 linearly sweeps the long way
 * around the body; this takes the 2-degree path instead.
 *
 * Snaps to `targetDeg` itself, not to `current + delta`. Those differ by an ulp or so after
 * the modular arithmetic, and that is enough for the camera to reach a fixed point that never
 * compares equal to the target — leaving `isSettled` false forever and the render loop awake.
 */
export function dampAngle(
  currentDeg: number,
  targetDeg: number,
  dtMs: number,
  timeConstantMs: number,
): number {
  const delta = shortestDelta(currentDeg, targetDeg);
  if (Math.abs(delta) < EPSILON) return targetDeg;

  const next = damp(currentDeg, currentDeg + delta, dtMs, timeConstantMs);
  return Math.abs(shortestDelta(next, targetDeg)) < EPSILON ? targetDeg : next;
}

/**
 * Altitude damps geometrically, not linearly: halving altitude should take the same time
 * whether it starts at 20 000 km or at 2 km, which is the same reasoning that makes zoom
 * exponential.
 */
export function dampAltitude(currentKm: number, targetKm: number, dtMs: number): number {
  if (currentKm <= 0 || targetKm <= 0) {
    return damp(currentKm, targetKm, dtMs, ALTITUDE_TIME_CONSTANT_MS);
  }
  const next = Math.exp(
    damp(Math.log(currentKm), Math.log(targetKm), dtMs, ALTITUDE_TIME_CONSTANT_MS),
  );
  return Math.abs(targetKm - next) < EPSILON * Math.max(1, targetKm) ? targetKm : next;
}
