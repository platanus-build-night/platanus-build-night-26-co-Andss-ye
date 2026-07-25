import { describe, expect, it } from 'vitest';
import { buildProjection } from '../src/projection/satellite.js';
import { createViewMetrics, discRadiusRows } from '../src/projection/aspect.js';
import { cameraDistance, horizonAngleRad } from '../src/projection/visibility.js';
import { createCameraState } from '../src/camera/state.js';
import { smallBody, testBody } from './fixtures.js';

const DEG = 180 / Math.PI;
const view = createViewMetrics(240, 70);

function cameraAt(altitudeKm: number, lon = 0, lat = 0) {
  return createCameraState('test-body', { lon, lat, altitudeKm });
}

/** Radius from the view centre in *row* units, undoing toCell's aspect correction. */
function radiusFromCentreRows(
  cell: readonly [number, number],
  cols: number,
  rows: number,
  cellAspect: number,
): number {
  const dxRows = (cell[0] - cols / 2) * cellAspect;
  const dyRows = cell[1] - rows / 2;
  return Math.hypot(dxRows, dyRows);
}

describe('derivation from docs/CAMERA.md', () => {
  const body = testBody();

  it('camera distance P is 1 + altitude/radius, always > 1', () => {
    expect(cameraDistance(body, 0)).toBe(1);
    expect(cameraDistance(body, body.radiusKm)).toBe(2);
    expect(cameraDistance(body, 400)).toBeCloseTo(1.0627845, 6);
  });

  // docs/CAMERA.md §2 verification: from the ISS an astronaut sees ~2200 km of surface.
  it('at 400 km the horizon is ~19.8 deg, about 2200 km of visible radius', () => {
    const horizonRad = horizonAngleRad(body, 400);
    expect(horizonRad * DEG).toBeCloseTo(19.79, 1);
    expect(horizonRad * body.radiusKm).toBeCloseTo(2200, -2);
  });

  // docs/CAMERA.md §2 verification: the real horizon distance from one kilometre up.
  it('at 1 km the horizon is ~1.01 deg, about 113 km away', () => {
    const horizonRad = horizonAngleRad(body, 1);
    expect(horizonRad * DEG).toBeCloseTo(1.015, 2);
    expect(horizonRad * body.radiusKm).toBeCloseTo(113, 0);
  });

  it('clip angle sits just inside the horizon, to dodge the limb singularity', () => {
    const projection = buildProjection(body, cameraAt(400), view);
    const horizonDeg = horizonAngleRad(body, 400) * DEG;
    expect(projection.clipAngleDeg).toBeLessThan(horizonDeg);
    expect(projection.clipAngleDeg).toBeCloseTo(horizonDeg, 5);
  });

  it('is parametrized by body.radiusKm, not a hard-coded radius', () => {
    // Same altitude, different body: a smaller body curves away faster, so less is visible.
    const big = horizonAngleRad(testBody(), 400);
    const small = horizonAngleRad(smallBody(), 400);
    expect(small).toBeGreaterThan(big);

    // Equal altitude-to-radius ratios must give an identical horizon angle.
    expect(horizonAngleRad(testBody(), 6371)).toBeCloseTo(horizonAngleRad(smallBody(), 1737), 12);
  });
});

describe('disc size', () => {
  const body = testBody();

  // Fase 1 done-criteria: the disc is the right size at any altitude.
  it.each([0.5, 5, 400, 2_000, 20_000, 80_000])(
    'puts the limb at the disc radius at %i km',
    (altitudeKm) => {
      const projection = buildProjection(body, cameraAt(altitudeKm), view);

      // Camera sits at (0,0), so a point at lon = c is exactly c degrees away along the equator.
      const nearLimb: [number, number] = [projection.clipAngleDeg * 0.99999, 0];
      const cell = projection.toCell(nearLimb);
      expect(cell).not.toBeNull();

      const r = radiusFromCentreRows(cell!, view.cols, view.rows, view.cellAspect);
      expect(r).toBeCloseTo(discRadiusRows(view), 2);
    },
  );

  it('the disc radius does not drift with altitude', () => {
    const radii = [1, 400, 80_000].map((alt) => {
      const projection = buildProjection(body, cameraAt(alt), view);
      const cell = projection.toCell([projection.clipAngleDeg * 0.99999, 0])!;
      return radiusFromCentreRows(cell, view.cols, view.rows, view.cellAspect);
    });
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 2);
  });

  it('the view centre projects to the centre of the grid', () => {
    const projection = buildProjection(body, cameraAt(2_000, -74.07, 4.71), view);
    const cell = projection.toCell([-74.07, 4.71]);
    expect(cell![0]).toBeCloseTo(view.cols / 2, 9);
    expect(cell![1]).toBeCloseTo(view.rows / 2, 9);
  });

  it('corrects for cell aspect, so the disc is round and not oval', () => {
    const projection = buildProjection(body, cameraAt(20_000), view);
    const east = projection.toCell([projection.clipAngleDeg * 0.9, 0])!;
    const north = projection.toCell([0, projection.clipAngleDeg * 0.9])!;

    const horizontalRows = (east[0] - view.cols / 2) * view.cellAspect;
    const verticalRows = view.rows / 2 - north[1];
    expect(horizontalRows).toBeCloseTo(verticalRows, 6);

    // In raw cell units the horizontal extent is 1/aspect times wider -- that is the squash
    // the correction exists to undo.
    expect(east[0] - view.cols / 2).toBeCloseTo(verticalRows / view.cellAspect, 6);
  });
});

