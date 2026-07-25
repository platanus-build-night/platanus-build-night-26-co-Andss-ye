import { describe, expect, it } from 'vitest';
import { Grid } from '../src/grid/grid.js';
import { PAL } from '../src/palette/palette.js';
import { REGISTER, reduce } from '../src/raster/reduce.js';
import { LINE_CLASS, SUB_X, SUB_Y, createSampleBuffer } from '../src/raster/sample-buffer.js';
import { BRAILLE_BIT } from '../src/raster/registers/braille.js';
import { testBody } from './fixtures.js';

const BANDS = [
  { maxM: -4000, glyph: ' ', paletteIndex: PAL.ABYSS },
  { maxM: -200, glyph: '·', paletteIndex: PAL.PELAGIC },
  { maxM: 0, glyph: '~', paletteIndex: PAL.SHELF },
  { maxM: 300, glyph: ',', paletteIndex: PAL.PLAIN },
  { maxM: 9000, glyph: '^', paletteIndex: PAL.HIGHLAND },
];

const body = testBody({ bands: BANDS });

function setup(cols = 4, rows = 4) {
  const buffer = createSampleBuffer(cols, rows);
  const grid = new Grid(cols, rows);
  return { buffer, grid };
}

/** Marks every subcell of one cell as being on the body. */
function putOnBody(buffer: ReturnType<typeof createSampleBuffer>, cx: number, cy: number): void {
  for (let row = 0; row < SUB_Y; row++) {
    for (let col = 0; col < SUB_X; col++) {
      buffer.bodyMask[(cy * SUB_Y + row) * buffer.width + cx * SUB_X + col] = 255;
    }
  }
}

function subIndex(buffer: ReturnType<typeof createSampleBuffer>, cx: number, cy: number, col: number, row: number) {
  return (cy * SUB_Y + row) * buffer.width + cx * SUB_X + col;
}

describe('reduce: off-body cells', () => {
  it('leaves space empty rather than drawing anything', () => {
    const { buffer, grid } = setup();
    const { registers } = reduce(buffer, grid, body);

    expect(grid.get(1, 1).glyph).toBe(0);
    expect(registers.every((r) => r === REGISTER.NONE)).toBe(true);
  });
});

describe('reduce: register 1, linework -> braille', () => {
  it('a line anywhere in the cell wins over everything else', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 1, 1);
    // Fully covered land, so the coverage path would otherwise claim this cell.
    for (let row = 0; row < SUB_Y; row++) {
      for (let col = 0; col < SUB_X; col++) buffer.coverage[subIndex(buffer, 1, 1, col, row)] = 255;
    }
    buffer.lineMask[subIndex(buffer, 1, 1, 0, 0)] = 255;
    buffer.lineClass[subIndex(buffer, 1, 1, 0, 0)] = LINE_CLASS.COAST;

    const { registers } = reduce(buffer, grid, body);
    expect(registers[1 * grid.cols + 1]).toBe(REGISTER.BRAILLE);
  });

  it('encodes exactly which subcells the line touched', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 0, 0);
    // Dot 1 (col 0, row 0) and dot 8 (col 1, row 3) — the two ends of the bit table.
    buffer.lineMask[subIndex(buffer, 0, 0, 0, 0)] = 255;
    buffer.lineMask[subIndex(buffer, 0, 0, 1, 3)] = 255;
    buffer.lineClass[subIndex(buffer, 0, 0, 0, 0)] = LINE_CLASS.COAST;

    reduce(buffer, grid, body);
    const expected = 0x2800 | BRAILLE_BIT[0][0] | BRAILLE_BIT[1][3];
    expect(grid.get(0, 0).glyph).toBe(expected);
  });

  it('colours the line by its class', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 0, 0);
    buffer.lineMask[subIndex(buffer, 0, 0, 0, 0)] = 255;
    buffer.lineClass[subIndex(buffer, 0, 0, 0, 0)] = LINE_CLASS.RIVER;

    reduce(buffer, grid, body);
    expect(grid.get(0, 0).fg).toBe(PAL.SHELF);
  });

  it('a full braille cell is U+28FF', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 0, 0);
    for (let row = 0; row < SUB_Y; row++) {
      for (let col = 0; col < SUB_X; col++) {
        buffer.lineMask[subIndex(buffer, 0, 0, col, row)] = 255;
        buffer.lineClass[subIndex(buffer, 0, 0, col, row)] = LINE_CLASS.COAST;
      }
    }
    reduce(buffer, grid, body);
    expect(grid.get(0, 0).glyph).toBe(0x28ff);
  });
});

