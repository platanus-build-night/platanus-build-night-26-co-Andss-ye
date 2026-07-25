/**
 * Detail levels, derived from altitude, per the table in docs/CAMERA.md.
 *
 * Altitude is the only input because it is a physical quantity: `L0` is "far enough that the
 * whole body fits", `L7` is "close enough to see a city block". Datasets are keyed by these
 * levels through `body.datasets`, so nothing here names a body or a file.
 */
export type LodLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';

export const LOD_LEVELS: readonly LodLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];

export interface LodRung {
  readonly level: LodLevel;
  /** Applies while altitude is at or above this, and below the previous rung's floor. */
  readonly minAltitudeKm: number;
  /** Elevation bands to show. Eleven bands over 200 km per cell is noise. */
  readonly bands: number;
  /** L5+ needs a tile source; without one the system stays at L4 and keeps working. */
  readonly needsTiles: boolean;
}

/** Ordered from farthest to closest, exactly as docs/CAMERA.md tabulates it. */
export const LOD_LADDER: readonly LodRung[] = [
  { level: 'L0', minAltitudeKm: 20_000, bands: 5, needsTiles: false },
  { level: 'L1', minAltitudeKm: 6_000, bands: 5, needsTiles: false },
  { level: 'L2', minAltitudeKm: 2_000, bands: 7, needsTiles: false },
  { level: 'L3', minAltitudeKm: 600, bands: 9, needsTiles: false },
  { level: 'L4', minAltitudeKm: 150, bands: 11, needsTiles: false },
  { level: 'L5', minAltitudeKm: 30, bands: 11, needsTiles: true },
  { level: 'L6', minAltitudeKm: 5, bands: 11, needsTiles: true },
  { level: 'L7', minAltitudeKm: 0, bands: 11, needsTiles: true },
];

export function lodForAltitude(altitudeKm: number): LodLevel {
  for (const rung of LOD_LADDER) {
    if (altitudeKm >= rung.minAltitudeKm) return rung.level;
  }
  return 'L7';
}

export function rungFor(level: LodLevel): LodRung {
  return LOD_LADDER.find((rung) => rung.level === level) ?? LOD_LADDER[0]!;
}

/** Index in the ladder; higher means closer in. */
export function lodIndex(level: LodLevel): number {
  return LOD_LEVELS.indexOf(level);
}

/** Caps a level to the deepest one available without a tile source. */
export function clampToAvailable(level: LodLevel, hasTileSource: boolean): LodLevel {
  if (hasTileSource) return level;
  return lodIndex(level) > lodIndex('L4') ? 'L4' : level;
}
