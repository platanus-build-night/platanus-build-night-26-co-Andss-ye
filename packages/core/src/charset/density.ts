/** Ink density of a rasterized glyph: fraction of alpha coverage over the cell area, [0, 1]. */
export function computeDensity(alpha: Uint8ClampedArray | Uint8Array): number {
  if (alpha.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) sum += alpha[i]!;
  return sum / (alpha.length * 255);
}
