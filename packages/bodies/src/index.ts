export type {
  Body,
  ElevationBand,
  AtmosphereSpec,
  RotationSpec,
  DatasetManifest,
} from './types.js';

export { earth } from './earth/profile.js';
export { EARTH_BANDS } from './earth/bands.js';
export { EARTH_PALETTE } from './earth/palette.js';
export { EARTH_DATASETS } from './earth/datasets.js';

export { getBody, registerBody, allBodies } from './registry.js';
