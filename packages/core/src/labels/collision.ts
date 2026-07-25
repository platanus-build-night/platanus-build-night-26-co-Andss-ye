/**
 * Anti-collision for labels, per docs/ARCHITECTURE.md.
 *
 * A uniform grid of occupancy bits rather than a quadtree: labels are small, roughly uniform
 * in size, and there are hundreds rather than millions of them. A bitmap the size of the
 * character grid answers "is this span free?" in a few reads and costs one allocation for the
 * whole frame.
 */
export interface LabelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export class CollisionGrid {
  private readonly occupied: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.occupied = new Uint8Array(cols * rows);
  }

  clear(): void {
    this.occupied.fill(0);
  }

  /** True when every cell of the box is free and inside the grid. */
  fits(box: LabelBox): boolean {
    if (box.x < 0 || box.y < 0) return false;
    if (box.x + box.width > this.cols || box.y + box.height > this.rows) return false;

    for (let y = box.y; y < box.y + box.height; y++) {
      const row = y * this.cols;
      for (let x = box.x; x < box.x + box.width; x++) {
        if (this.occupied[row + x] !== 0) return false;
      }
    }
    return true;
  }

  occupy(box: LabelBox): void {
    const x0 = Math.max(0, box.x);
    const y0 = Math.max(0, box.y);
    const x1 = Math.min(this.cols, box.x + box.width);
    const y1 = Math.min(this.rows, box.y + box.height);

    for (let y = y0; y < y1; y++) {
      const row = y * this.cols;
      for (let x = x0; x < x1; x++) this.occupied[row + x] = 1;
    }
  }
}

/**
 * Where a label may sit relative to its marker, in preference order. Right of the marker first
 * because that is what reads most naturally in a left-to-right script; the rest are fallbacks
 * so a crowded area degrades by moving labels rather than by dropping them.
 */
export const LABEL_ANCHORS: readonly (readonly [dx: number, dy: number])[] = [
  [2, 0],
  [-2, 0],
  [2, -1],
  [-2, -1],
  [2, 1],
  [-2, 1],
  [0, -1],
  [0, 1],
];

export interface PlacedLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Index into the candidate array, so callers can recover their own data for it. */
  readonly index: number;
}

export interface LabelCandidate {
  readonly cellX: number;
  readonly cellY: number;
  readonly text: string;
  /**
   * Width in cells, when the text is not drawn in the character grid.
   *
   * A name set in a proportional typeface over the grid occupies a width the string length
   * cannot predict, so the caller measures it and reports it here. Defaults to `text.length`,
   * which is exact for anything drawn as characters.
   */
  readonly widthCells?: number;
}

/**
 * Places labels in the order given — callers pass them most-important-first, so when space runs
 * out it is the least important name that goes.
 */
export function placeLabels(
  grid: CollisionGrid,
  candidates: readonly LabelCandidate[],
  padding = 1,
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const width = Math.max(1, Math.ceil(candidate.widthCells ?? candidate.text.length));

    for (const [dx, dy] of LABEL_ANCHORS) {
      // Left-side anchors put the text's right edge at the marker.
      const x = dx < 0 ? candidate.cellX + dx - width + 1 : candidate.cellX + dx;
      const y = candidate.cellY + dy;

      const box: LabelBox = {
        x: x - padding,
        y,
        width: width + padding * 2,
        height: 1,
      };

      if (!grid.fits(box)) continue;

      grid.occupy(box);
      placed.push({ x, y, text: candidate.text, index });
      break;
    }
  }

  return placed;
}
