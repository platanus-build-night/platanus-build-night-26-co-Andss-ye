/**
 * Terrain facts at a point, read from the same heightmap the relief layer shades with.
 *
 * Nothing here is new data. It is the elevation field the renderer already loads, queried
 * pointwise instead of rasterized — which is the whole trick of this package: one dataset,
 * two consumers, and they cannot disagree because there is only one number.
 */

import type { Body } from '@glyphsphere/core';
import type { Heightmap } from '@glyphsphere/layers';
import { bearingDeg, compass, destination, haversineKm, type LonLat } from './geo.js';

export interface TerrainFacts {
  /** Metres above the body's sea level datum, bilinearly sampled. */
  readonly elevationM: number;
  /** The band this elevation falls in, named by the body. */
  readonly band: string;
  /** Steepest downhill slope through this point. */
  readonly slopeDeg: number;
  /** Compass direction that slope faces, or null on ground flat enough that it has none. */
  readonly aspect: string | null;
  /** Highest minus lowest elevation within `reliefWindowKm`. How rugged it is here. */
  readonly localReliefM: number;
}

/**
 * Half-width of the window `localReliefM` scans, and the baseline for the slope difference.
 *
 * 25 km is a compromise forced by the data: ETOPO1 at 4096x2048 is ~9.8 km per texel at the
 * equator, so a window much smaller than this measures interpolation rather than landscape.
 * At 25 km a mountain range reads as rugged and a river plain reads as flat, which is the
 * distinction the number exists to make.
 */
const RELIEF_WINDOW_KM = 25;

/** Bands are ordered by ascending `maxM`; the first one that contains the value wins. */
export function bandName(elevationM: number, body: Body): string {
  for (const band of body.bands) {
    if (elevationM <= band.maxM) return band.name ?? `<= ${band.maxM} m`;
  }
  const last = body.bands[body.bands.length - 1];
  return last?.name ?? 'unknown';
}

/**
 * Slope and aspect by central differences on the great circle, not on the raster grid.
 *
 * Sampling the raster directly would make slope depend on latitude — texels converge at the
 * poles, so the same hillside would read three times steeper in Svalbard than in Kenya.
 * Stepping a fixed ground distance north/south and east/west costs four extra samples and
 * removes the artefact entirely.
 */
function gradient(
  lonLat: LonLat,
  heightmap: Heightmap,
  radiusKm: number,
  stepKm: number,
): { readonly slopeDeg: number; readonly aspect: string | null } {
  const at = (bearing: number): number => {
    const p = destination(lonLat, bearing, stepKm, radiusKm);
    return heightmap.sample(p[0], p[1]);
  };

  const north = at(0);
  const south = at(180);
  const east = at(90);
  const west = at(270);

  const baselineM = 2 * stepKm * 1000;
  // Rise per unit run, in the two ground directions. Positive dNorth means uphill to the north.
  const dNorth = (north - south) / baselineM;
  const dEast = (east - west) / baselineM;

  const magnitude = Math.hypot(dNorth, dEast);
  const slopeDeg = (Math.atan(magnitude) * 180) / Math.PI;

  // Aspect points downhill, the convention in terrain analysis: it is the way water runs.
  // Below a tenth of a degree the gradient is numerical noise and has no meaningful direction.
  if (slopeDeg < 0.1) return { slopeDeg, aspect: null };
  return { slopeDeg, aspect: compass((Math.atan2(-dEast, -dNorth) * 180) / Math.PI) };
}

export function terrainAt(
  lonLat: LonLat,
  heightmap: Heightmap,
  body: Body,
  windowKm = RELIEF_WINDOW_KM,
): TerrainFacts {
  const elevationM = heightmap.sample(lonLat[0], lonLat[1]);

  let lowest = elevationM;
  let highest = elevationM;
  for (let bearing = 0; bearing < 360; bearing += 45) {
    for (const fraction of [0.5, 1]) {
      const p = destination(lonLat, bearing, windowKm * fraction, body.radiusKm);
      const sample = heightmap.sample(p[0], p[1]);
      if (sample < lowest) lowest = sample;
      if (sample > highest) highest = sample;
    }
  }

  const { slopeDeg, aspect } = gradient(lonLat, heightmap, body.radiusKm, windowKm / 2);

  return {
    elevationM: Math.round(elevationM),
    band: bandName(elevationM, body),
    slopeDeg: Math.round(slopeDeg * 10) / 10,
    aspect,
    localReliefM: Math.round(highest - lowest),
  };
}

export interface CoastFacts {
  readonly distanceKm: number;
  readonly bearing: string;
  /** True when the search hit its range without crossing a shoreline. */
  readonly beyondRange: boolean;
}

/**
 * Distance and direction to the nearest shoreline, by marching rays outward until the sign of
 * the elevation flips.
 *
 * Accuracy is bounded by the heightmap, not by the step: at ~9.8 km per texel a shoreline is
 * located to within roughly half a texel, so this reports whole kilometres and callers should
 * read it as "about". Getting better than that means point-in-polygon against land-10m along
 * every ray, which is three orders of magnitude more work for an answer no agent needs — the
 * question being asked is "am I coastal or inland", and 5 km of error never changes it.
 */
export function nearestCoast(
  lonLat: LonLat,
  heightmap: Heightmap,
  body: Body,
  maxRangeKm = 2000,
): CoastFacts {
  const hereIsLand = heightmap.sample(lonLat[0], lonLat[1]) >= 0;
  const stepKm = Math.max(5, maxRangeKm / 200);

  let bestKm = Infinity;
  let bestBearing = 0;

  for (let bearing = 0; bearing < 360; bearing += 22.5) {
    let previousKm = 0;
    for (let distanceKm = stepKm; distanceKm <= maxRangeKm; distanceKm += stepKm) {
      // No ray can beat a crossing already found closer than where this one has reached.
      if (previousKm >= bestKm) break;

      const p = destination(lonLat, bearing, distanceKm, body.radiusKm);
      if (heightmap.sample(p[0], p[1]) >= 0 !== hereIsLand) {
        // The crossing is somewhere in the step just taken; its midpoint is the best estimate.
        const crossingKm = distanceKm - stepKm / 2;
        if (crossingKm < bestKm) {
          bestKm = crossingKm;
          bestBearing = bearing;
        }
        break;
      }
      previousKm = distanceKm;
    }
  }

  if (!Number.isFinite(bestKm)) {
    return { distanceKm: maxRangeKm, bearing: compass(0), beyondRange: true };
  }
  return {
    distanceKm: Math.round(bestKm),
    bearing: compass(bestBearing),
    beyondRange: false,
  };
}

export { bearingDeg, compass, haversineKm };
