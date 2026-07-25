import { describe, expect, it } from 'vitest';
import type { MultiLineString, Polygon } from 'geojson';
import { createSampleContext } from '../src/layers/types.js';
import { buildProjection } from '../src/projection/satellite.js';
import { createViewMetrics } from '../src/projection/aspect.js';
import { createCameraState } from '../src/camera/state.js';
import { createSampleBuffer, LINE_CLASS } from '../src/raster/sample-buffer.js';
import { testBody } from './fixtures.js';

/**
 * Regression: open linework was being closed, joining each path's last point back to its
 * first. On a real coastline that drew several straight lines hundreds of subcells long
 * clean across the globe.
 *
 * Whether a path closes is a property of the geometry — d3 tells us by calling closePath()
 * for polygons and not for linestrings — so this is verified through the real path pipeline,
 * not by passing a flag.
 */
const body = testBody();
const view = createViewMetrics(60, 30);

function paint(geometry: MultiLineString | Polygon) {
  const buffer = createSampleBuffer(view.cols, view.rows);
  const camera = createCameraState(body.id, { lon: 0, lat: 0, altitudeKm: 20_000 });
  const projection = buildProjection(body, camera, view);
  const ctx = createSampleContext(buffer, projection, body, camera);
  ctx.strokeLine(geometry, LINE_CLASS.COAST);
  return buffer;
}

function markedSubcells(buffer: ReturnType<typeof createSampleBuffer>): number {
  let n = 0;
  for (const v of buffer.lineMask) if (v !== 0) n++;
  return n;
}

describe('stroking open paths', () => {
  // An L: two legs whose endpoints are far apart. Closing it would add a diagonal hypotenuse.
  const openL: MultiLineString = {
    type: 'MultiLineString',
    coordinates: [[[-20, 0], [0, 0], [0, 20]]],
  };

  it('does not join the endpoints of an open line', () => {
    const buffer = paint(openL);

    // The corner at [0,0] projects to the view centre; the two ends are up and to the left.
    // A closing segment would have to cut through the interior between those ends, so probe
    // the midpoint of that would-be hypotenuse.
    const projection = buildProjection(
      body,
      createCameraState(body.id, { lon: 0, lat: 0, altitudeKm: 20_000 }),
      view,
    );
    const midpoint = projection.toCell([-10, 10]);
    expect(midpoint).not.toBeNull();

    const sx = Math.round(midpoint![0] * buffer.subX);
    const sy = Math.round(midpoint![1] * buffer.subY);

    // Scan a small neighbourhood: the spurious diagonal would pass through here.
    let found = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (buffer.lineMask[(sy + dy) * buffer.width + sx + dx] !== 0) found++;
      }
    }
    expect(found).toBe(0);
  });

  it('a polygon boundary still closes, because d3 reports it as closed', () => {
    const triangle: Polygon = {
      type: 'Polygon',
      coordinates: [[[-20, 0], [0, 0], [0, 20], [-20, 0]]],
    };
    // A closed triangle draws all three sides; the same vertices as an open path draw two.
    const closedInk = markedSubcells(paint(triangle));
    const openInk = markedSubcells(paint(openL));
    expect(closedInk).toBeGreaterThan(openInk);
  });

  it('draws every segment of a multi-part line', () => {
    const twoParts: MultiLineString = {
      type: 'MultiLineString',
      coordinates: [
        [[-20, 10], [-10, 10]],
        [[10, -10], [20, -10]],
      ],
    };
    expect(markedSubcells(paint(twoParts))).toBeGreaterThan(0);
  });
});
