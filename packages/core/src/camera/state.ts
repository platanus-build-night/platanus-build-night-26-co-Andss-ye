/**
 * Camera state, per docs/CAMERA.md. There is deliberately **no `zoom` field**: the zoom *is*
 * the altitude. That makes the API self-describing (`altitudeKm: 400` is the ISS orbit), lets
 * LOD derive from a physical quantity, and makes flights between points trivial to reason about.
 *
 * `tiltDeg` does not exist yet and is the only field oblique views will need to add.
 */
export interface CameraState {
  /** Which body the camera is bound to. Always 'earth' today. See docs/BODIES.md. */
  bodyId: string;
  /** Degrees. Centre of view. */
  lon: number;
  /** Degrees. */
  lat: number;
  /** Height above the surface. This is the zoom. */
  altitudeKm: number;
  /** 0 = north up. */
  bearingDeg: number;
}

/** Altitude limits from docs/CAMERA.md: ~200 m is block level, 80 000 km is well beyond the disc. */
export const MIN_ALT_KM = 0.2;
export const MAX_ALT_KM = 80_000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Wraps into [-180, 180). Panning past the antimeridian must not accumulate. */
export function wrapLon(lon: number): number {
  const wrapped = ((lon + 180) % 360 + 360) % 360;
  return wrapped - 180;
}

/** Wraps into [0, 360). */
export function wrapBearing(bearingDeg: number): number {
  return ((bearingDeg % 360) + 360) % 360;
}

/**
 * Brings a state into the valid range. Latitude clamps rather than wraps: crossing a pole
 * flips the view's handedness, which is never what a drag or a flyTo means.
 */
export function normalizeCameraState(state: CameraState): CameraState {
  return {
    bodyId: state.bodyId,
    lon: wrapLon(state.lon),
    lat: clamp(state.lat, -90, 90),
    altitudeKm: clamp(state.altitudeKm, MIN_ALT_KM, MAX_ALT_KM),
    bearingDeg: wrapBearing(state.bearingDeg),
  };
}

/**
 * Defaults for everything except `bodyId`, which is required on purpose: core must never name
 * a concrete body (docs/BODIES.md). The caller passes the id of the body it is looking at.
 */
export const CAMERA_DEFAULTS: Omit<CameraState, 'bodyId'> = {
  lon: 0,
  lat: 0,
  altitudeKm: 20_000,
  bearingDeg: 0,
};

export function createCameraState(
  bodyId: string,
  partial: Partial<Omit<CameraState, 'bodyId'>> = {},
): CameraState {
  return normalizeCameraState({ bodyId, ...CAMERA_DEFAULTS, ...partial });
}
