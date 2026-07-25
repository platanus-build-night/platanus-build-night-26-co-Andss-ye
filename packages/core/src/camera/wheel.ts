import type { Projection } from '../projection/projection.js';
import { MAX_ALT_KM, MIN_ALT_KM, clamp, type CameraState } from './state.js';

/**
 * Zoom, per docs/CAMERA.md. Exponential in altitude, anchored at the cursor.
 *
 * docs/CAMERA.md tabulates 0.0015. Measured against the range the camera actually covers, that
 * is 1.20x per wheel notch — 59 notches to get from orbit to street level, which in use reads
 * as the zoom being broken rather than precise. 0.0035 gives 1.52x per notch and 26 notches
 * over the same span, close to the one-doubling-per-notch that map tools have trained everyone
 * to expect. Fine control is unaffected: the curve is exponential, so a small delta still makes
 * a small change.
 */
export const ZOOM_SENSITIVITY = 0.0035;

/** Multiplier for an accelerated zoom, bound to a modifier key. */
export const ZOOM_ACCELERATION = 3;

/** WheelEvent.deltaMode values. Named so the normalization below reads as intent. */
const DELTA_MODE_PIXEL = 0;
const DELTA_MODE_LINE = 1;
const DELTA_MODE_PAGE = 2;

/** Rough px equivalents; browsers do not agree, and the exact values are not critical. */
const PX_PER_LINE = 16;
const PX_PER_PAGE = 800;

/**
 * Puts every input device on one scale. Without this a trackpad feels sticky and a mouse wheel
 * feels violent, because Firefox reports lines where Chrome reports pixels.
 */
export function normalizeWheel(deltaY: number, deltaMode: number): number {
  switch (deltaMode) {
    case DELTA_MODE_LINE:
      return deltaY * PX_PER_LINE;
    case DELTA_MODE_PAGE:
      return deltaY * PX_PER_PAGE;
    case DELTA_MODE_PIXEL:
    default:
      return deltaY;
  }
}

/** Exponential so each notch is the same *proportional* change at any altitude. */
export function zoomAltitude(altitudeKm: number, normalizedDelta: number, gain = 1): number {
  return clamp(
    altitudeKm * Math.exp(normalizedDelta * ZOOM_SENSITIVITY * gain),
    MIN_ALT_KM,
    MAX_ALT_KM,
  );
}

/** One step of a discrete zoom, as a double-click or a keyboard +/- would give. */
export function zoomStep(altitudeKm: number, steps: number): number {
  // A factor of two per step: the convention every map tool uses.
  return clamp(altitudeKm * Math.pow(2, -steps), MIN_ALT_KM, MAX_ALT_KM);
}

export interface ZoomResult {
  readonly altitudeKm: number;
  /** Set when the anchor had to be re-centred; absent when the cursor was off the body. */
  readonly lon?: number;
  readonly lat?: number;
}

/**
 * Zoom toward the cursor. The altitude change alone would zoom to the view centre, so the
 * point under the cursor is re-projected afterwards and the camera nudged to put it back —
 * the same "what you point at stays put" rule as dragging.
 *
 * `rebuild` supplies the projection for a candidate altitude; the caller owns projection
 * construction, so core does not have to cache view metrics here.
 */
export function zoomToward(
  projection: Projection,
  cellXY: readonly [number, number],
  deltaY: number,
  deltaMode: number,
  rebuild: (altitudeKm: number) => Projection,
  gain = 1,
): ZoomResult {
  const camera = projection.camera;
  const altitudeKm = zoomAltitude(camera.altitudeKm, normalizeWheel(deltaY, deltaMode), gain);
  return anchorZoom(projection, cellXY, altitudeKm, rebuild);
}

/**
 * Zooms to a given altitude while keeping the point under the cursor fixed. Shared by the
 * wheel and by discrete steps, so a double-click zooms toward what was clicked rather than
 * toward the centre of the screen.
 */
export function anchorZoom(
  projection: Projection,
  cellXY: readonly [number, number],
  altitudeKm: number,
  rebuild: (altitudeKm: number) => Projection,
): ZoomResult {
  const camera = projection.camera;
  if (altitudeKm === camera.altitudeKm) return { altitudeKm };

  const anchor = projection.fromCell(cellXY);
  if (!anchor) return { altitudeKm };

  // Where the anchor lands after the altitude change, and how far that is from the cursor.
  const zoomed = rebuild(altitudeKm);
  const after = zoomed.toCell(anchor);
  if (!after) return { altitudeKm };

  const centre: [number, number] = [zoomed.view.cols / 2, zoomed.view.rows / 2];
  const driftedCentre: [number, number] = [
    centre[0] + (after[0] - cellXY[0]),
    centre[1] + (after[1] - cellXY[1]),
  ];

  // Ask the zoomed projection which lon/lat now sits where the view centre should point.
  const corrected = zoomed.fromCell(driftedCentre);
  if (!corrected) return { altitudeKm };

  return { altitudeKm, lon: corrected[0], lat: corrected[1] };
}

/** Applies a zoom result onto a camera state. */
export function applyZoom(camera: CameraState, zoom: ZoomResult): Partial<CameraState> {
  const next: Partial<CameraState> = { altitudeKm: zoom.altitudeKm };
  if (zoom.lon !== undefined) next.lon = zoom.lon;
  if (zoom.lat !== undefined) next.lat = zoom.lat;
  return next;
}
