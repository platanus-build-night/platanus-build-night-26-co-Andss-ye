import { PAL, type Body } from '@glyphsphere/core';
import { EARTH_BANDS } from './bands.js';
import { EARTH_DATASETS } from './datasets.js';
import { EARTH_PALETTE } from './palette.js';

/**
 * The Earth profile. Data, not code — every number that a naive implementation would have
 * hard-coded into core as EARTH_RADIUS_KM lives here instead (docs/BODIES.md).
 */
export const earth: Body = {
  id: 'earth',
  name: 'Earth',

  // Volumetric mean radius (IUGG). The one number the whole projection is parametrized by.
  radiusKm: 6371,
  flattening: 1 / 298.257223563, // WGS 84

  // Challenger Deep to Everest, rounded to the band edges in docs/RELIEF.md.
  elevationRangeM: [-11000, 9000],
  bands: EARTH_BANDS,

  palette: EARTH_PALETTE,
  hasHydrosphere: true,

  atmosphere: {
    paletteIndex: PAL.SHELF,
    haloPx: 3,
  },

  rotation: {
    siderealPeriodHours: 23.9344696,
    axialTiltDeg: 23.4392811,
    tidallyLocked: false,
  },

  datasets: EARTH_DATASETS,
};
