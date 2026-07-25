import type { Layer } from '@glyphsphere/core';
import type { Heightmap } from '../loaders/heightmap.js';

/**
 * Real elevation, sampled from the heightmap. Runs after `ocean` and before `landmask`, per
 * the layer order in docs/ARCHITECTURE.md: it supplies the height that `reduce` turns into
 * hypsometric bands, and the coastline is drawn on top of it.
 *
 * The heightmap is bathymetry *and* topography, so this replaces the ocean layer's single
 * nominal depth with the real sea floor — the abyssal plains, the shelves and the ridges all
 * come from the same field.
 */
export interface ReliefOptions {
  readonly heightmap: Heightmap;
  /**
   * Above this altitude the heightmap is coarser than a cell and adds nothing but cost.
   * docs/DATA.md is explicit that hypsometric relief is an L0-L4 feature.
   */
  readonly maxAltitudeKm?: number;
}

export function reliefLayer(options: ReliefOptions): Layer {
  const { heightmap } = options;
  const maxAltitudeKm = options.maxAltitudeKm ?? Infinity;

  return {
    id: 'relief',
    kind: 'geometry',

    visibleAt: (camera) => camera.altitudeKm <= maxAltitudeKm,

    paint(ctx) {
      ctx.fillElevationField((lon, lat) => heightmap.sample(lon, lat));
    },
  };
}
