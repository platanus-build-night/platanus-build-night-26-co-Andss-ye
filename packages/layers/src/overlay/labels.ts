import {
  CollisionGrid,
  lodForAltitude,
  placeLabels,
  solarIncidence,
  subsolarPoint,
  type Body,
  type CameraState,
  type LabelCandidate,
  type Projection,
} from '@glyphsphere/core';
import { PLACE_CATEGORY, type Places } from '../loaders/places-bin.js';

/**
 * Where each place name belongs on screen — and nothing else.
 *
 * This is deliberately **not** a Layer. A layer writes into the character grid, and a name
 * written into the grid is a name rendered in the same register as the terrain: it competes
 * with the coastline for cells, it snaps to the cell lattice, and it reads as part of the map
 * rather than as an annotation on it.
 *
 * Names belong to the second layer of the design — real type, set over the character grid, in a
 * typeface chosen for reading rather than for drawing. So this returns *placements*, and the
 * host draws them however its platform draws text. Core and layers stay free of the DOM
 * (CLAUDE.md), and the same placements would drive a Canvas overlay, a React Native view, or a
 * plain-text export.
 */
export interface CityLabel {
  /** Grid cell of the name's left edge and baseline row. */
  readonly cellX: number;
  readonly cellY: number;
  /** Grid cell of the marker this name belongs to, for a leader line. */
  readonly markerX: number;
  readonly markerY: number;
  readonly text: string;
  readonly population: number;
  readonly category: number;
  /** True when the place is on the night side, so the host can light it differently. */
  readonly night: boolean;
  /** Visual weight, 0 (a town) to 2 (a capital or a megacity). */
  readonly rank: 0 | 1 | 2;
}

export interface CityLabelOptions {
  readonly places: Places;
  readonly camera: CameraState;
  readonly projection: Projection;
  readonly body: Body;
  /** Grid size the placements are laid out against. */
  readonly cols: number;
  readonly rows: number;
  /** Width of a name in cells, measured by the host in its own typeface. */
  readonly measure: (text: string, rank: number) => number;
  readonly at?: Date;
  /** Names need room to read; from orbit there is none. */
  readonly maxAltitudeKm?: number;
  /** Cap per frame, so a dense region cannot turn the map into a wall of text. */
  readonly maxLabels?: number;
}

/** A capital reads louder than a million-person city, which reads louder than a town. */
function rankOf(population: number, category: number): 0 | 1 | 2 {
  if (category === PLACE_CATEGORY.CAPITAL || population >= 5_000_000) return 2;
  if (category === PLACE_CATEGORY.REGIONAL_CAPITAL || population >= 500_000) return 1;
  return 0;
}

/** Reused across frames: the grid size is fixed for a session. */
let collision: CollisionGrid | null = null;

/**
 * Candidates are offered in population order, so when a region is too crowded to fit every
 * name it is the smallest town that loses its label — never the capital. That is what the
 * Fase 5 criterion asks for: Bogota where it belongs, with its name, without covering Medellin.
 */
export function cityLabels(options: CityLabelOptions): CityLabel[] {
  const { places, camera, projection, body, cols, rows, measure } = options;
  const maxAltitudeKm = options.maxAltitudeKm ?? 15_000;
  const maxLabels = options.maxLabels ?? 60;

  if (camera.altitudeKm > maxAltitudeKm) return [];

  if (!collision || collision.cols !== cols || collision.rows !== rows) {
    collision = new CollisionGrid(cols, rows);
  }
  collision.clear();

  const sun = subsolarPoint(options.at ?? new Date(), body);
  const visible = places.forLod(lodForAltitude(camera.altitudeKm));

  const candidates: LabelCandidate[] = [];
  const meta: Omit<CityLabel, 'cellX' | 'cellY'>[] = [];

  for (const place of visible) {
    if (candidates.length >= maxLabels) break;

    const lonLat: [number, number] = [place.lon, place.lat];
    // isVisible before toCell: hidden-hemisphere culling is not optional.
    if (!projection.isVisible(lonLat)) continue;
    const cell = projection.toCell(lonLat);
    if (!cell) continue;

    const markerX = Math.round(cell[0]);
    const markerY = Math.round(cell[1]);
    const rank = rankOf(place.population, place.category);
    const text = place.name.toUpperCase();

    // Reserve the marker cell so no label is written over its own dot.
    collision.occupy({ x: markerX, y: markerY, width: 1, height: 1 });

    candidates.push({ cellX: markerX, cellY: markerY, text, widthCells: measure(text, rank) });
    meta.push({
      markerX,
      markerY,
      text,
      population: place.population,
      category: place.category,
      night: solarIncidence(lonLat, sun) < 0,
      rank,
    });
  }

  const out: CityLabel[] = [];
  for (const label of placeLabels(collision, candidates)) {
    // The placement carries its source index, so duplicate names cannot cross wires.
    const info = meta[label.index];
    if (info) out.push({ ...info, cellX: label.x, cellY: label.y });
  }
  return out;
}
