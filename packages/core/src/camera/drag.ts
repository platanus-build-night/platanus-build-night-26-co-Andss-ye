import versor from 'versor';
import type { Projection } from '../projection/projection.js';
import type { CameraState } from './state.js';

/**
 * Drag with quaternions, per docs/CAMERA.md. One model for the whole altitude range, and the
 * principle behind it is what makes it feel right: **the geographic point under the cursor
 * stays under the cursor.**
 *
 * At high altitude that reads as spinning a globe; at low altitude as panning a map. Same
 * code — the geometry takes care of the difference.
 */
export interface DragState {
  /** Unit vector of the grabbed point. */
  readonly grabbed: readonly number[];
  /** Camera rotation when the drag began, as d3 angles. */
  readonly startRotation: readonly number[];
  /** Quaternion of that rotation. */
  readonly startQuaternion: readonly number[];
  /**
   * The projection as it was when the drag began. docs/CAMERA.md inverts pointer positions in
   * the *original* frame — it does that by resetting the live projection's rotation, which
   * only works if the projection is mutable. Ours is rebuilt per frame, so the start
   * projection is captured instead. Same maths, no hidden mutation.
   */
  readonly startProjection: Projection;
}

/** d3 rotates the world under the camera, so its angles are the negated camera position. */
function cameraRotation(camera: CameraState): [number, number, number] {
  return [-camera.lon, -camera.lat, -camera.bearingDeg];
}

/** Returns null when the press landed off the body — there is nothing to grab. */
export function beginDrag(projection: Projection, cellXY: readonly [number, number]): DragState | null {
  const lonLat = projection.fromCell(cellXY);
  if (!lonLat) return null;

  const startRotation = cameraRotation(projection.camera);

  return {
    grabbed: versor.cartesian(lonLat),
    startRotation,
    startQuaternion: versor(startRotation),
    startProjection: projection,
  };
}

/**
 * Where the camera must move so the grabbed point sits under the cursor again. Returns null
 * when the cursor has left the body, which leaves the camera where it was rather than
 * snapping somewhere arbitrary.
 */
export function dragTo(
  state: DragState,
  cellXY: readonly [number, number],
): Pick<CameraState, 'lon' | 'lat' | 'bearingDeg'> | null {
  const lonLat = state.startProjection.fromCell(cellXY);
  if (!lonLat) return null;

  const delta = versor.delta(state.grabbed, versor.cartesian(lonLat));
  const [lambda, phi, gamma] = versor.rotation(versor.multiply(state.startQuaternion, delta));

  // Back out of d3's negated convention.
  return { lon: -lambda, lat: -phi, bearingDeg: -gamma };
}
