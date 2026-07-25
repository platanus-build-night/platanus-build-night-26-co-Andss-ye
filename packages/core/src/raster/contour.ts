import type { ElevationBand } from '../body.js';
import { LINE_CLASS, type SampleBuffer } from './sample-buffer.js';

/**
 * Contour lines, per docs/RELIEF.md §2 — the single biggest contributor to reading height,
 * and exactly the job braille is better at than ASCII: a thin sinuous line where sub-cell
 * precision shows.
 *
 * A contour is the **boundary of the quantized elevation mask**, so it is found rather than
 * traced: a subcell whose band differs from its right or lower neighbour sits on an edge.
 * That produces closed, connected lines for free, with no marching-squares bookkeeping.
 */

/** Interval by altitude, per the table in docs/RELIEF.md. */
export function contourIntervalM(altitudeKm: number): number {
  if (altitudeKm > 6000) return 2000;
  if (altitudeKm > 2000) return 1000;
  if (altitudeKm > 600) return 500;
  if (altitudeKm > 150) return 200;
  if (altitudeKm > 30) return 50;
  return 20;
}

/** Intervals a cartographer would actually print. */
const NICE_INTERVALS_M = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000] as const;

/** Subcells a contour should be from its neighbour. Below this they read as fill, not lines. */
const CONTOUR_SPACING_SUBCELLS = 6;

/**
 * The altitude table alone is not enough, and neither is the elevation range.
 *
 * What sets contour *density* on screen is how steeply the ground rises between neighbouring
 * subcells. Over a plain, a 1000 m interval draws a handful of lines; over the Himalaya at
 * 150 km per cell the terrain climbs thousands of metres per subcell, so every subcell sits on
 * a boundary, the screen turns to braille, and docs/AESTHETIC.md's rule that braille stay a
 * clear minority is broken.
 *
 * So the interval is derived from the mean slope actually in view: an interval of N times the
 * per-subcell rise puts contours roughly N subcells apart, whatever the terrain. The altitude
 * table stays as the floor, so a flat view still gets the intervals the doc tabulates.
 */
export function adaptiveIntervalM(altitudeKm: number, meanRisePerSubcellM: number): number {
  const floor = contourIntervalM(altitudeKm);
  if (meanRisePerSubcellM <= 0) return floor;

  const wanted = meanRisePerSubcellM * CONTOUR_SPACING_SUBCELLS;
  const nice = NICE_INTERVALS_M.find((step) => step >= wanted) ?? NICE_INTERVALS_M.at(-1)!;
  return Math.max(floor, nice);
}

/**
 * Mean absolute elevation change between horizontally adjacent land subcells — how fast the
 * ground rises per subcell at the current zoom.
 */
export function meanRisePerSubcellM(buffer: SampleBuffer): number {
  const { width, height, elevation, bodyMask } = buffer;
  let total = 0;
  let samples = 0;

  // Every fourth row is plenty for an average and keeps this off the frame budget.
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      if (bodyMask[i] === 0 || bodyMask[i + 1] === 0) continue;

      const a = elevation[i]!;
      const b = elevation[i + 1]!;
      if (a < 0 || b < 0) continue; // land only

      total += Math.abs(b - a);
      samples++;
    }
  }

  return samples > 0 ? total / samples : 0;
}

/** Every fifth contour is a master line — the cartographic convention. */
const MASTER_EVERY = 5;

export interface ContourOptions {
  readonly intervalM: number;
  /** Skip contours below sea level: isobaths are correct but fill half the planet with noise. */
  readonly includeBathymetry?: boolean;
}

/**
 * Writes contour lines into the buffer's line channels. Runs after elevation is populated and
 * before `reduce`, so the lines arrive as ordinary CONTOUR-class linework and come out in
 * braille through the normal register selection.
 */
export function extractContours(buffer: SampleBuffer, options: ContourOptions): void {
  const { width, height, elevation, bodyMask, lineMask, lineClass } = buffer;
  const { intervalM } = options;
  if (intervalM <= 0) return;

  const includeBathymetry = options.includeBathymetry ?? false;

  /** Which contour step this subcell sits in. */
  const step = (index: number): number => {
    const metres = elevation[index]!;
    if (!includeBathymetry && metres < 0) return Number.NaN;
    return Math.floor(metres / intervalM);
  };

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const index = y * width + x;
      if (bodyMask[index] === 0) continue;

      const here = step(index);
      if (Number.isNaN(here)) continue;

      const right = bodyMask[index + 1] !== 0 ? step(index + 1) : here;
      const below = bodyMask[index + width] !== 0 ? step(index + width) : here;

      // A band boundary crosses this subcell.
      if (here === right && here === below) continue;

      // The line belongs to the upper band, so a slope reads as stacked layers.
      const band = Math.max(here, Number.isNaN(right) ? here : right, Number.isNaN(below) ? here : below);
      const isMaster = band % MASTER_EVERY === 0;

      lineMask[index] = 255;
      lineClass[index] = isMaster ? LINE_CLASS.CONTOUR_MASTER : LINE_CLASS.CONTOUR;
    }
  }
}

/** Band edges expressed as contour steps, for a layer that wants to align the two. */
export function bandBoundariesM(bands: readonly ElevationBand[]): number[] {
  return bands.map((band) => band.maxM);
}
