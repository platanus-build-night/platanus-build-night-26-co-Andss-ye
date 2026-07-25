/**
 * A rendered view, headless, plus what is in it.
 *
 * This is the auditability half of the package and the thing no map API can offer. The text
 * frame here and the facts from `describeLocation` come out of the same datasets through the
 * same projection, so a human can *look* at exactly what the model was told and see whether it
 * was true. A tile server's answer to the same question is a PNG a person can look at and a
 * model cannot, or a blob of GeoJSON the reverse. Here it is one frame, two readers.
 *
 * It runs in Node with no canvas because `core` has no DOM in it — the constraint that looked
 * like an inconvenience for a renderer is what makes the library callable from a tool server.
 */

import {
  Grid,
  LayerStack,
  createCameraState,
  createPipeline,
  createViewMetrics,
  horizonAngleRad,
  lodForAltitude,
  singleBodyScene,
  type Body,
  type LodLevel,
} from '@glyphsphere/core';
import { defaultLayers, visiblePlaces, type DefaultLayerOptions } from '@glyphsphere/layers';
import { haversineKm, type LonLat } from './geo.js';

export interface ViewPlace {
  readonly name: string;
  readonly population: number;
}

export interface ViewDescription {
  readonly centre: LonLat;
  readonly altitudeKm: number;
  readonly lod: LodLevel;
  readonly cols: number;
  readonly rows: number;
  /** Ground distance from the view centre to the horizon. */
  readonly horizonKm: number;
  readonly landFraction: number;
  readonly waterFraction: number;
  readonly spaceFraction: number;
  readonly minElevationM: number;
  readonly maxElevationM: number;
  readonly places: readonly ViewPlace[];
  /** The frame itself, one line per grid row. */
  readonly text: string;
}

export interface RenderViewOptions extends DefaultLayerOptions {
  readonly centre: LonLat;
  readonly altitudeKm: number;
  readonly cols?: number;
  readonly rows?: number;
  readonly at?: Date;
}

/**
 * Grid to text. Code point 0 is an unwritten cell, which is space — not a null character, which
 * would make the frame unreadable in a terminal and unparseable in a diff.
 */
export function gridToText(grid: Grid): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = '';
    for (let x = 0; x < grid.cols; x++) {
      const glyph = grid.get(x, y).glyph;
      line += glyph === 0 ? ' ' : String.fromCodePoint(glyph);
    }
    // Trailing blanks carry no information and are most of a globe frame's bytes.
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

export function renderView(body: Body, options: RenderViewOptions): ViewDescription {
  const cols = options.cols ?? 100;
  const rows = options.rows ?? 44;
  const { centre, altitudeKm } = options;
  const at = options.at ?? new Date();

  const camera = createCameraState(body.id, {
    lon: centre[0],
    lat: centre[1],
    altitudeKm,
  });

  const grid = new Grid(cols, rows);
  const view = createViewMetrics(cols, rows);
  const pipeline = createPipeline(cols, rows);
  const stack = new LayerStack(defaultLayers(body, { ...options, now: () => at }));

  pipeline.render({ scene: singleBodyScene(body), camera, view, grid, stack });

  // Composition, from the sample buffer the frame was reduced from rather than from the
  // glyphs: a glyph has already been through band quantization and cannot be counted back.
  const { bodyMask, elevation } = pipeline.buffer;
  let onBody = 0;
  let land = 0;
  let minElevationM = Infinity;
  let maxElevationM = -Infinity;

  for (let i = 0; i < bodyMask.length; i++) {
    if (bodyMask[i] === 0) continue;
    onBody++;
    const metres = elevation[i]!;
    if (metres >= 0) land++;
    if (metres < minElevationM) minElevationM = metres;
    if (metres > maxElevationM) maxElevationM = metres;
  }

  const total = bodyMask.length;
  const percent = (part: number, whole: number): number =>
    whole === 0 ? 0 : Math.round((part / whole) * 100);

  // `visiblePlaces` selects by detail level, which is a global prefix of the population-sorted
  // table — it says nothing about where the camera is pointing. Cutting to the horizon circle
  // is what makes this list "what is in the picture" rather than "the biggest cities on Earth".
  const horizonKm = horizonAngleRad(body, altitudeKm) * body.radiusKm;
  const places = options.places
    ? visiblePlaces(options.places, altitudeKm)
        .filter((p) => haversineKm(centre, [p.lon, p.lat], body.radiusKm) <= horizonKm)
        .slice(0, 12)
    : [];

  return {
    centre,
    altitudeKm,
    lod: lodForAltitude(altitudeKm),
    cols,
    rows,
    horizonKm,
    landFraction: percent(land, total),
    waterFraction: percent(onBody - land, total),
    spaceFraction: percent(total - onBody, total),
    minElevationM: Number.isFinite(minElevationM) ? Math.round(minElevationM) : 0,
    maxElevationM: Number.isFinite(maxElevationM) ? Math.round(maxElevationM) : 0,
    places: places.map((p) => ({ name: p.name, population: p.population })),
    text: gridToText(grid),
  };
}
