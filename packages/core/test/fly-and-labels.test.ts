import { describe, expect, it } from 'vitest';
import { planFlight } from '../src/camera/fly-to.js';
import { Camera } from '../src/camera/camera.js';
import { createCameraState, MIN_ALT_KM } from '../src/camera/state.js';
import { zoomStep, ZOOM_SENSITIVITY, zoomAltitude } from '../src/camera/wheel.js';
import { CollisionGrid, placeLabels } from '../src/labels/collision.js';
import { buildChrome } from '../src/chrome.js';
import { buildProjection } from '../src/projection/satellite.js';
import { createViewMetrics } from '../src/projection/aspect.js';
import { testBody } from './fixtures.js';

const body = testBody();

describe('flyTo', () => {
  const bogota = { lon: -74.07, lat: 4.71, altitudeKm: 400 };
  const tokyo = { lon: 139.69, lat: 35.69, altitudeKm: 400 };

  it('starts where the camera is and ends where it was told', () => {
    const from = createCameraState(body.id, bogota);
    const flight = planFlight(from, tokyo, body);

    const start = flight.at(0);
    expect(start.lon).toBeCloseTo(bogota.lon, 4);
    expect(start.lat).toBeCloseTo(bogota.lat, 4);

    const end = flight.at(1);
    expect(end.lon).toBeCloseTo(tokyo.lon, 4);
    expect(end.lat).toBeCloseTo(tokyo.lat, 4);
    expect(end.altitudeKm).toBeCloseTo(tokyo.altitudeKm, 2);
  });

  /** docs/CAMERA.md: without the climb, a long trip is a nauseating low pass over the surface. */
  it('climbs on the way across the planet', () => {
    const flight = planFlight(createCameraState(body.id, bogota), tokyo, body);
    expect(flight.at(0.5).altitudeKm).toBeGreaterThan(bogota.altitudeKm * 5);
  });

  it('does not climb pointlessly on a short hop', () => {
    const near = { lon: -74.0, lat: 4.8, altitudeKm: 400 };
    const flight = planFlight(createCameraState(body.id, bogota), near, body);
    expect(flight.at(0.5).altitudeKm).toBeLessThan(bogota.altitudeKm * 1.5);
  });

  it('takes the short way across the antimeridian', () => {
    const from = createCameraState(body.id, { lon: 179, lat: 0, altitudeKm: 1000 });
    const flight = planFlight(from, { lon: -179, lat: 0, altitudeKm: 1000 }, body);

    // Slerp goes 2 degrees east, not 358 west, so the midpoint sits near the seam.
    const middle = flight.at(0.5);
    expect(Math.abs(middle.lon)).toBeGreaterThan(179);
  });

  it('scales duration with distance and caps it', () => {
    const short = planFlight(createCameraState(body.id, bogota), { lon: -74, lat: 5 }, body);
    const long = planFlight(createCameraState(body.id, bogota), tokyo, body);
    expect(long.durationMs).toBeGreaterThan(short.durationMs);
    expect(long.durationMs).toBeLessThanOrEqual(2400);
  });

  it('never plans through an invalid altitude', () => {
    const flight = planFlight(
      createCameraState(body.id, { altitudeKm: 80_000 }),
      { lon: 100, lat: 50, altitudeKm: MIN_ALT_KM },
      body,
    );
    for (let t = 0; t <= 1; t += 0.05) {
      expect(flight.at(t).altitudeKm).toBeGreaterThan(0);
      expect(Number.isFinite(flight.at(t).altitudeKm)).toBe(true);
    }
  });

  it('the camera reports flying, then arrives and settles', () => {
    const camera = new Camera(body.id, bogota);
    void camera.flyTo(tokyo, body);
    expect(camera.isFlying).toBe(true);

    for (let i = 0; i < 400; i++) camera.update(16);
    expect(camera.isFlying).toBe(false);
    expect(camera.isSettled).toBe(true);
    expect(camera.state.lon).toBeCloseTo(tokyo.lon, 3);
  });

  it('a direct input cancels the flight — the person took the controls back', () => {
    const camera = new Camera(body.id, bogota);
    void camera.flyTo(tokyo, body);
    camera.update(16);

    camera.set({ altitudeKm: 5000 });
    expect(camera.isFlying).toBe(false);
  });
});