describe('reduce: register 2, area border', () => {
  it('a partially covered cell is not filled semantically', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 2, 2);
    // Cover the left column only: 4 of 8 subcells.
    for (let row = 0; row < SUB_Y; row++) buffer.coverage[subIndex(buffer, 2, 2, 0, row)] = 255;

    const { registers } = reduce(buffer, grid, body);
    const register = registers[2 * grid.cols + 2]!;
    expect([REGISTER.QUADRANT, REGISTER.DIRECTIONAL]).toContain(register);
  });

  it('falls to quadrants when the gradient is too ragged to trace', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 2, 2);
    for (let row = 0; row < SUB_Y; row++) buffer.coverage[subIndex(buffer, 2, 2, 0, row)] = 255;

    // An unreachable threshold forces the quadrant branch.
    const { registers } = reduce(buffer, grid, body, { edgeThreshold: 2 });
    expect(registers[2 * grid.cols + 2]).toBe(REGISTER.QUADRANT);
    expect(grid.get(2, 2).glyph).toBe('▌'.codePointAt(0)); // left half covered
  });

  it('traces the edge with a directional glyph when the gradient is clean', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 2, 2);
    for (let row = 0; row < SUB_Y; row++) buffer.coverage[subIndex(buffer, 2, 2, 0, row)] = 255;

    const { registers } = reduce(buffer, grid, body, { edgeThreshold: 0 });
    expect(registers[2 * grid.cols + 2]).toBe(REGISTER.DIRECTIONAL);
  });
});

describe('reduce: register 3, semantic fill', () => {
  it('an uncovered on-body cell reads its band from the elevation channel', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 1, 1);
    // Metres, straight in: the channel is signed elevation, not a normalized byte.
    for (let row = 0; row < SUB_Y; row++) {
      for (let col = 0; col < SUB_X; col++) buffer.elevation[subIndex(buffer, 1, 1, col, row)] = -3800;
    }

    const { registers } = reduce(buffer, grid, body);
    expect(registers[1 * grid.cols + 1]).toBe(REGISTER.SEMANTIC);
    expect(grid.get(1, 1).glyph).toBe('·'.codePointAt(0));
    expect(grid.get(1, 1).fg).toBe(PAL.PELAGIC);
  });

  it('fully covered land reads as land, not as a border', () => {
    const { buffer, grid } = setup();
    putOnBody(buffer, 1, 1);
    for (let row = 0; row < SUB_Y; row++) {
      for (let col = 0; col < SUB_X; col++) {
        buffer.coverage[subIndex(buffer, 1, 1, col, row)] = 255;
        buffer.elevation[subIndex(buffer, 1, 1, col, row)] = 200;
      }
    }

    const { registers } = reduce(buffer, grid, body);
    expect(registers[1 * grid.cols + 1]).toBe(REGISTER.SEMANTIC);
    expect(grid.get(1, 1).glyph).toBe(','.codePointAt(0));
  });
});

describe('reduce: buffer reuse', () => {
  it('reuses the caller-provided registers array and clears stale values', () => {
    const { buffer, grid } = setup();
    const out = { registers: new Uint8Array(grid.cols * grid.rows).fill(REGISTER.BRAILLE) };

    const result = reduce(buffer, grid, body, {}, out);
    expect(result.registers).toBe(out.registers);
    expect(out.registers.every((r) => r === REGISTER.NONE)).toBe(true);
  });
});
