import { LINE_CLASS, type Layer } from '@glyphsphere/core';
import { geoGraticule } from 'd3-geo';

/**
 * Meridians and parallels. Generated rather than loaded — a graticule is a formula, not data.
 *
 * The step adapts to zoom so the count stays roughly constant: ten-degree lines are right for
 * a globe and absurd for a city.
 */
export interface GraticuleOptions {
  readonly maxAltitudeKm?: number;
}

/** Degrees between lines, chosen so a view always shows a handful rather than a mesh. */
function stepDeg(altitudeKm: number): number {
  if (altitudeKm > 12_000) return 15;
  if (altitudeKm > 4_000) return 10;
  if (altitudeKm > 1_000) return 5;
  if (altitudeKm > 200) return 1;
  return 0.1;
}

export function graticuleLayer(options: GraticuleOptions = {}): Layer {
  const maxAltitudeKm = options.maxAltitudeKm ?? Infinity;

  return {
    id: 'graticule',
    kind: 'geometry',

    visibleAt: (camera) => camera.altitudeKm <= maxAltitudeKm,

    paint(ctx, _body) {
      const step = stepDeg(ctx.camera.altitudeKm);
      ctx.strokeLine(geoGraticule().step([step, step])(), LINE_CLASS.GRATICULE, 1);
    },
  };
}