describe('fast zoom', () => {
  it('a step halves or doubles altitude, the map-tool convention', () => {
    expect(zoomStep(1000, 1)).toBeCloseTo(500, 6);
    expect(zoomStep(1000, -1)).toBeCloseTo(2000, 6);
    expect(zoomStep(1000, 2)).toBeCloseTo(250, 6);
  });

  it('is clamped to the altitude range', () => {
    expect(zoomStep(MIN_ALT_KM, 20)).toBe(MIN_ALT_KM);
  });

  /**
   * The complaint this answers: crossing from orbit to street level took ~59 wheel notches.
   */
  it('crosses the whole altitude range in a reasonable number of notches', () => {
    let altitudeKm = 20_000;
    let notches = 0;
    while (altitudeKm > 0.5 && notches < 200) {
      altitudeKm = zoomAltitude(altitudeKm, -120);
      notches++;
    }
    expect(notches).toBeLessThan(30);
  });

  it('accelerated zoom needs a third of the notches', () => {
    const plain = zoomAltitude(20_000, -120, 1);
    const fast = zoomAltitude(20_000, -120, 3);
    expect(fast).toBeLessThan(plain);
    expect(Math.log(20_000 / fast) / Math.log(20_000 / plain)).toBeCloseTo(3, 1);
  });

  it('still allows fine control, because the curve stays exponential', () => {
    const tiny = zoomAltitude(1000, -1);
    expect(1000 - tiny).toBeLessThan(1000 * ZOOM_SENSITIVITY * 2);
  });
});

describe('label collision', () => {
  it('places a label that fits', () => {
    const grid = new CollisionGrid(40, 10);
    const placed = placeLabels(grid, [{ cellX: 5, cellY: 5, text: 'BOGOTA' }]);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.text).toBe('BOGOTA');
  });

  /** The Fase 5 criterion: Bogota with its name, without covering Medellin. */
  it('never overlaps two labels', () => {
    const grid = new CollisionGrid(60, 12);
    const placed = placeLabels(grid, [
      { cellX: 10, cellY: 5, text: 'BOGOTA' },
      { cellX: 12, cellY: 5, text: 'MEDELLIN' },
      { cellX: 11, cellY: 5, text: 'CALI' },
    ]);

    const occupied = new Set<string>();
    for (const label of placed) {
      for (let i = 0; i < label.text.length; i++) {
        const key = `${label.x + i},${label.y}`;
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
      }
    }
  });

  it('drops the least important name rather than the first, when space runs out', () => {
    const grid = new CollisionGrid(12, 1);
    const placed = placeLabels(grid, [
      { cellX: 1, cellY: 0, text: 'CAPITAL' },
      { cellX: 2, cellY: 0, text: 'SECOND' },
      { cellX: 3, cellY: 0, text: 'THIRD' },
    ]);
    expect(placed[0]?.text).toBe('CAPITAL');
    expect(placed.length).toBeLessThan(3);
  });

  it('carries the source index, so duplicate names cannot cross wires', () => {
    const grid = new CollisionGrid(60, 12);
    const placed = placeLabels(grid, [
      { cellX: 5, cellY: 2, text: 'SPRINGFIELD' },
      { cellX: 5, cellY: 8, text: 'SPRINGFIELD' },
    ]);
    expect(placed.map((label) => label.index)).toEqual([0, 1]);
  });

  it('never places a label outside the grid', () => {
    const grid = new CollisionGrid(20, 5);
    const placed = placeLabels(grid, [{ cellX: 19, cellY: 4, text: 'VERYLONGNAME' }]);
    for (const label of placed) {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x + label.text.length).toBeLessThanOrEqual(20);
    }
  });
});

describe('limb and halo', () => {
  const view = createViewMetrics(240, 70);

  it('draws a ring when the whole disc is on screen', () => {
    const projection = buildProjection(body, createCameraState(body.id, { altitudeKm: 20_000 }), view);
    const chrome = buildChrome(projection, body);
    expect(chrome.limb).not.toBeNull();
    expect(chrome.limb!.radiusRows).toBeCloseTo(projection.radiusRows, 6);
  });

  it('gives a body with an atmosphere a halo, and one without a hard limb', () => {
    const projection = buildProjection(body, createCameraState(body.id, { altitudeKm: 20_000 }), view);

    const withAir = testBody({ atmosphere: { paletteIndex: 3, haloPx: 3 } });
    expect(buildChrome(projection, withAir).halo).not.toBeNull();
    expect(buildChrome(projection, testBody({ atmosphere: null })).halo).toBeNull();
  });
});
