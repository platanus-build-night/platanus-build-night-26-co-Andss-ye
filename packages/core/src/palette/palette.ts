/**
 * Sixteen indexed colors, per docs/AESTHETIC.md. The index is the contract: hex values can be
 * re-themed, indices 1-9 must stay ordered by elevation (relief shading is `palette += shift`).
 */
export type Palette = readonly [
  string, string, string, string, string, string, string, string,
  string, string, string, string, string, string, string, string,
];

export const PALETTE: Palette = [
  '#05070A', // 0  VOID
  '#0A1A2E', // 1  ABYSS
  '#123A5C', // 2  PELAGIC
  '#1E6B8C', // 3  SHELF
  '#2E6B5A', // 4  LITTORAL
  '#4A7B4E', // 5  PLAIN
  '#8A7B45', // 6  STEPPE
  '#A6673A', // 7  HIGHLAND
  '#C4B5A0', // 8  ALPINE
  '#EFF4F7', // 9  SNOW
  '#0E1A26', // 10 NIGHT
  '#2A3B4A', // 11 NIGHTLIT
  '#00E5D0', // 12 SIGNAL
  '#0A7A70', // 13 SIGNAL_DIM
  '#FF7A3D', // 14 ALERT
  '#6E8290', // 15 CHROME
];

export const PAL = {
  VOID: 0,
  ABYSS: 1,
  PELAGIC: 2,
  SHELF: 3,
  LITTORAL: 4,
  PLAIN: 5,
  STEPPE: 6,
  HIGHLAND: 7,
  ALPINE: 8,
  SNOW: 9,
  NIGHT: 10,
  NIGHTLIT: 11,
  SIGNAL: 12,
  SIGNAL_DIM: 13,
  ALERT: 14,
  CHROME: 15,
} as const;

/** Safe lookup for a palette index coming off the grid (a plain `number`, not a literal). */
export function paletteColor(palette: Palette, index: number): string {
  return palette[index] ?? palette[PAL.VOID];
}
