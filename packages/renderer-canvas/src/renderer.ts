import {
  BLANK_CODEPOINTS,
  buildAtlas,
  Grid,
  NO_CHROME,
  PAL,
  PALETTE,
  paletteColor,
  type ChromeCommands,
  type GlyphAtlas,
} from '@glyphsphere/core';
import { createCanvasGlyphSampler } from './glyph-sampler.js';

export interface CellMetrics {
  readonly width: number;
  readonly height: number;
}

/** Per docs/AESTHETIC.md: embedded subset first, DejaVu for Linux braille coverage, then any mono. */
const DEFAULT_FONT_STACK = "'Iosevka Web', 'DejaVu Sans Mono', 'Cascadia Mono', monospace";

/** Per docs/AESTHETIC.md: assumed until the atlas measures the font's real aspect. */
const DEFAULT_CELL_ASPECT = 0.5;

export interface CanvasRendererOptions {
  readonly font?: string;
  /** CSS px. Default 14, per docs/API.md GlyphsphereOptions.cellPx. */
  readonly cellHeightPx?: number;
}

/**
 * Canvas2D backend. Draws the grid with a monospace font — no atlas texture yet (that's the
 * tinted-atlas optimization docs/RENDERING.md describes for this backend); `present()` just
 * has to work in phase 0, not hit the WebGL performance budget.
 */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly font: string;
  private cellPx: CellMetrics;
  readonly atlas: GlyphAtlas;

  constructor(private readonly canvas: HTMLCanvasElement, options: CanvasRendererOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CanvasRenderer requires a 2D context');
    this.ctx = ctx;
    this.font = options.font ?? DEFAULT_FONT_STACK;

    const cellHeightPx = options.cellHeightPx ?? 14;
    this.cellPx = { width: cellHeightPx * DEFAULT_CELL_ASPECT, height: cellHeightPx };

    // One atlas per (charset, font, size, dpr), per docs/RENDERING.md. Built once here; a
    // future LayerStack/resize hook can rebuild it if font or size change.
    const sampler = createCanvasGlyphSampler(
      this.font,
      Math.ceil(this.cellPx.width),
      Math.ceil(this.cellPx.height),
    );
    this.atlas = buildAtlas(sampler, { cellW: this.cellPx.width, cellH: this.cellPx.height });
    warnAboutMissingCoverage(this.atlas);
  }

  /**
   * Cell size in CSS pixels. Anything drawn *over* the grid — a second design layer in real
   * type, a leader line, a selection box — needs this to land on the same lattice the
   * characters do.
   */
  get cellMetrics(): CellMetrics {
    return this.cellPx;
  }

  resize(cols: number, rows: number, cell: CellMetrics = this.cellPx): void {
    this.cellPx = cell;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(cols * cell.width * dpr);
    this.canvas.height = Math.round(rows * cell.height * dpr);
    this.canvas.style.width = `${cols * cell.width}px`;
    this.canvas.style.height = `${rows * cell.height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.font = `${cell.height}px ${this.font}`;
    this.ctx.textBaseline = 'top';
  }

  /**
   * ponytail: one fillText per non-blank cell, no pre-tinted atlas. Correct and simple; swap
   * in the 16-canvas tinted-atlas trick from docs/RENDERING.md if profiling shows this is over
   * budget on a real grid size.
   */
  present(grid: Grid, chrome: ChromeCommands = NO_CHROME): void {
    const { ctx, cellPx } = this;
    ctx.fillStyle = paletteColor(PALETTE, PAL.VOID);
    ctx.fillRect(0, 0, grid.cols * cellPx.width, grid.rows * cellPx.height);

    let lastFg = -1;
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const cell = grid.get(x, y);
        if (cell.glyph === 0 || BLANK_CODEPOINTS.has(cell.glyph)) continue;

        if (cell.bg !== PAL.VOID) {
          ctx.fillStyle = paletteColor(PALETTE, cell.bg);
          ctx.fillRect(x * cellPx.width, y * cellPx.height, cellPx.width, cellPx.height);
          lastFg = -1; // fillStyle was just overwritten for the background rect
        }
        if (cell.fg !== lastFg) {
          ctx.fillStyle = paletteColor(PALETTE, cell.fg);
          lastFg = cell.fg;
        }
        ctx.fillText(String.fromCodePoint(cell.glyph), x * cellPx.width, y * cellPx.height);
      }
    }

    this.drawChrome(chrome);
  }

  /**
   * The vector pass: the limb ring and the atmospheric halo. Everything else in this project
   * lives in the grid; these two do not, because a character cannot draw a smooth curve
   * (docs/ARCHITECTURE.md).
   */
  private drawChrome(chrome: ChromeCommands): void {
    const { ctx, cellPx } = this;
    if (!chrome.limb && !chrome.halo) return;

    const dpr = window.devicePixelRatio || 1;

    /** Traces the limb as an ellipse, since a cell is taller than it is wide. */
    const traceLimb = (centre: readonly [number, number], radiusRows: number, grow: number) => {
      const cx = centre[0] * cellPx.width;
      const cy = centre[1] * cellPx.height;
      const ry = radiusRows * cellPx.height;
      const rx = ry; // radiusRows is already in row units, which are square on screen
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + grow, ry + grow, 0, 0, Math.PI * 2);
    };

    // Halo first, so the ring sits on top of it.
    if (chrome.halo) {
      const { centreCell, radiusRows, paletteIndex, widthPx } = chrome.halo;
      // Quadratic falloff, drawn as a few concentric strokes — cheap and indistinguishable
      // from a gradient at these widths.
      const steps = Math.max(2, Math.round(widthPx));
      for (let i = steps; i >= 1; i--) {
        const t = i / steps;
        ctx.globalAlpha = 0.35 * (1 - t) * (1 - t);
        ctx.strokeStyle = paletteColor(PALETTE, paletteIndex);
        ctx.lineWidth = 2;
        traceLimb(centreCell, radiusRows, t * widthPx);
        ctx.stroke();
      }
    }

    if (chrome.limb) {
      const { centreCell, radiusRows, paletteIndex, opacity } = chrome.limb;
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = paletteColor(PALETTE, paletteIndex);
      // One physical pixel, per docs/AESTHETIC.md. No glow, no shadow, no second ring.
      ctx.lineWidth = 1 / dpr;
      traceLimb(centreCell, radiusRows, 0);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  dispose(): void {
    // No listeners or timers registered in this phase — nothing to release yet.
  }
}

function warnAboutMissingCoverage(atlas: GlyphAtlas): void {
  if (atlas.missing.size === 0) return;
  const chars = [...atlas.missing].map((cp) => String.fromCodePoint(cp)).join(' ');
  console.warn(`[glyphsphere] font is missing ${atlas.missing.size} glyph(s): ${chars}`);
}
