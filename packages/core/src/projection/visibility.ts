import { geoDistance } from 'd3-geo';
import type { Body } from '../body.js';
import type { CameraState } from '../camera/state.js';

/** Camera distance from the body centre, in body radii. Always > 1. docs/CAMERA.md §1. */
export function cameraDistance(body: Body, altitudeKm: number): number {
  return 1 + altitudeKm / body.radiusKm;
}

/**
 * Angular distance from the view centre to the horizon: the ray is tangent to the sphere where
 * cos(c) = 1/P. docs/CAMERA.md §2.
 */
export function horizonAngleRad(body: Body, altitudeKm: number): number {
  return Math.acos(1 / cameraDistance(body, altitudeKm));
}

/**
 * Every point tests visibility **before** being projected — hidden-hemisphere culling is not
 * optional (CLAUDE.md).
 *
 * An object with its own height sees past the ground horizon; without that term a plane at
 * 11 km disappears ~370 km early at the edge, and it shows.
 */
export function isVisible(
  lonLat: readonly [number, number],
  cam: CameraState,
  body: Body,
  targetAltKm = 0,
): boolean {
  let horizon = horizonAngleRad(body, cam.altitudeKm);

  if (targetAltKm > 0) {
    horizon += Math.acos(body.radiusKm / (body.radiusKm + targetAltKm));
  }

  return geoDistance([cam.lon, cam.lat], [lonLat[0], lonLat[1]]) < horizon;
}
