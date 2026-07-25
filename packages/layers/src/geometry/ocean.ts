import type { Layer } from '@glyphsphere/core';

/**
 * The water surface. Runs first, so everything else is declared on top of it
 * (docs/ARCHITECTURE.md layer order).
 *
 * With no heightmap yet this declares a single nominal depth across the whole body, which
 * reduce turns into one bathymetric band. Fase 4 replaces the constant with a sampled
 * heightmap and the same code produces real bathymetry — the layer's job does not change.
 */
export interface OceanOptions {
  /** Nominal depth, metres below datum. Deep enough to land in the pelagic band. */
  readonly depthM?: number;
}

export function oceanLayer(options: OceanOptions = {}): Layer {
  const depthM = options.depthM ?? -3800;

  return {
    id: 'ocean',
    kind: 'geometry',

    appliesTo: (body) => body.hasHydrosphere,
    visibleAt: () => true,

    paint(ctx) {
      // The Sphere is the visible cap: d3 clips it to exactly the body silhouette.
      ctx.fillElevation({ type: 'Sphere' }, depthM);
    },
  };
}
