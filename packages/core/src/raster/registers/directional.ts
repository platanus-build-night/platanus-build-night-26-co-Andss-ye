/**
 * Directional edge glyphs. When an area border has a clean gradient, a glyph that *traces* the
 * slope reads better than a quadrant that steps it (docs/RENDERING.md, paso 2).
 *
 * These are also the fallback for braille linework when the font has no braille coverage: the
 * result loses sub-cell precision, not legibility (docs/ARCHITECTURE.md, degradación 3).
 */
const HORIZONTAL = '-'.codePointAt(0)!;
const VERTICAL = '|'.codePointAt(0)!;
const SLASH = '/'.codePointAt(0)!;
const BACKSLASH = '\\'.codePointAt(0)!;

const PI = Math.PI;

/**
 * Picks the glyph whose stroke lies **along** the edge. The Sobel angle points across the edge
 * (in the direction of increase), so the stroke direction is that angle rotated 90 degrees.
 *
 * Screen y grows downward, so a positive angle turns clockwise on screen — which is why the
 * slash and backslash assignments look flipped relative to a maths-convention diagram.
 */
export function edgeGlyph(angleRad: number): number {
  // Rotate to the edge direction and fold onto a half turn: a line has no head or tail.
  let a = (angleRad + PI / 2) % PI;
  if (a < 0) a += PI;

  if (a < PI / 8 || a >= (7 * PI) / 8) return HORIZONTAL;
  if (a < (3 * PI) / 8) return BACKSLASH;
  if (a < (5 * PI) / 8) return VERTICAL;
  return SLASH;
}

export const DIRECTIONAL_GLYPHS = [HORIZONTAL, VERTICAL, SLASH, BACKSLASH] as const;
