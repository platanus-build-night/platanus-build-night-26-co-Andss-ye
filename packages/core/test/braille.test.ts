import { describe, expect, it } from 'vitest';
import { BRAILLE_BIT, brailleChar, setSub } from '../src/raster/registers/braille.js';

describe('braille register', () => {
  it('empty mask maps to U+2800 (blank braille)', () => {
    expect(brailleChar(0)).toBe(0x2800);
  });

  it('full mask maps to U+28FF (all eight dots)', () => {
    expect(brailleChar(0xff)).toBe(0x28ff);
  });

  // Ground truth: Unicode Braille Patterns block, dots numbered 1-8 as in
  // docs/RENDERING.md. Single-dot code points are documented directly in the
  // Unicode standard (U+2801 = dot 1 ... U+2840 = dot 7 ... U+2880 = dot 8).
  const singleDotCodepoints: Record<number, [col: 0 | 1, row: 0 | 1 | 2 | 3]> = {
    0x2801: [0, 0], // dot 1
    0x2802: [0, 1], // dot 2
    0x2804: [0, 2], // dot 3
    0x2808: [1, 0], // dot 4
    0x2810: [1, 1], // dot 5
    0x2820: [1, 2], // dot 6
    0x2840: [0, 3], // dot 7
    0x2880: [1, 3], // dot 8
  };

  it.each(Object.entries(singleDotCodepoints))(
    'dot at %s round-trips through setSub/brailleChar',
    (codepoint, [col, row]) => {
      const mask = setSub(0, col, row);
      expect(brailleChar(mask)).toBe(Number(codepoint));
    },
  );

  it('combining all eight single-dot masks yields the full mask', () => {
    let mask = 0;
    for (const [col, row] of Object.values(singleDotCodepoints)) {
      mask = setSub(mask, col, row);
    }
    expect(mask).toBe(0xff);
  });

  it('BRAILLE_BIT has no overlapping bits across the 2x4 grid', () => {
    const seen = new Set<number>();
    for (const col of [0, 1] as const) {
      for (const row of [0, 1, 2, 3] as const) {
        const bit = BRAILLE_BIT[col][row];
        expect(seen.has(bit)).toBe(false);
        seen.add(bit);
      }
    }
    expect(seen.size).toBe(8);
  });
});
