import { computeDensity } from './density.js';
import { detectMissing } from './coverage.js';
import { fullCharset } from './charsets.js';

/** Unicode replacement character. Fonts render it as tofu (□) when a glyph is undefined. */
const REPLACEMENT_CODEPOINT = 0xfffd;

/**
 * Rasterizes one glyph to an alpha buffer. Core stays DOM-free (no canvas here): the host
 * (a renderer, or a test) supplies this, typically backed by an offscreen canvas measuring
 * with `fillText`. See docs/BODIES.md-style separation: core owns the algorithm, the host
 * owns the pixels.
 */
export type GlyphSampler = (codepoint: number) => {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8ClampedArray | Uint8Array;
};

export interface GlyphAtlas {
  readonly cellW: number;
  readonly cellH: number;
  readonly aspect: number; // cellW / cellH -> feeds Projection.cellAspect
  readonly density: ReadonlyMap<number, number>;
  readonly missing: ReadonlySet<number>;
}

export interface BuildAtlasOptions {
  readonly cellW: number;
  readonly cellH: number;
  /** Defaults to the union of the three registers (braille + quadrant + ascii). */
  readonly charset?: readonly number[];
}

export function buildAtlas(sample: GlyphSampler, options: BuildAtlasOptions): GlyphAtlas {
  const charset = options.charset ?? fullCharset();

  const density = new Map<number, number>();
  for (const codepoint of charset) {
    density.set(codepoint, computeDensity(sample(codepoint).alpha));
  }

  const replacementDensity = computeDensity(sample(REPLACEMENT_CODEPOINT).alpha);
  const missing = detectMissing(charset, density, replacementDensity);

  return {
    cellW: options.cellW,
    cellH: options.cellH,
    aspect: options.cellW / options.cellH,
    density,
    missing,
  };
}
