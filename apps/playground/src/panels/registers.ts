import { Grid, PAL, REGISTER } from '@glyphsphere/core';

/**
 * Colours every cell by the register that produced it, per docs/AESTHETIC.md. This is the tool
 * for checking the register proportions after touching a threshold in reduce.ts.
 *
 * A healthy frame is mostly semantic ASCII, with a clear minority of braille marking structure
 * and quadrants only where there is mass. **If braille dominates the screen, something is
 * wrong** with the thresholds.
 */
const REGISTER_COLOR: Readonly<Record<number, number>> = {
  [REGISTER.BRAILLE]: PAL.SIGNAL, // cyan: fine linework
  [REGISTER.QUADRANT]: PAL.ALERT, // amber: mass
  [REGISTER.DIRECTIONAL]: PAL.SNOW, // white: traced edge
  [REGISTER.SEMANTIC]: PAL.SIGNAL_DIM, // dim: the bulk of the frame
};

export function applyRegisterOverlay(grid: Grid, registers: Uint8Array): void {
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const register = registers[y * grid.cols + x]!;
      if (register === REGISTER.NONE) continue;

      const cell = grid.get(x, y);
      grid.set(x, y, cell.glyph, REGISTER_COLOR[register] ?? PAL.CHROME, cell.bg);
    }
  }
}

/** Counts per register, for the readout. */
export function registerCounts(registers: Uint8Array): Record<string, number> {
  let braille = 0;
  let quadrant = 0;
  let directional = 0;
  let semantic = 0;

  for (const register of registers) {
    if (register === REGISTER.BRAILLE) braille++;
    else if (register === REGISTER.QUADRANT) quadrant++;
    else if (register === REGISTER.DIRECTIONAL) directional++;
    else if (register === REGISTER.SEMANTIC) semantic++;
  }

  return { braille, quadrant, directional, semantic, total: braille + quadrant + directional + semantic };
}
