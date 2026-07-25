import { geoDistance, geoInterpolate } from 'd3-geo';
import type { Body } from '../body.js';
import { MAX_ALT_KM, MIN_ALT_KM, clamp, type CameraState } from './state.js';

/**
 * Flight between locations, per docs/CAMERA.md.
 *
 * Two details make this feel right rather than merely correct:
 *
 * - lon/lat interpolate by **slerp**, not linearly in degrees. Linear crosses the antimeridian
 *   badly and behaves strangely near the poles.
 * - altitude interpolates **logarithmically, along an arc**: rise, travel, descend. Going from
 *   Bogota to Tokyo without climbing first gives a nauseating low pass over the surface.
 */
export interface FlyOptions {
  readonly durationMs?: number;
  /** Skip the arc and go straight there — for a short hop that is already local. */
  readonly direct?: boolean;
}

export interface Flight {
  readonly durationMs: number;
  /** Camera state at `t` in [0, 1]. */
  at(t: number): Pick<CameraState, 'lon' | 'lat' | 'altitudeKm'>;
}

/** docs/CAMERA.md: duration scales with distance, capped at 2400 ms. */
const MAX_DURATION_MS = 2400;
const MIN_DURATION_MS = 400;

/** How high the arc climbs, as a fraction of the great-circle distance. */
const ARC_FACTOR = 0.35;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Three-point interpolation in log space: start -> peak -> end. Log space because altitude is
 * perceived multiplicatively, the same reason zoom is exponential.
 */
function arcAltitude(startKm: number, peakKm: number, endKm: number, t: number): number {
  const logStart = Math.log(startKm);
  const logPeak = Math.log(peakKm);
  const logEnd = Math.log(endKm);

  // Quadratic Bezier through the three, so the climb and descent blend smoothly.
  const control = 2 * logPeak - (logStart + logEnd) / 2;
  const u = 1 - t;
  return Math.exp(u * u * logStart + 2 * u * t * control + t * t * logEnd);
}

export function planFlight(
  from: CameraState,
  to: Partial<Pick<CameraState, 'lon' | 'lat' | 'altitudeKm'>>,
  body: Body,
  options: FlyOptions = {},
): Flight {
  const targetLon = to.lon ?? from.lon;
  const targetLat = to.lat ?? from.lat;
  const targetAlt = clamp(to.altitudeKm ?? from.altitudeKm, MIN_ALT_KM, MAX_ALT_KM);

  const interpolateLonLat = geoInterpolate([from.lon, from.lat], [targetLon, targetLat]);
  const greatCircleKm = geoDistance([from.lon, from.lat], [targetLon, targetLat]) * body.radiusKm;

  // A flight that stays local does not need to climb; one that crosses the planet does.
  const peakKm = options.direct
    ? Math.max(from.altitudeKm, targetAlt)
    : clamp(
        Math.max(from.altitudeKm, targetAlt, greatCircleKm * ARC_FACTOR),
        MIN_ALT_KM,
        MAX_ALT_KM,
      );

  // Longer trips take longer, but never more than the cap — waiting is not a feature.
  const durationMs =
    options.durationMs ??
    clamp(
      MIN_DURATION_MS + (greatCircleKm / (body.radiusKm * Math.PI)) * MAX_DURATION_MS,
      MIN_DURATION_MS,
      MAX_DURATION_MS,
    );

  return {
    durationMs,
    at(t: number) {
      const eased = easeInOutCubic(clamp(t, 0, 1));
      const [lon, lat] = interpolateLonLat(eased);
      return {
        lon,
        lat,
        altitudeKm: arcAltitude(from.altitudeKm, peakKm, targetAlt, eased),
      };
    },
  };
}
