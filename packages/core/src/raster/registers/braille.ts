/**
 * Braille dot bits, per docs/RENDERING.md. Dot numbering (1..8) is not reading order and
 * dots 7/8 break the column pattern of 1..6 — do not re-derive this table, it has been
 * verified against Unicode block U+2800-U+28FF.
 *
 *   Layout de puntos          Bit en el código
 *      1  4                      0   3
 *      2  5                      1   4
 *      3  6                      2   5
 *      7  8                      6   7
 */
export const BRAILLE_BASE = 0x2800;

/** [columna][fila] -> bit. Columna en {0,1}, fila en {0,1,2,3}. */
export const BRAILLE_BIT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
] as const;

export type BrailleCol = 0 | 1;
export type BrailleRow = 0 | 1 | 2 | 3;

/** subMask: 8 bits, one per subcell, encoded with BRAILLE_BIT. */
export function brailleChar(subMask: number): number {
  return BRAILLE_BASE | (subMask & 0xff);
}

export function setSub(mask: number, col: BrailleCol, row: BrailleRow): number {
  return mask | BRAILLE_BIT[col][row];
}
