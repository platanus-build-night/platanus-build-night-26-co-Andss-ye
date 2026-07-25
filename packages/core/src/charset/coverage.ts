import { BLANK_CODEPOINTS } from './charsets.js';

const DENSITY_EPSILON = 1e-3;

/**
 * A glyph is missing from the font when the rasterizer drew the ".notdef" replacement
 * shape for it: its density matches `replacementDensity`, or it came back at zero ink when
 * it isn't one of the code points that's legitimately blank (space, empty braille).
 * Per docs/RENDERING.md, this has to be checked, not assumed — braille and quadrant
 * coverage is irregular across fonts.
 */
export function detectMissing(
  charset: readonly number[],
  density: ReadonlyMap<number, number>,
  replacementDensity: number,
): Set<number> {
  const missing = new Set<number>();
  for (const codepoint of charset) {
    if (BLANK_CODEPOINTS.has(codepoint)) continue;
    const d = density.get(codepoint) ?? 0;
    const matchesReplacement = Math.abs(d - replacementDensity) < DENSITY_EPSILON;
    const blankWhenItShouldHaveInk = d < DENSITY_EPSILON;
    if (matchesReplacement || blankWhenItShouldHaveInk) {
      missing.add(codepoint);
    }
  }
  return missing;
}
