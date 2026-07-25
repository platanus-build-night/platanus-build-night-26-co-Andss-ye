/**
 * Quadrant block glyphs, per docs/RENDERING.md. Bits: TL=1, TR=2, BL=4, BR=8.
 */
export const QUADRANT = [
  ' ', '▘', '▝', '▀',
  '▖', '▌', '▞', '▛',
  '▗', '▚', '▐', '▜',
  '▄', '▙', '▟', '█',
] as const;

export const QUADRANT_BIT = {
  TL: 0x1,
  TR: 0x2,
  BL: 0x4,
  BR: 0x8,
} as const;

/** quadMask: 4 bits, TL|TR|BL|BR. */
export function quadrantChar(quadMask: number): number {
  const glyph = QUADRANT[quadMask & 0xf]!; // masked to 0-15, always in range
  return glyph.codePointAt(0)!;
}
