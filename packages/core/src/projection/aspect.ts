/**
 * Cell aspect ratio (width / height). **This lives here and only here** — replicating it is
 * the single most common bug in this project (CLAUDE.md). Without it the planet comes out oval
 * and braille subcells stop being square.
 *
 * With aspect 0.5 a cell is w wide and 2w tall, so a braille subcell is w/2 x 2w/4 = w/2 x w/2:
 * exactly square, which is why a braille diagonal has the same slope on screen as in geographic
 * space (docs/RENDERING.md).
 *
 * 0.5 is the default *until the atlas measures the real font* (docs/AESTHETIC.md) — never assume it.
 */
export const CELL_ASPECT = 0.5;

export interface ViewMetrics {
  readonly cols: number;
  readonly rows: number;
  /** Measured from the glyph atlas at runtime. Falls back to CELL_ASPECT. */
  readonly cellAspect: number;
}

export function createViewMetrics(cols: number, rows: number, cellAspect = CELL_ASPECT): ViewMetrics {
  return { cols, rows, cellAspect };
}

/**
 * Disc radius in **row units**. Columns are narrower than rows, so they are converted by the
 * aspect before taking the smaller dimension; 0.92 leaves a margin so the limb isn't flush
 * against the viewport edge.
 */
export function discRadiusRows(view: ViewMetrics): number {
  return (Math.min(view.cols * view.cellAspect, view.rows) / 2) * 0.92;
}