describe('toCell / fromCell round-trip', () => {
  const body = testBody();

  it.each([
    ['globe view', 20_000],
    ['regional', 2_000],
    ['low orbit', 400],
    ['street level', 0.5],
  ])('is exact in %s', (_label, altitudeKm) => {
    const cam = cameraAt(altitudeKm, -74.07, 4.71);
    const projection = buildProjection(body, cam, view);
    const horizonDeg = horizonAngleRad(body, altitudeKm) * DEG;

    // Sample points well inside the visible cap, spread around the centre.
    for (const dLon of [-0.6, -0.2, 0, 0.3, 0.7]) {
      for (const dLat of [-0.5, 0, 0.4]) {
        const lonLat: [number, number] = [
          cam.lon + dLon * horizonDeg,
          cam.lat + dLat * horizonDeg,
        ];
        const cell = projection.toCell(lonLat);
        expect(cell).not.toBeNull();

        const back = projection.fromCell(cell!);
        expect(back).not.toBeNull();
        expect(back![0]).toBeCloseTo(lonLat[0], 6);
        expect(back![1]).toBeCloseTo(lonLat[1], 6);
      }
    }
  });

  it('survives a non-zero bearing', () => {
    const cam = createCameraState('test-body', {
      lon: 139.69,
      lat: 35.69,
      altitudeKm: 3_000,
      bearingDeg: 37,
    });
    const projection = buildProjection(body, cam, view);
    const lonLat: [number, number] = [141, 37];

    const back = projection.fromCell(projection.toCell(lonLat)!);
    expect(back![0]).toBeCloseTo(lonLat[0], 6);
    expect(back![1]).toBeCloseTo(lonLat[1], 6);
  });

  it('fromCell returns null for a cell off the body', () => {
    const projection = buildProjection(body, cameraAt(20_000), view);
    expect(projection.fromCell([0, 0])).toBeNull();
  });
});

describe('hidden-hemisphere culling', () => {
  const body = testBody();

  it('the antipode is never visible', () => {
    const cam = cameraAt(20_000, 10, 20);
    const projection = buildProjection(body, cam, view);
    expect(projection.isVisible([-170, -20])).toBe(false);
  });

  it('the sub-camera point is always visible', () => {
    const projection = buildProjection(body, cameraAt(400, 10, 20), view);
    expect(projection.isVisible([10, 20])).toBe(true);
  });

  it('a point just past the horizon is culled, just inside is not', () => {
    const cam = cameraAt(400);
    const projection = buildProjection(body, cam, view);
    const horizonDeg = horizonAngleRad(body, 400) * DEG;

    expect(projection.isVisible([horizonDeg * 0.99, 0])).toBe(true);
    expect(projection.isVisible([horizonDeg * 1.01, 0])).toBe(false);
  });

  it('an elevated target sees past the ground horizon', () => {
    const cam = cameraAt(400);
    const projection = buildProjection(body, cam, view);
    const horizonDeg = horizonAngleRad(body, 400) * DEG;
    const justPast: [number, number] = [horizonDeg * 1.02, 0];

    expect(projection.isVisible(justPast)).toBe(false);
    expect(projection.isVisible(justPast, 11)).toBe(true); // cruising airliner
  });

  it('toCell returns null beyond the clip angle', () => {
    const projection = buildProjection(body, cameraAt(400), view);
    expect(projection.toCell([projection.clipAngleDeg * 1.5, 0])).toBeNull();
  });
});

describe('metersPerCell', () => {
  const body = testBody();

  it('shrinks as the camera descends', () => {
    const high = buildProjection(body, cameraAt(20_000), view).metersPerCell();
    const low = buildProjection(body, cameraAt(400), view).metersPerCell();
    expect(low).toBeLessThan(high);
  });

  // docs/CAMERA.md LOD ladder: L0 (>20 000 km) is ~200 km per cell on a 240x70 grid.
  it('is in the ballpark of the LOD ladder at globe view', () => {
    const perCell = buildProjection(body, cameraAt(20_000), view).metersPerCell();
    expect(perCell / 1000).toBeGreaterThan(100);
    expect(perCell / 1000).toBeLessThan(300);
  });
});
