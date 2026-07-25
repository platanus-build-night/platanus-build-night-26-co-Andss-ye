import { LINE_CLASS, SUB_X, type Layer } from '@glyphsphere/core';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import {
  capFeatures,
  capIsVisible,
  capRuns,
  resolveRing,
  viewCap,
  type Capped,
  type RunIndexedRing,
  type ViewCap,
} from '../loaders/culling.js';

/**
 * Rivers and lakes.
 *
 * The two are declared differently on purpose, and that difference is the three-register system
 * working as designed:
 *
 * - A **river** is a line. At any planetary zoom it is far thinner than a cell, so it is
 *   declared as RIVER linework and `reduce` renders it in braille at sub-cell precision.
 * - A **lake** is an area. It is declared as coverage *and* as an outline, so its interior
 *   takes the water band while its shore reads as a stroke — the same treatment as a coastline.
 */
export interface HydroOptions {
  readonly rivers?: FeatureCollection<Geometry>;
  readonly lakes?: FeatureCollection<Geometry>;
  /** Rivers only appear once there is room for them. docs/DATA.md puts hydro at L3+. */
  readonly maxAltitudeKm?: number;
  /** Nominal lake surface height; without it a lake would inherit the surrounding terrain. */
  readonly lakeElevationM?: number;
}

/**
 * Natural Earth's `scalerank` is a river hierarchy: 0 is the Amazon, 10 is a minor tributary.
 * Showing every rank at every zoom turns a continent into a hairball, so the threshold opens
 * as the camera descends.
 */
function maxScaleRank(altitudeKm: number): number {
  if (altitudeKm > 4_000) return 2;
  if (altitudeKm > 1_500) return 4;
  if (altitudeKm > 600) return 6;
  if (altitudeKm > 200) return 8;
  return 12;
}

/** The rings of a geometry, flattened, in a stable order. */
function ringsOfGeometry(geometry: Geometry): Position[][] | null {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return null;
}

/**
 * A geometry of the same shape wired to `rings`, which the caller then refills in place.
 *
 * Built once, at load. docs/RENDERING.md forbids allocation inside the render loop, and this is
 * what lets the thinning write into arrays the output geometry already points at.
 */
function geometryOver(geometry: Geometry, rings: Position[][]): Geometry {
  if (geometry.type === 'LineString') return { type: 'LineString', coordinates: rings[0]! };
  if (geometry.type === 'MultiLineString') return { type: 'MultiLineString', coordinates: rings };
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: rings };
  if (geometry.type === 'MultiPolygon') {
    let at = 0;
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) => polygon.map(() => rings[at++]!)),
    };
  }
  return geometry;
}

interface HydroFeature {
  readonly rank: number;
  readonly capped: Capped<Feature<Geometry>>;
  /**
   * Run-indexed source rings, for the same reason land has them: rivers-10m traces a river far
   * finer than a cell, and every point past one per subcell costs a projection and draws
   * nothing. `null` for geometry types with no rings to thin.
   */
  readonly rings: readonly RunIndexedRing[] | null;
  /** Output arrays, owned by this feature and refilled every frame. */
  readonly out: Position[][];
  /** The feature handed to d3, pointing at `out`. */
  readonly thinned: Feature<Geometry>;
}

/**
 * Caps and run indices are built from every coordinate in the dataset, which is not something
 * to repeat every time a toggle rebuilds the layer stack. Keyed on the collection itself, so
 * the work survives as long as the data does and is collected with it.
 */
const prepared = new WeakMap<FeatureCollection<Geometry>, HydroFeature[]>();

function prepare(collection: FeatureCollection<Geometry>): HydroFeature[] {
  const cached = prepared.get(collection);
  if (cached) return cached;

  const features = capFeatures(collection.features as Feature<Geometry>[]).map((capped) => {
    const rank = capped.value.properties?.['scalerank'];
    const source = ringsOfGeometry(capped.value.geometry);
    const out = source ? source.map(() => [] as Position[]) : [];

    return {
      rank: typeof rank === 'number' ? rank : 0,
      capped,
      rings: source ? source.map(capRuns) : null,
      out,
      thinned: source
        ? { ...capped.value, geometry: geometryOver(capped.value.geometry, out) }
        : capped.value,
    };
  });

  prepared.set(collection, features);
  return features;
}

export function hydroLayer(options: HydroOptions): Layer {
  const maxAltitudeKm = options.maxAltitudeKm ?? 6_000;
  const lakeElevationM = options.lakeElevationM ?? 0;

  // Reused every frame. The per-frame `.filter()` this replaces built a fresh FeatureCollection
  // of the whole planet twice a frame.
  const scratch: FeatureCollection<Geometry> = { type: 'FeatureCollection', features: [] };

  /** Features passing both the rank threshold and the visible cap, thinned to what shows. */
  function select(
    collection: FeatureCollection<Geometry>,
    maxRank: number,
    view: ViewCap,
    subcellRad: number,
  ): FeatureCollection<Geometry> {
    const features = scratch.features;
    features.length = 0;

    for (const { rank, capped, rings, out, thinned } of prepare(collection)) {
      if (rank > maxRank) continue;
      if (!capIsVisible(capped.cap, view)) continue;

      if (rings !== null) {
        for (let i = 0; i < rings.length; i++) resolveRing(rings[i]!, view, subcellRad, out[i]!);
      }
      features.push(thinned);
    }
    return scratch;
  }

  return {
    id: 'hydro',
    kind: 'geometry',

    // A river does not exist on a body with no water. The layer says so itself.
    appliesTo: (body) => body.hasHydrosphere,
    visibleAt: (camera) => camera.altitudeKm <= maxAltitudeKm,

    paint(ctx) {
      const rank = maxScaleRank(ctx.camera.altitudeKm);

      // Reject by cap before d3 sees a coordinate. Without this the layer streamed every river
      // on the planet every frame — and because the rank threshold *opens* as the camera
      // descends, it grew more expensive the closer you looked: 72 ms at 20 km altitude.
      const view = viewCap(ctx.camera.lon, ctx.camera.lat, Math.acos(1 / ctx.projection.distance));
      const subcellRad = ctx.projection.metersPerCell() / SUB_X / (ctx.body.radiusKm * 1000);

      if (options.lakes) {
        const lakes = select(options.lakes, rank, view, subcellRad);
        // Sea level, so the interior falls in the water bands rather than the land ones.
        ctx.fillArea(lakes, lakeElevationM);
        ctx.strokeLine(lakes, LINE_CLASS.RIVER, 1);
      }

      if (options.rivers) {
        ctx.strokeLine(select(options.rivers, rank, view, subcellRad), LINE_CLASS.RIVER, 1);
      }
    },
  };
}
