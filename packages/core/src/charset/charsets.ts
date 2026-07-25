import { QUADRANT } from '../raster/registers/quadrant.js';

/**
 * The three glyph registers, per docs/RENDERING.md. Braille draws lines, quadrants draw area
 * borders, ASCII (+ a few semantic symbols) fills and labels. Roles are fixed; nothing here
 * decides *when* a register is used — that's reduce.ts, in a later phase.
 */
export type CharsetRole = 'braille' | 'quadrant' | 'ascii';

export const BRAILLE_CHARSET: readonly number[] = Array.from({ length: 256 }, (_, i) => 0x2800 + i);

export const QUADRANT_CHARSET: readonly number[] = QUADRANT.map((ch) => ch.codePointAt(0)!);

const TERRAIN_EXTRA_SYMBOLS = ['▲']; // pico nevado, per RENDERING.md TERRAIN table

export const ASCII_CHARSET: readonly number[] = [
  ...Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i), // printable ASCII, space..~
  ...TERRAIN_EXTRA_SYMBOLS.map((ch) => ch.codePointAt(0)!),
];

export const CHARSETS: Readonly<Record<CharsetRole, readonly number[]>> = {
  braille: BRAILLE_CHARSET,
  quadrant: QUADRANT_CHARSET,
  ascii: ASCII_CHARSET,
};

/** Code points that are supposed to render with (near) zero ink: real blanks, not missing glyphs. */
export const BLANK_CODEPOINTS: ReadonlySet<number> = new Set([0x20, 0x2800]);

export function fullCharset(): readonly number[] {
  return [...BRAILLE_CHARSET, ...QUADRANT_CHARSET, ...ASCII_CHARSET];
}
