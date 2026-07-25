import { describe, expect, it } from 'vitest';
import { buildAtlas, type GlyphSampler } from '../src/charset/atlas.js';

function alpha(fill: number, size = 16): Uint8ClampedArray {
  return new Uint8ClampedArray(size * size).fill(fill);
}

describe('buildAtlas', () => {
  const TOFU_FILL = 128; // whatever this fake font's .notdef box renders as
  const A = 'A'.codePointAt(0)!;
  const DOT = '.'.codePointAt(0)!;
  const DOLLAR = '$'.codePointAt(0)!;
  const SPACE = 0x20;

  const sample: GlyphSampler = (codepoint) => {
    if (codepoint === SPACE) return { width: 16, height: 16, alpha: alpha(0) }; // real blank
    if (codepoint === A) return { width: 16, height: 16, alpha: alpha(255) };
    if (codepoint === DOT) return { width: 16, height: 16, alpha: alpha(40) };
    // Everything else -- including the replacement char probe itself -- falls back to tofu,
    // simulating a font that doesn't cover '$'.
    return { width: 16, height: 16, alpha: alpha(TOFU_FILL) };
  };

  const atlas = buildAtlas(sample, { cellW: 8, cellH: 16, charset: [SPACE, A, DOT, DOLLAR] });

  it('measures density per glyph, normalized to [0, 1]', () => {
    expect(atlas.density.get(A)).toBeCloseTo(1, 5);
    expect(atlas.density.get(SPACE)).toBe(0);
    expect(atlas.density.get(DOT)).toBeCloseTo(40 / 255, 5);
  });

  it('reports cell aspect from the requested cell size', () => {
    expect(atlas.aspect).toBeCloseTo(0.5, 10);
  });

  it('flags a glyph that falls back to the tofu shape as missing', () => {
    expect(atlas.missing.has(DOLLAR)).toBe(true);
  });

  it('does not flag real content or legitimate blanks as missing', () => {
    expect(atlas.missing.has(A)).toBe(false);
    expect(atlas.missing.has(DOT)).toBe(false);
    expect(atlas.missing.has(SPACE)).toBe(false);
  });
});
