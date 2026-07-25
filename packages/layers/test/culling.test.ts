import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoContains, geoDistance } from 'd3-geo';
import type { Position } from 'geojson';
import type { Topology } from 'topojson-specification';
import {
  boundingCap,
  capIsVisible,
  capRuns,
  resolveRing,
  viewCap,
  parseLandTopology,
  visiblePolygons,
  visibleLines,
} from '../src/index.js';

/**
 * Culling and thinning exist to make deep zoom affordable — 103 ms per frame down to 7 — and
 * they are only allowed to do that if the picture does not change. The dangerous failure is not
 * a slow frame, it is a polygon that stops containing the camera: the land under the viewer
 * turns to ocean, which is exactly the bug this project has already been bitten by twice.
 */

const assets = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'assets',
  'earth',
);

/**
 * A circle of `count` points around [lon, lat], radius in degrees.
 *
 * Clockwise in lon/lat, which is what d3 reads as an interior: the obvious counter-clockwise
 * version encloses 97 % of the sphere instead of a disc, which is the same winding trap
 * `rewindPolygon` exists to undo for Natural Earth.
 */
function circle(lon: number, lat: number, radiusDeg: number, count: number): Position[] {
  const ring: Position[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = -(i / count) * Math.PI * 2;
    ring.push([lon + Math.cos(angle) * radiusDeg, lat + Math.sin(angle) * radiusDeg]);
  }
  return ring;
}

describe('bounding caps', () => {
  it('contains every point it was built from', () => {
    const ring = circle(30, 10, 5, 200);
    const cap = boundingCap([ring]);

    for (const [lon, lat] of ring) {
      const distance = geoDistance([cap.centre[0], cap.centre[1]], [lon!, lat!]);
      expect(distance).toBeLessThanOrEqual(cap.radiusRad + 1e-9);
    }
  });

  it('agrees with the geoDistance test it replaced', () => {
    const cap = boundingCap([circle(30, 10, 5, 64)]);

    for (const [lon, lat, horizonRad] of [
      [30, 10, 0.05],
      [35, 10, 0.05],
      [-150, -10, 0.5],
      [31, 11, 0.001],
      [0, 0, 1.5],
    ] as const) {
      const byDistance =
        geoDistance([lon, lat], [cap.centre[0], cap.centre[1]]) - cap.radiusRad <= horizonRad;
      expect(capIsVisible(cap, viewCap(lon, lat, horizonRad))).toBe(byDistance);
    }
  });

  it('handles the antimeridian, where averaging degrees would put the centre at zero', () => {
    const cap = boundingCap([[[179, 0], [-179, 0], [180, 1]]]);
    expect(Math.abs(cap.centre[0])).toBeGreaterThan(170);
    expect(cap.radiusRad).toBeLessThan(0.1);
  });
});

describe('ring thinning', () => {
  const ring = capRuns(circle(0, 0, 20, 512));

  it('keeps every point where the camera is looking', () => {
    // A view wide enough to cover the whole ring: nothing is far, nothing is thinned.
    const full = resolveRing(ring, viewCap(0, 0, Math.PI), 0, []);
    expect(full).toHaveLength(513);
  });

  it('thins what the camera cannot see', () => {
    const partial = resolveRing(ring, viewCap(20, 0, 0.05), 0, []);
    expect(partial.length).toBeLessThan(513);
    expect(partial.length).toBeGreaterThan(16);
  });

  it('always closes the ring, however hard it thins', () => {
    for (const horizon of [0.001, 0.05, 0.5, 3]) {
      const out = resolveRing(ring, viewCap(120, 60, horizon), 0, []);
      expect(out[0]).toEqual(ring.coordinates[0]);
      expect(out[out.length - 1]).toEqual(ring.coordinates[ring.coordinates.length - 1]);
    }
  });

  /**
   * The one that matters. Thinning may move the coastline off screen; it may never move it
   * across the camera, because a polygon that stops containing the viewer paints the ground
   * under them as sea.
   */
  it('still contains a camera that was inside it', () => {
    for (const [lon, lat] of [[0, 0], [10, 5], [-15, -10], [0, 19]] as const) {
      const out = resolveRing(ring, viewCap(lon, lat, 0.02), 0, []);
      expect(geoContains({ type: 'Polygon', coordinates: [out] }, [lon, lat])).toBe(true);
    }
  });

  it('thins by what a subcell can show, so finer data costs nothing extra', () => {
    // A subcell four times the data's own spacing: three points in four are invisible.
    const fine = capRuns(circle(0, 0, 20, 2048));
    const shown = resolveRing(fine, viewCap(0, 0, Math.PI), fine.meanStepRad * 4, []);
    expect(shown.length).toBeLessThan(700);
    expect(geoContains({ type: 'Polygon', coordinates: [shown] }, [0, 0])).toBe(true);
  });
});

describe('against the real coastline', () => {
  const land = parseLandTopology(
    JSON.parse(readFileSync(join(assets, 'land-110m.topo.json'), 'utf8')) as Topology,
    'land',
  );

  it('keeps the camera on land when it is over land', () => {
    // Places that are unambiguously inland, well away from any coast.
    for (const [name, lon, lat] of [
      ['Kansas', -98, 38],
      ['Sahara', 10, 25],
      ['Siberia', 100, 62],
      ['Amazon', -60, -5],
      ['Australia', 133, -25],
    ] as const) {
      const view = viewCap(lon, lat, 0.02);
      const collection = visiblePolygons(land.polygons, view, 0);
      const inside = collection.features.some((f) => geoContains(f, [lon, lat]));
      expect(inside, `${name} should still be land after thinning`).toBe(true);
    }
  });

  it('keeps the camera off land when it is over ocean', () => {
    for (const [name, lon, lat] of [
      ['Pacific', -140, 0],
      ['Atlantic', -30, 20],
      ['Indian', 80, -30],
    ] as const) {
      const view = viewCap(lon, lat, 0.02);
      const collection = visiblePolygons(land.polygons, view, 0);
      const inside = collection.features.some((f) => geoContains(f, [lon, lat]));
      expect(inside, `${name} should still be ocean after thinning`).toBe(false);
    }
  });

  it('rejects the hemisphere behind the planet', () => {
    // Looking at the mid-Pacific, Africa is on the far side and must not be streamed at all.
    const view = viewCap(-160, 0, 1.2);
    const near = visiblePolygons(land.polygons, view, 0);
    const all = visiblePolygons(land.polygons, viewCap(-160, 0, Math.PI), 0);
    expect(near.features.length).toBeLessThan(all.features.length);
  });

  it('drops no coastline the camera can see', () => {
    const view = viewCap(-80.19, 25.77, 0.3);
    const outline = visibleLines(land.outlineSegments, view, 0);
    // Florida's coast is in view: something has to be there.
    expect(outline.coordinates.length).toBeGreaterThan(0);
  });
});
