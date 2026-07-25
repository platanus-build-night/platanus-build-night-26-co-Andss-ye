import type { Grid } from '../grid/grid.js';
import { PAL } from '../palette/palette.js';
import { REGISTER, type Register } from './reduce.js';

/**
 * Coastal shadow, per docs/RELIEF.md §4 — the technique that literally answers the requirement
 * that land must read *above* water.
 *
 * A band of darker water is laid along the seaward side of the shore. It is the same device a
 * printed map uses to make an island look cut out and pasted on top of the sea. Twenty lines,
 * and it changes how the whole image reads.
 */

/** Width scales with zoom: 1 cell from orbit, 2 regionally, 0 in the city where it means nothing. */
export function coastalShadowWidth(altitudeKm: number): number {
  if (altitudeKm > 6000) return 1;
  if (altitudeKm > 150) return 2;
  return 0;
}

export interface CoastalShadowOptions {
  readonly widthCells: number;
  /** Light direction in screen space; the shadow falls away from the sun. */
  readonly sunX: number;
  readonly sunY: number;
}

/**
 * Darkens water cells next to the shore. Reads the register map to find the coast rather than
 * re-deriving it: whatever `reduce` decided was linework is the shore.
 */
export function applyCoastalShadow(
  grid: Grid,
  registers: Uint8Array,
  isWater: (x: number, y: number) => boolean,
  options: CoastalShadowOptions,
): void {
  const { widthCells, sunX, sunY } = options;
  if (widthCells <= 0) return;

  // The shadow is cast away from the light, which couples it to the gradient shading and makes
  // the whole scene feel lit from one source.
  const stepX = Math.round(-sunX) || 1;
  const stepY = Math.round(-sunY) || 1;

  const shoreCells: number[] = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const register = registers[y * grid.cols + x] as Register;
      if (register === REGISTER.BRAILLE || register === REGISTER.DIRECTIONAL) {
        shoreCells.push(x, y);
      }
    }
  }

  for (let i = 0; i < shoreCells.length; i += 2) {
    const x = shoreCells[i]!;
    const y = shoreCells[i + 1]!;

    for (let step = 1; step <= widthCells; step++) {
      const sx = x + stepX * step;
      const sy = y + stepY * step;
      if (!isWater(sx, sy)) break; // the shadow only lies on open water

      const cell = grid.get(sx, sy);
      grid.set(sx, sy, cell.glyph, PAL.ABYSS, cell.bg);
    }
  }
}
