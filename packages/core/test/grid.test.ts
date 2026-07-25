import { describe, expect, it } from 'vitest';
import { Grid } from '../src/grid/grid.js';
import { PAL } from '../src/palette/palette.js';

describe('Grid', () => {
  it('allocates cols * rows * 4 bytes, all zero', () => {
    const grid = new Grid(10, 5);
    expect(grid.cells.length).toBe(10 * 5 * 4);
    expect(grid.cells.every((b) => b === 0)).toBe(true);
  });

  it('set/get round-trips glyph, fg and bg', () => {
    const grid = new Grid(4, 4);
    grid.set(1, 2, grid.glyph('A'), PAL.SIGNAL, PAL.NIGHT);
    const cell = grid.get(1, 2);
    expect(cell.glyph).toBe('A'.codePointAt(0));
    expect(cell.fg).toBe(PAL.SIGNAL);
    expect(cell.bg).toBe(PAL.NIGHT);
  });

  it('defaults bg to VOID when omitted', () => {
    const grid = new Grid(2, 2);
    grid.set(0, 0, grid.glyph('x'), PAL.CHROME);
    expect(grid.get(0, 0).bg).toBe(PAL.VOID);
  });

  it('writing out of bounds is a silent no-op', () => {
    const grid = new Grid(3, 3);
    expect(() => grid.set(-1, 0, grid.glyph('x'), PAL.SIGNAL)).not.toThrow();
    expect(() => grid.set(3, 3, grid.glyph('x'), PAL.SIGNAL)).not.toThrow();
    expect(grid.cells.every((b) => b === 0)).toBe(true);
  });

  it('reading out of bounds returns an empty cell instead of throwing', () => {
    const grid = new Grid(2, 2);
    expect(grid.get(5, 5)).toEqual({ glyph: 0, fg: PAL.VOID, bg: PAL.VOID });
  });

  it('text writes left to right and returns cells written', () => {
    const grid = new Grid(20, 1);
    const written = grid.text(0, 0, 'GLYPHSPHERE', PAL.CHROME);
    expect(written).toBe('GLYPHSPHERE'.length);
    for (let i = 0; i < 'GLYPHSPHERE'.length; i++) {
      expect(grid.get(i, 0).glyph).toBe('GLYPHSPHERE'.codePointAt(i));
    }
  });

  it('text clips silently when it runs past the grid width', () => {
    const grid = new Grid(5, 1);
    const written = grid.text(3, 0, 'HELLO', PAL.CHROME);
    expect(written).toBe(2); // only columns 3 and 4 are in bounds
  });

  it('line draws a straight horizontal run', () => {
    const grid = new Grid(5, 1);
    grid.line(0, 0, 4, 0, grid.glyph('-'), PAL.CHROME);
    for (let x = 0; x < 5; x++) {
      expect(grid.get(x, 0).glyph).toBe('-'.codePointAt(0));
    }
  });

  it('line draws a diagonal without gaps', () => {
    const grid = new Grid(4, 4);
    grid.line(0, 0, 3, 3, grid.glyph('*'), PAL.CHROME);
    for (let i = 0; i < 4; i++) {
      expect(grid.get(i, i).glyph).toBe('*'.codePointAt(0));
    }
  });

  it('braille() and quadrant() defer to the register tables', () => {
    const grid = new Grid(1, 1);
    expect(grid.braille(0xff)).toBe(0x28ff);
    expect(grid.quadrant(0xf)).toBe('█'.codePointAt(0));
  });
});
