import { describe, expect, it } from 'vitest';
import { Camera } from '../src/camera/camera.js';
import { beginDrag, dragTo } from '../src/camera/drag.js';
import { normalizeWheel, zoomAltitude, zoomToward } from '../src/camera/wheel.js';
import { damp, dampAltitude, dampAngle } from '../src/camera/damping.js';
import { buildProjection } from '../src/projection/satellite.js';
import { createViewMetrics } from '../src/projection/aspect.js';
import { createCameraState, MAX_ALT_KM, MIN_ALT_KM } from '../src/camera/state.js';
import { LodTracker, lodWithHysteresis } from '../src/lod/hysteresis.js';
import { lodForAltitude } from '../src/lod/ladder.js';
import { describeGesture, gestureDelta } from '../src/input/gestures.js';
import { testBody } from './fixtures.js';

const body = testBody();
const view = createViewMetrics(240, 70);

function projectionAt(altitudeKm: number, lon = 0, lat = 0, bearingDeg = 0) {
  return buildProjection(body, createCameraState(body.id, { lon, lat, altitudeKm, bearingDeg }), view);
}

describe('drag', () => {
  it('keeps the grabbed point under the cursor', () => {
    const projection = projectionAt(20_000);
    const grabCell: [number, number] = [view.cols / 2 + 12, view.rows / 2 - 6];

    const grabbed = projection.fromCell(grabCell)!;
    const drag = beginDrag(projection, grabCell)!;
    expect(drag).not.toBeNull();

    // Drag it somewhere else on the disc.
    const dropCell: [number, number] = [view.cols / 2 - 8, view.rows / 2 + 4];
    const rotation = dragTo(drag, dropCell)!;
    expect(rotation).not.toBeNull();

    // Under the resulting camera, the grabbed lon/lat must land on the drop cell.
    const after = buildProjection(
      body,
      createCameraState(body.id, { ...rotation, altitudeKm: 20_000 }),
      view,
    );
    const landed = after.toCell(grabbed)!;
    expect(landed[0]).toBeCloseTo(dropCell[0], 6);
    expect(landed[1]).toBeCloseTo(dropCell[1], 6);
  });

  it('holds true at street level, not just from orbit', () => {
    const projection = projectionAt(2);
    const grabCell: [number, number] = [view.cols / 2 + 4, view.rows / 2 + 2];
    const grabbed = projection.fromCell(grabCell)!;
    const drag = beginDrag(projection, grabCell)!;

    const dropCell: [number, number] = [view.cols / 2 - 5, view.rows / 2 - 3];
    const rotation = dragTo(drag, dropCell)!;

    const after = buildProjection(
      body,
      createCameraState(body.id, { ...rotation, altitudeKm: 2 }),
      view,
    );
    const landed = after.toCell(grabbed)!;
    expect(landed[0]).toBeCloseTo(dropCell[0], 5);
    expect(landed[1]).toBeCloseTo(dropCell[1], 5);
  });

  it('refuses to start off the body', () => {
    expect(beginDrag(projectionAt(20_000), [0, 0])).toBeNull();
  });

  it('returns null rather than jumping when the cursor leaves the body', () => {
    const projection = projectionAt(20_000);
    const drag = beginDrag(projection, [view.cols / 2, view.rows / 2])!;
    expect(dragTo(drag, [0, 0])).toBeNull();
  });
});

describe('wheel zoom', () => {
  it('normalizes deltaMode so devices agree', () => {
    expect(normalizeWheel(3, 0)).toBe(3); // pixels
    expect(normalizeWheel(3, 1)).toBeGreaterThan(normalizeWheel(3, 0)); // lines
    expect(normalizeWheel(3, 2)).toBeGreaterThan(normalizeWheel(3, 1)); // pages
  });

  it('is exponential, so a notch is the same proportion at any altitude', () => {
    const ratioHigh = zoomAltitude(20_000, -100) / 20_000;
    const ratioLow = zoomAltitude(20, -100) / 20;
    expect(ratioHigh).toBeCloseTo(ratioLow, 9);
  });

  it('zooms in on negative delta and out on positive', () => {
    expect(zoomAltitude(1_000, -100)).toBeLessThan(1_000);
    expect(zoomAltitude(1_000, 100)).toBeGreaterThan(1_000);
  });

  it('clamps to the documented altitude range', () => {
    expect(zoomAltitude(MIN_ALT_KM, -100_000)).toBe(MIN_ALT_KM);
    expect(zoomAltitude(MAX_ALT_KM, 100_000)).toBe(MAX_ALT_KM);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const projection = projectionAt(20_000);
    const cursor: [number, number] = [view.cols / 2 + 20, view.rows / 2 - 10];
    const anchor = projection.fromCell(cursor)!;

    const zoom = zoomToward(projection, cursor, -120, 0, (altitudeKm) =>
      buildProjection(body, createCameraState(body.id, { altitudeKm }), view),
    );
    expect(zoom.altitudeKm).toBeLessThan(20_000);
    expect(zoom.lon).toBeDefined();

    const after = buildProjection(
      body,
      createCameraState(body.id, {
        lon: zoom.lon!,
        lat: zoom.lat!,
        altitudeKm: zoom.altitudeKm,
      }),
      view,
    );
    const landed = after.toCell(anchor)!;
    // Within a cell: the correction is a single re-projection, not an iterative solve.
    expect(Math.hypot(landed[0] - cursor[0], landed[1] - cursor[1])).toBeLessThan(1);
  });

  it('still zooms when the cursor is off the body, just without an anchor', () => {
    const zoom = zoomToward(projectionAt(20_000), [0, 0], -120, 0, (altitudeKm) =>
      buildProjection(body, createCameraState(body.id, { altitudeKm }), view),
    );
    expect(zoom.altitudeKm).toBeLessThan(20_000);
    expect(zoom.lon).toBeUndefined();
  });
});

