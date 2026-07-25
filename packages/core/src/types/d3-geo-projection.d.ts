/**
 * d3-geo-projection ships no types and has no @types package. Only `geoSatellite` is used
 * (docs/CAMERA.md), so only it is declared. `.tilt()` is included because docs/BODIES.md
 * names it as the hook for oblique views; it is not called yet.
 */
declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo';

  export interface GeoSatelliteProjection extends GeoProjection {
    /** Camera distance from the body centre, in body radii. Always > 1. */
    distance(): number;
    distance(distance: number): this;

    tilt(): number;
    tilt(tilt: number): this;
  }

  export function geoSatellite(): GeoSatelliteProjection;
}
