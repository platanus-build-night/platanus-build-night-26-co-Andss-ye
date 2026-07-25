import { BYTES_PER_CELL, CELL_OFFSET, cellIndex, decodeGlyph, encodeGlyph } from './layout.js';
import { brailleChar } from '../raster/registers/braille.js';
import { quadrantChar } from '../raster/registers/quadrant.js';
import { PAL } from '../palette/palette.js';

export interface CellData {
  readonly glyph: number;
  readonly fg: number;
  readonly bg: number;
}

/**
 * The character grid. Everything the library draws — coastlines, relief, roads, labels, HUD —
 * ends up here, as 4 bytes per cell: [glyphLo, glyphHi, paletteFg, paletteBg]. No DOM, no
 * canvas: a renderer reads this buffer and presents it.
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Uint8Array(cols * rows * BYTES_PER_CELL);
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  /** Writing out of bounds is a silent no-op: layers draw past the viewport constantly. */
  set(x: number, y: number, glyph: number, fg: number, bg: number = PAL.VOID): void {
    if (!this.inBounds(x, y)) return;
    const i = cellIndex(this.cols, [x, y]);
    const [lo, hi] = encodeGlyph(glyph);
    this.cells[i + CELL_OFFSET.GLYPH_LO] = lo;
    this.cells[i + CELL_OFFSET.GLYPH_HI] = hi;
    this.cells[i + CELL_OFFSET.FG] = fg;
    this.cells[i + CELL_OFFSET.BG] = bg;
  }

  get(x: number, y: number): CellData {
    if (!this.inBounds(x, y)) return { glyph: 0, fg: PAL.VOID, bg: PAL.VOID };
    const i = cellIndex(this.cols, [x, y]);
    return {
      glyph: decodeGlyph(this.cells[i + CELL_OFFSET.GLYPH_LO]!, this.cells[i + CELL_OFFSET.GLYPH_HI]!),
      fg: this.cells[i + CELL_OFFSET.FG]!,
      bg: this.cells[i + CELL_OFFSET.BG]!,
    };
  }

  /** Writes `str` left to right starting at (x, y). Returns how many cells were written. */
  text(x: number, y: number, str: string, fg: number, bg: number = PAL.VOID): number {
    let written = 0;
    let cx = x;
    for (const ch of str) {
      this.set(cx, y, ch.codePointAt(0)!, fg, bg);
      if (this.inBounds(cx, y)) written++;
      cx++;
    }
    return written;
  }

  /** Bresenham, repeating `glyph` along the path. */
  line(x0: number, y0: number, x1: number, y1: number, glyph: number, fg: number): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    for (;;) {
      this.set(x, y, glyph, fg);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  glyph(char: string): number {
    return char.codePointAt(0)!;
  }

  braille(subMask: number): number {
    return brailleChar(subMask);
  }

  quadrant(quadMask: number): number {
    return quadrantChar(quadMask);
  }
}