describe('damping', () => {
  it('converges toward the target', () => {
    let v = 0;
    for (let i = 0; i < 20; i++) v = damp(v, 100, 16, 90);
    expect(v).toBeGreaterThan(95);
    expect(v).toBeLessThanOrEqual(100);
  });

  it('is frame-rate independent', () => {
    const oneBigStep = damp(0, 100, 32, 90);
    let twoSmallSteps = damp(0, 100, 16, 90);
    twoSmallSteps = damp(twoSmallSteps, 100, 16, 90);
    expect(oneBigStep).toBeCloseTo(twoSmallSteps, 9);
  });

  it('settles exactly, so the render loop can go idle', () => {
    let v = 0;
    for (let i = 0; i < 500; i++) v = damp(v, 100, 16, 90);
    expect(v).toBe(100);
  });

  it('takes the short way across the +-180 seam', () => {
    // 179 -> -179 is 2 degrees east, not 358 degrees west.
    const next = dampAngle(179, -179, 16, 60);
    expect(next).toBeGreaterThan(179);
  });

  it('damps altitude geometrically, so halving takes the same time at any scale', () => {
    const highRatio = dampAltitude(20_000, 10_000, 16) / 20_000;
    const lowRatio = dampAltitude(20, 10, 16) / 20;
    expect(highRatio).toBeCloseTo(lowRatio, 9);
  });

  it('never overshoots into a negative altitude', () => {
    let alt = 20_000;
    for (let i = 0; i < 200; i++) alt = dampAltitude(alt, MIN_ALT_KM, 16);
    expect(alt).toBeGreaterThan(0);
  });
});

describe('Camera with damping', () => {
  it('approaches the target over several frames instead of jumping', () => {
    const camera = new Camera(body.id, { altitudeKm: 20_000 });
    camera.set({ altitudeKm: 1_000 });

    camera.update(16);
    expect(camera.state.altitudeKm).toBeLessThan(20_000);
    expect(camera.state.altitudeKm).toBeGreaterThan(1_000);
    expect(camera.isSettled).toBe(false);

    for (let i = 0; i < 200; i++) camera.update(16);
    expect(camera.state.altitudeKm).toBeCloseTo(1_000, 6);
    expect(camera.isSettled).toBe(true);
  });

  it('reducedMotion moves instantly but leaves interaction unchanged', () => {
    const camera = new Camera(body.id, { altitudeKm: 20_000 }, { reducedMotion: true });
    camera.set({ altitudeKm: 1_000 });
    camera.update(16);
    expect(camera.state.altitudeKm).toBe(1_000);
    expect(camera.isSettled).toBe(true);
  });

  it('settles after crossing the antimeridian', () => {
    const camera = new Camera(body.id, { lon: 179 });
    camera.set({ lon: -179 });
    for (let i = 0; i < 300; i++) camera.update(16);
    expect(camera.isSettled).toBe(true);
    expect(camera.state.lon).toBeCloseTo(-179, 6);
  });

  /**
   * Regression: `isSettled` must become exactly true, because the render loop stops scheduling
   * frames on it. Reaching a fixed point an ulp away from the target left the loop awake at
   * 60 Hz forever — cheap per frame thanks to the cache, but the fan never stops.
   */
  it('settles exactly on the arbitrary values a drag produces', () => {
    const awkward = [
      { lon: -10.385612345, lat: 26.112789, bearingDeg: 352.10987 },
      { lon: 179.9999, lat: -89.87654, bearingDeg: 0.00001 },
      { lon: -0.000001, lat: 0.0000001, bearingDeg: 359.99999 },
    ];

    for (const target of awkward) {
      const camera = new Camera(body.id, { lon: -30, lat: 20, altitudeKm: 20_000 });
      camera.set({ ...target, altitudeKm: 8123.4567 });

      for (let i = 0; i < 600; i++) camera.update(16);

      expect(camera.isSettled).toBe(true);
      expect(camera.state).toEqual(camera.target);
    }
  });

  it('stops changing once settled, so the cache key stays stable', () => {
    const camera = new Camera(body.id, { lon: -30, lat: 20, altitudeKm: 20_000 });
    camera.set({ lon: -10.3856, lat: 26.1128, altitudeKm: 4321.5 });
    for (let i = 0; i < 600; i++) camera.update(16);

    const settled = { ...camera.state };
    for (let i = 0; i < 10; i++) camera.update(16);
    expect(camera.state).toEqual(settled);
  });
});

