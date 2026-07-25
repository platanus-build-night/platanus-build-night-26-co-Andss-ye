import type { ElevationBand } from '../../body.js';
export type { ElevationBand };

/**
 * The semantic register: ASCII whose shape **means** something. `~` is water, `^` is mountain,
 * `▲` is a snow-capped peak. This is the table that lets someone look at the globe and say
 * "those are the Andes" — and it is the reason a luminance ramp would be the wrong answer
 * (docs/RENDERING.md).
 *
 * The bands come from `body.bands`, never from a constant here: Earth's bathymetry-plus-
 * hypsometry and the Moon's grey-only ramp are different data, same code.
 */
const FALLBACK_BAND: ElevationBand = { maxM: Infinity, glyph: '.', paletteIndex: 5 };

/** First band whose ceiling the elevation reaches; the last band catches everything above. */
export function selectBand(
  bands: readonly ElevationBand[],
  elevationM: number,
): ElevationBand {
  for (const band of bands) {
    if (elevationM <= band.maxM) return band;
  }
  return bands[bands.length - 1] ?? FALLBACK_BAND;
}

export function semanticGlyph(bands: readonly ElevationBand[], elevationM: number): number {
  return selectBand(bands, elevationM).glyph.codePointAt(0) ?? 0x20;
}

/**
 * Thins the band table for a zoomed-out view. Eleven bands across 200 km per cell is noise,
 * so the LOD ladder opens them progressively (docs/RELIEF.md).
 *
 * The sea-level band is always kept: the water/land edge is the one boundary that must not
 * disappear, no matter how few bands remain.
 */
export function limitBands(
  bands: readonly ElevationBand[],
  maxCount: number,
): readonly ElevationBand[] {
  if (maxCount >= bands.length || maxCount < 2) return bands;

  const seaLevel = bands.findIndex((band) => band.maxM >= 0);
  const keep = new Set<number>([0, bands.length - 1]);
  if (seaLevel >= 0) keep.add(seaLevel);

  // Spread the rest evenly over the table.
  for (let i = 0; keep.size < maxCount && i < bands.length; i++) {
    keep.add(Math.round((i / Math.max(1, maxCount - 1)) * (bands.length - 1)));
  }

  return bands.filter((_, index) => keep.has(index));
}
