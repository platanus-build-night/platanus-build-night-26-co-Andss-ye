import { geoDistance } from 'd3-geo';
import { geoSatellite } from 'd3-geo-projection';
import type { Body } from '../body.js';
import type { CameraState } from '../camera/state.js';
import { discRadiusRows, type ViewMetrics } from './aspect.js';
import type { Projection, SubcellProjection } from './projection.js';
import { cameraDistance, horizonAngleRad, isVisible } from './visibility.js';

const DEG_PER_RAD = 180 / Math.PI;

/**
 * Avoids an exact singularity at the limb, which produces path artifacts in d3.
 * docs/CAMERA.md §2.
 */
const CLIP_EPSILON_DEG = 1e-6;

/**
 * Builds the near-side vertical perspective projection, per docs/CAMERA.md. One projection
 * covers the whole range: as distance grows it converges to orthographic, up close it becomes
 * a surface view. No mode switch, no crossfade.
 *
 * The math here is transcribed from docs/CAMERA.md, which is derived and verified — if a result
 * looks wrong the bug is in how this is called, not in the formulas.
 */
export function buildProjection(body: Body, cam: CameraState, view: ViewMetrics): Projection {
  const P = cameraDistance(body, cam.altitudeKm);
  const clipAngleDeg = Math.acos(1 / P) * DEG_PER_RAD - CLIP_EPSILON_DEG;
  const radiusRows = discRadiusRows(view);

  // docs/CAMERA.md §3 derives rho(c) = sin(c)/(P - cos(c)) and rho(c_horizon) = 1/sqrt(P^2-1),
  // giving scale = radiusRows * sqrt(P^2-1). That derivation is right, but d3's satelliteRaw
  // does not implement raw rho: it returns k = (P-1)/(P - cos(c)), i.e. (P-1) * rho(c). So the
  // scale handed to d3 has to divide that normalization back out:
  //
  //   r_limb = scale * (P-1) * rho(c_h) = scale * (P-1)/sqrt(P^2-1)  =!=  radiusRows
  //   => scale = radiusRows * sqrt(P^2-1)/(P-1) = radiusRows * sqrt((P+1)/(P-1))
  //
  // Sanity check on the limit the doc states: as P -> infinity this tends to radiusRows, and
  // d3's k tends to 1, so the projection becomes orthographic of scale radiusRows. Consistent.
  const scale = radiusRows * Math.sqrt((P + 1) / (P - 1));

  // d3 rotates the world under the camera, not the camera over the world — hence the negated
  // signs. This is the number-one source of confusion with d3-geo.
  const projection = geoSatellite()
    .distance(P)
    .rotate([-cam.lon, -cam.lat, -cam.bearingDeg])
    .clipAngle(clipAngleDeg)
    .scale(scale)
    .translate([view.cols / 2, view.rows / 2]);

  const centreCol = view.cols / 2;
  const centreRow = view.rows / 2;
  const { cellAspect } = view;
  const clipAngleRad = clipAngleDeg / DEG_PER_RAD;

  return {
    body,
    camera: cam,
    view,
    distance: P,
    clipAngleDeg,
    radiusRows,

    toCell(lonLat) {
      // `clipAngle` only clips the *stream*; calling the projection on a bare point ignores it
      // and happily returns coordinates for the far side of the body. So the hidden-hemisphere
      // test has to happen here — it is not optional (CLAUDE.md).
      if (geoDistance([cam.lon, cam.lat], [lonLat[0], lonLat[1]]) >= clipAngleRad) return null;

      const projected = projection([lonLat[0], lonLat[1]]);
      if (!projected) return null;
      // Undo the horizontal squash: the projection works in row units, cells are narrower.
      return [centreCol + (projected[0] - centreCol) / cellAspect, projected[1]];
    },

    fromCell(cellXY) {
      const invert = projection.invert;
      if (!invert) return null;

      // Outside the disc there is no surface point to name. Checked before inverting, because
      // d3's satellite invert returns NaN (or a plausible-looking lie) past the limb.
      const dxRows = (cellXY[0] - centreCol) * cellAspect;
      const dyRows = cellXY[1] - centreRow;
      if (Math.hypot(dxRows, dyRows) > radiusRows) return null;

      const lonLat = invert([centreCol + dxRows, cellXY[1]]);
      if (!lonLat || !Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1])) return null;
      return lonLat;
    },

    isVisible(lonLat, targetAltKm = 0) {
      return isVisible(lonLat, cam, body, targetAltKm);
    },

    metersPerCell() {
      const visibleArcKm = horizonAngleRad(body, cam.altitudeKm) * body.radiusKm;
      const radiusCells = Math.min(view.cols * cellAspect, view.rows) / 2;
      return (visibleArcKm * 1000) / radiusCells;
    },

    subcellProjection(subX, subY): SubcellProjection {
      // The base projection emits row units. A subcell is 1/subY of a row vertically, so
      // scaling by subY makes the vertical axis exact; the horizontal axis additionally has to
      // pass through the cell aspect, which is what correctX carries.
      //
      // correctX == 1 whenever cellAspect === subX/subY — which at the nominal 0.5 aspect is
      // precisely the statement that braille subcells are square (docs/RENDERING.md).
      const correctX = subX / cellAspect / subY;
      const centreX = (view.cols / 2) * subX;

      const sub = geoSatellite()
        .distance(P)
        .rotate([-cam.lon, -cam.lat, -cam.bearingDeg])
        .clipAngle(clipAngleDeg)
        .scale(scale * subY)
        .translate([centreX, (view.rows / 2) * subY]);

      return { projection: sub, correctX, centreX };
    },
  };
}
