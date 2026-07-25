/**
 * Byte layout per cell, per docs/RENDERING.md: [glyphLo, glyphHi, paletteFg, paletteBg].
 * The glyph is stored as its Unicode code point (fits 16 bits: braille, quadrants, box
 * drawing and ASCII are all well under U+FFFF), so Grid needs no separate charset-index
 * table to round-trip a glyph.
 */
export const BYTES_PER_CELL = 4;

export const CELL_OFFSET = {
  GLYPH_LO: 0,
  GLYPH_HI: 1,
  FG: 2,
  BG: 3,
} as const;

export function cellIndex(cols: number, cellXY: readonly [number, number]): number {
  const [x, y] = cellXY;
  return (y * cols + x) * BYTES_PER_CELL;
}

export function encodeGlyph(codepoint: number): readonly [lo: number, hi: number] {
  return [codepoint & 0xff, (codepoint >>> 8) & 0xff];
}

export function decodeGlyph(lo: number, hi: number): number {
  return lo | (hi << 8);
}
