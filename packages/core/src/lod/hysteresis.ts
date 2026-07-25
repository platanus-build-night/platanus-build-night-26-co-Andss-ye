import { LOD_LADDER, lodForAltitude, lodIndex, type LodLevel } from './ladder.js';

/**
 * Asymmetric thresholds, per docs/CAMERA.md. Without hysteresis a camera resting exactly on a
 * boundary flips level on every frame of drift, and each flip reloads geometry — the visible
 * result is the whole planet strobing between two resolutions.
 *
 * 15 %: you must go 15 % past a boundary to descend, and 15 % back past it to climb again.
 */
export const HYSTERESIS = 0.15;

/**
 * Picks a level given where we already are. Returns `current` unless the altitude has moved
 * decisively past a boundary.
 */
export function lodWithHysteresis(altitudeKm: number, current: LodLevel | null): LodLevel {
  const proposed = lodForAltitude(altitudeKm);
  if (current === null || proposed === current) return proposed;

  const currentIndex = lodIndex(current);
  const proposedIndex = lodIndex(proposed);

  // Each comparison uses the boundary actually being crossed, which is *not* the same number
  // in both directions: descending out of a level crosses that level's own floor, climbing out
  // of it crosses the floor of the level above.
  if (proposedIndex > currentIndex) {
    // Descending (closer in).
    const boundary = LOD_LADDER[currentIndex]!.minAltitudeKm;
    return altitudeKm < boundary * (1 - HYSTERESIS) ? proposed : current;
  }

  // Climbing (farther out). L0 has nothing above it, so there is no boundary to clear.
  const above = LOD_LADDER[currentIndex - 1];
  if (!above) return current;
  return altitudeKm > above.minAltitudeKm * (1 + HYSTERESIS) ? proposed : current;
}

/**
 * Tracks the current level across frames. Reports transitions so a consumer can load geometry
 * once, rather than checking every frame whether the level changed.
 */
export class LodTracker {
  private current: LodLevel | null = null;

  get level(): LodLevel | null {
    return this.current;
  }

  /** Returns the new level when it changed this frame, or null when it held. */
  update(altitudeKm: number): LodLevel | null {
    const next = lodWithHysteresis(altitudeKm, this.current);
    if (next === this.current) return null;
    this.current = next;
    return next;
  }
}
