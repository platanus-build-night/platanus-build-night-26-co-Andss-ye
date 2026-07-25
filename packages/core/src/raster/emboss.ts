/**
 * Gradient shading, per docs/RELIEF.md §3.
 *
 * The shift is a **palette index**, not a colour. With sixteen colours arranged in semantic
 * ramps, stepping down inside the land ramp gives a coherent darker tone of the same family;
 * multiplying RGB would give mud. Indices 1-9 are ordered by elevation precisely so this works
 * (docs/AESTHETIC.md).
 */

/** Below this the terrain is flat enough that shading it is just noise. */
export const EMBOSS_MIN = 0.08;

export type EmbossShift = -2 | -1 | 0 | 1;

/**
 * Thresholds straight from docs/RELIEF.md. Asymmetric on purpose: shadow reads more strongly
 * than highlight, so the lit side gets one step and the dark side up to two.
 */
export function embossShift(
  gradientX: number,
  gradientY: number,
  sunX: number,
  sunY: number,
  magnitude: number,
): EmbossShift {
  if (magnitude < EMBOSS_MIN) return 0;

  const length = Math.hypot(gradientX, gradientY);
  if (length < 1e-9) return 0;

  const dot = (gradientX / length) * sunX + (gradientY / length) * sunY;
  if (dot > 0.55) return 1;
  if (dot < -0.75) return -2;
  if (dot < -0.3) return -1;
  return 0;
}

/**
 * Keeps a shifted index inside the terrain ramp. Shading must never push a mountain into the
 * water colours or into the instrument cyans — it can only move within its own family.
 */
export function applyShift(paletteIndex: number, shift: number, minIndex: number, maxIndex: number): number {
  const shifted = paletteIndex + shift;
  return shifted < minIndex ? minIndex : shifted > maxIndex ? maxIndex : shifted;
}
