import { PAL, type ElevationBand } from '@glyphsphere/core';

/**
 * Hypsometric and bathymetric bands, verbatim from docs/RELIEF.md. Elevation is quantized to
 * these bands rather than mapped to a continuous gradient — that's what makes relief read as
 * stacked layers instead of blotches. The LOD ladder collapses these to five bands at L0-L1.
 */
export const EARTH_BANDS: readonly ElevationBand[] = [
  { maxM: -4000, glyph: ' ', paletteIndex: PAL.ABYSS, name: 'abyssal plain' },
  { maxM: -200, glyph: '·', paletteIndex: PAL.PELAGIC, name: 'deep ocean' },
  { maxM: 0, glyph: '~', paletteIndex: PAL.SHELF, name: 'continental shelf' },
  { maxM: 50, glyph: '.', paletteIndex: PAL.LITTORAL, name: 'coastal lowland' },
  { maxM: 300, glyph: ',', paletteIndex: PAL.PLAIN, name: 'plain' },
  { maxM: 800, glyph: ':', paletteIndex: PAL.PLAIN, name: 'high plain' },
  { maxM: 1500, glyph: ';', paletteIndex: PAL.STEPPE, name: 'hills' },
  { maxM: 2500, glyph: '=', paletteIndex: PAL.STEPPE, name: 'low mountains' },
  { maxM: 3500, glyph: '^', paletteIndex: PAL.HIGHLAND, name: 'high mountains' },
  { maxM: 5000, glyph: 'A', paletteIndex: PAL.ALPINE, name: 'alpine' },
  { maxM: 9000, glyph: '▲', paletteIndex: PAL.SNOW, name: 'permanent snow' },
];
