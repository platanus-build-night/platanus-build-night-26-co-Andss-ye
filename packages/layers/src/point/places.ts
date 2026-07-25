import { PAL, lodForAltitude, solarIncidence, subsolarPoint, type Layer } from '@glyphsphere/core';
import { PLACE_CATEGORY, type Place, type Places } from '../loaders/places-bin.js';

/**
 * Cities, towns and stations.
 *
 * A point layer, so it writes cells directly: a marker has no coverage and no gradient, and
 * running it through the area registers would be meaningless (docs/ARCHITECTURE.md).
 *
 * Two things follow docs/AESTHETIC.md rather than convenience:
 * - The glyph differs by category, so a capital reads differently from a town at a glance.
 * - On the night side cities are drawn in ALPINE or SNOW by population, not dimmed. That is
 *   the detail the doc says makes people keep looking.
 */
export interface PlacesOptions {
  readonly places: Places;
  readonly at?: () => Date;
  /** Cities are meaningless from far enough out that the whole disc is a few hundred km wide. */
  readonly maxAltitudeKm?: number;
}

const GLYPH: Readonly<Record<number, string>> = {
  [PLACE_CATEGORY.CAPITAL]: '◉',
  [PLACE_CATEGORY.REGIONAL_CAPITAL]: '◆',
  [PLACE_CATEGORY.CITY]: '·',
  [PLACE_CATEGORY.STATION]: '+',
};

/** A big city lights up brighter than a small one. docs/AESTHETIC.md. */
function nightColour(population: number): number {
  return population >= 1_000_000 ? PAL.SNOW : PAL.ALPINE;
}

function dayColour(category: number): number {
  return category === PLACE_CATEGORY.CAPITAL ? PAL.SIGNAL : PAL.SIGNAL_DIM;
}

export function placesLayer(options: PlacesOptions): Layer {
  const { places } = options;
  const at = options.at ?? (() => new Date());
  const maxAltitudeKm = options.maxAltitudeKm ?? 40_000;

  return {
    id: 'places',
    kind: 'point',

    visibleAt: (camera) => camera.altitudeKm <= maxAltitudeKm,

    draw(grid, camera, projection, body) {
      const sun = subsolarPoint(at(), body);
      const visible = places.forLod(lodForAltitude(camera.altitudeKm));

      for (const place of visible) {
        const lonLat: [number, number] = [place.lon, place.lat];

        // isVisible before toCell: hidden-hemisphere culling is not optional.
        if (!projection.isVisible(lonLat)) continue;
        const cell = projection.toCell(lonLat);
        if (!cell) continue;

        const night = solarIncidence(lonLat, sun) < 0;
        const colour = night ? nightColour(place.population) : dayColour(place.category);

        grid.set(
          Math.round(cell[0]),
          Math.round(cell[1]),
          grid.glyph(GLYPH[place.category] ?? '·'),
          colour,
        );
      }
    },
  };
}

/** The places a label layer should consider, in the same order and with the same culling. */
export function visiblePlaces(
  places: Places,
  altitudeKm: number,
): readonly Place[] {
  return places.forLod(lodForAltitude(altitudeKm));
}
