import { describe, expect, it } from 'vitest';
import { Grid } from '../src/grid/grid.js';
import { PAL } from '../src/palette/palette.js';
import { reduce } from '../src/raster/reduce.js';
import { SUB_X, SUB_Y, createSampleBuffer } from '../src/raster/sample-buffer.js';
import { extractContours } from '../src/raster/contour.js';
import { testBody } from './fixtures.js';

/**
 * Sea level is the one boundary the eye checks first, and it is the one the elevation channel
 * used to quantize away.
 *
 * The channel carried a byte normalized over the body's whole range. On Earth that is 17 274 m
 * across 256 levels — **67.7 m per step** — and sea level fell inside a step reconstructing to
 * -13.1 m. Every real elevation from 0 to 55 m therefore came back negative and drew the `~`
 * water band: Miami at 2 m, New York at 10 m, Shanghai at 4 m, Dhaka at 4 m, and the whole of
 * the Netherlands, Bangladesh and the Florida peninsula.
 *
 * The elevations here are real, in metres, and each one must come back on the correct side of
 * the shoreline.
 */

const BANDS = [
  { maxM: -4000, glyph: ' ', paletteIndex: PAL.ABYSS },
  { maxM: -200, glyph: '·', paletteIndex: PAL.PELAGIC },
  { maxM: 0, glyph: '~', paletteIndex: PAL.SHELF },
  { maxM: 50, glyph: '.', paletteIndex: PAL.LITTORAL },
  { maxM: 300, glyph: ',', paletteIndex: PAL.PLAIN },
  { maxM: 9000, glyph: '^', paletteIndex: PAL.HIGHLAND },
];

/** Earth's real range: the span is what makes a byte too coarse. */
const body = testBody({ bands: BANDS, elevationRangeM: [-10513, 6761] });

function cellOfElevation(elevationM: number) {
  const buffer = createSampleBuffer(3, 3);
  const grid = new Grid(3, 3);

  for (let row = 0; row < SUB_Y; row++) {
    for (let col = 0; col < SUB_X; col++) {
      const i = (SUB_Y + row) * buffer.width + SUB_X + col;
      buffer.bodyMask[i] = 255;
      buffer.coverage[i] = 255;
      buffer.elevation[i] = elevationM;
    }
  }

  reduce(buffer, grid, body, { relief: { bands: 'auto', emboss: false, sunX: 0, sunY: 0 } });
  return grid.get(1, 1);
}

const WATER_GLYPHS = new Set([' ', '·', '~'].map((g) => g.codePointAt(0)));

describe('sea level survives the elevation channel', () => {
  const COASTAL_CITIES = [
    ['Miami', 2],
    ['New Orleans', 1],
    ['Shanghai', 4],
    ['Dhaka', 4],
    ['New York', 10],
    ['Mumbai', 14],
    ['Lagos', 11],
    ['Copenhagen', 10],
  ] as const;

  for (const [name, elevationM] of COASTAL_CITIES) {
    it(`${name} at ${elevationM} m reads as land`, () => {
      const cell = cellOfElevation(elevationM);
      expect(WATER_GLYPHS.has(cell.glyph)).toBe(false);
    });
  }

  it('water is still water — the fix must not push the sea onto land', () => {
    for (const depthM of [-1, -50, -200, -3800]) {
      expect(WATER_GLYPHS.has(cellOfElevation(depthM).glyph)).toBe(true);
    }
  });

  it('resolves a metre, so a 20 m contour interval is representable', () => {
    // The doc's finest interval is 20 m. A channel that cannot tell 10 m from 30 m cannot
    // draw it, whatever the interval is set to.
    expect(cellOfElevation(10).glyph).toBe('.'.codePointAt(0));
    expect(cellOfElevation(30).glyph).toBe('.'.codePointAt(0));
    expect(cellOfElevation(120).glyph).toBe(','.codePointAt(0));
  });
});

describe('contours at the shoreline', () => {
  it('draws a 20 m contour across a gentle coastal slope', () => {
    const buffer = createSampleBuffer(8, 4);

    // A ramp from sea level to 100 m across the buffer: with 67.7 m quantization this whole
    // slope collapsed into one or two steps and no fine contour could exist.
    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        const i = y * buffer.width + x;
        buffer.bodyMask[i] = 255;
        buffer.elevation[i] = Math.round((x / (buffer.width - 1)) * 100);
      }
    }

    extractContours(buffer, { intervalM: 20 });

    const lines = buffer.lineMask.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
    expect(lines).toBeGreaterThan(0);
  });
});