describe('LOD ladder', () => {
  it('maps altitude to the levels docs/CAMERA.md tabulates', () => {
    expect(lodForAltitude(30_000)).toBe('L0');
    expect(lodForAltitude(10_000)).toBe('L1');
    expect(lodForAltitude(3_000)).toBe('L2');
    expect(lodForAltitude(1_000)).toBe('L3');
    expect(lodForAltitude(300)).toBe('L4');
    expect(lodForAltitude(50)).toBe('L5');
    expect(lodForAltitude(10)).toBe('L6');
    expect(lodForAltitude(1)).toBe('L7');
  });

  it('does not flicker when the altitude hovers on a boundary', () => {
    const tracker = new LodTracker();
    tracker.update(6_000); // settle at L1

    // Jitter across the L1/L2 line; hysteresis should absorb all of it.
    for (const altitude of [5_999, 6_001, 5_995, 6_010, 5_990]) {
      expect(tracker.update(altitude)).toBeNull();
    }
    expect(tracker.level).toBe('L1');
  });

  it('does change once the altitude moves decisively', () => {
    const tracker = new LodTracker();
    tracker.update(6_000);
    expect(tracker.update(4_000)).toBe('L2'); // well past the 15 % margin
  });

  it('is symmetric: climbing back also needs to clear the margin', () => {
    expect(lodWithHysteresis(6_100, 'L2')).toBe('L2'); // inside the margin, hold
    expect(lodWithHysteresis(8_000, 'L2')).toBe('L1'); // clear of it, switch
  });
});

describe('two-finger gestures', () => {
  const aspect = 0.5;

  it('spreading fingers zooms in', () => {
    const from = describeGesture([10, 10], [20, 10], aspect);
    const to = describeGesture([5, 10], [25, 10], aspect);
    expect(gestureDelta(from, to).altitudeScale).toBeLessThan(1);
  });

  it('pinching zooms out', () => {
    const from = describeGesture([5, 10], [25, 10], aspect);
    const to = describeGesture([10, 10], [20, 10], aspect);
    expect(gestureDelta(from, to).altitudeScale).toBeGreaterThan(1);
  });

  it('twisting changes bearing', () => {
    const from = describeGesture([10, 10], [20, 10], aspect);
    const to = describeGesture([10, 10], [10, 15], aspect);
    expect(Math.abs(gestureDelta(from, to).bearingDeltaDeg)).toBeGreaterThan(10);
  });

  it('reports midpoint movement for a two-finger pan', () => {
    const from = describeGesture([10, 10], [20, 10], aspect);
    const to = describeGesture([14, 13], [24, 13], aspect);
    const delta = gestureDelta(from, to);
    expect(delta.panCell[0]).toBeCloseTo(4, 9);
    expect(delta.panCell[1]).toBeCloseTo(3, 9);
    expect(delta.altitudeScale).toBeCloseTo(1, 9); // pure pan, no zoom
  });

  it('ignores degenerate contacts instead of producing infinities', () => {
    const from = describeGesture([10, 10], [10, 10], aspect);
    const to = describeGesture([10, 10], [20, 10], aspect);
    const delta = gestureDelta(from, to);
    expect(Number.isFinite(delta.altitudeScale)).toBe(true);
    expect(delta.altitudeScale).toBe(1);
  });

  it('measures the angle in square units, not skewed cells', () => {
    // 2 cells across and 1 cell down is 45 degrees on screen at aspect 0.5.
    const g = describeGesture([0, 0], [2, 1], aspect);
    expect(g.angleDeg).toBeCloseTo(45, 9);
  });
});
