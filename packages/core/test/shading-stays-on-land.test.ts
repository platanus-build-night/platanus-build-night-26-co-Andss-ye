import { describe, expect, it } from 'vitest';
import { Grid } from '../src/grid/grid.js';
import { PAL } from '../src/palette/palette.js';
import { reduce } from '../src/raster/reduce.js';
import { SUB_X, SUB_Y, createSampleBuffer } from '../src/raster/sample-buffer.js';
import { testBody } from './fixtures.js';

/**
 * Relief shading moves a **palette index**, not a colour, and docs/RELIEF.md is explicit that it
 * may only move inside the terrain ramp: "shading must never push a mountain into the water
 * colours".
 *
 * It did. The clamp took its floor from every band including the bathymetric ones, so a plain
 * shaded two steps down landed on SHELF and a mountainside on PELAGIC — the glyph still said
 * land, the colour said ocean. It showed up as blue strips down the Pacific side of the Andes,
 * and it *moved* as the globe turned, because the light direction is in screen space: rotate,
 * and a different slope faces away from the sun. Zooming out made it worse, because more
 * terrain per subcell means a steeper measured gradient.
 */

const BANDS = [
  { maxM: -4000, glyph: ' ', paletteIndex: PAL.ABYSS },
  { maxM: -200, glyph: '·', paletteIndex: PAL.PELAGIC },
  { maxM: 0, glyph: '~', paletteIndex: PAL.SHELF },
  { maxM: 50, glyph: '.', paletteIndex: PAL.LITTORAL },
  { maxM: 300, glyph: ',', paletteIndex: PAL.PLAIN },
  { maxM: 1500, glyph: ';', paletteIndex: PAL.STEPPE },
  { maxM: 3500, glyph: '^', paletteIndex: PAL.HIGHLAND },
  { maxM: 9000, glyph: 'A', paletteIndex: PAL.ALPINE },
];

const body = testBody({ bands: BANDS, elevationRangeM: [-10513, 6761] });

/** Palette indices that mean water in this band table. */
const WATER_INDICES = new Set(
  BANDS.filter((band) => band.maxM <= 0).map((band) => band.paletteIndex),
);

/**
 * Puts a step of `risePerSubcellM` through the middle of the buffer — the steepest slope there
 * is — and returns the palette index of the land cell sitting on it, lit from `sun`.
 *
 * Both sides stay above sea level and inside the body's declared range, so anything the test
 * catches is the shading and not the terrain.
 */
function shadedLandIndex(risePerSubcellM: number, sunX: number, sunY: number): number {
  const buffer = createSampleBuffer(9, 5);
  const grid = new Grid(9, 5);
  const high = Math.min(100 + risePerSubcellM, 6761);

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const i = y * buffer.width + x;
      buffer.bodyMask[i] = 255;
      buffer.coverage[i] = 255;
      buffer.elevation[i] = x < 9 ? 100 : high;
    }
  }

  reduce(buffer, grid, body, {
    relief: { bands: 'auto', emboss: true, sunX, sunY, reliefScaleM: risePerSubcellM },
  });

  return grid.get(4, 2).fg;
}

describe('relief shading stays inside the land ramp', () => {
  it('a slope facing away from the sun never takes a water colour', () => {
    // Every light direction, so no rotation of the globe can find a hole.
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const index = shadedLandIndex(400, Math.cos(angle), Math.sin(angle));
      expect(WATER_INDICES.has(index), `sun at ${((angle * 180) / Math.PI).toFixed(0)}deg`).toBe(
        false,
      );
    }
  });

  it('holds for the steep gradients a zoomed-out view produces', () => {
    for (const rise of [50, 200, 800, 2000, 5000]) {
      const index = shadedLandIndex(rise, -0.707, -0.707);
      expect(WATER_INDICES.has(index), `${rise} m per subcell`).toBe(false);
    }
  });

  it('still shades — the fix must not just turn the effect off', () => {
    const lit = shadedLandIndex(400, 1, 0);
    const shadow = shadedLandIndex(400, -1, 0);
    expect(lit).not.toBe(shadow);
  });

  it('a cell of open water keeps its own colour', () => {
    const buffer = createSampleBuffer(9, 5);
    const grid = new Grid(9, 5);
    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        const i = y * buffer.width + x;
        buffer.bodyMask[i] = 255;
        buffer.elevation[i] = -3000 + x * 200;
      }
    }
    reduce(buffer, grid, body, {
      relief: { bands: 'auto', emboss: true, sunX: -0.707, sunY: -0.707, reliefScaleM: 200 },
    });
    expect(WATER_INDICES.has(grid.get(4, 2).fg)).toBe(true);
  });
});

describe('SUB_X and SUB_Y are the braille cell', () => {
  it('is 2x4, which the elevation ramp above depends on', () => {
    expect([SUB_X, SUB_Y]).toEqual([2, 4]);
  });
});
