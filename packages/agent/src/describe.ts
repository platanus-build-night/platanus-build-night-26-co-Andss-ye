/**
 * `describeLocation` — the package's reason to exist.
 *
 * It answers "what is at this coordinate" in the form a language model can act on: a handful
 * of named facts and spatial relations, no geometry. The same question put to a commercial
 * map API comes back as rings of coordinates and a tile URL, neither of which fits in a
 * prompt or means anything to a model without a rendering step it does not have.
 *
 * Everything here is computed from data already on disk. No network call, no key, no quota,
 * and the same input always produces the same bytes — which is what makes it usable inside an
 * eval or a test, and a live API not.
 */

import { subsolarPoint, solarIncidence, type Body } from '@glyphsphere/core';
import { geoContains } from 'd3-geo';
import type { Heightmap, LandTopology, Place, Places } from '@glyphsphere/layers';
import { bearingDeg, compass, destination, haversineKm, type LonLat } from './geo.js';
import { nearestCoast, terrainAt, type CoastFacts, type TerrainFacts } from './terrain.js';

/** Only `area` is ever read, and taking just that is what lets tests supply a toy coastline. */
type Coastline = Pick<LandTopology, 'area'>;

/**
 * How far the vector coastline may be from the true one.
 *
 * Natural Earth 10m is drawn for 1:10 000 000 and generalises the shore by roughly a
 * kilometre. Two is a conservative envelope on that. Inside it, "land" and "water" are a
 * property of the dataset rather than of the world — downtown Miami sits 500 m from Biscayne
 * Bay and classifies as water — so the answer is reported *with* that caveat instead of
 * being asserted flatly. Saying "uncertain" is worth more to an agent than being confidently
 * wrong about whether it is standing in the sea.
 */
const SHORELINE_TOLERANCE_KM = 2;

/** Beyond this the heightmap already proves no coastline is near, and the probe is skipped. */
const SHORELINE_PROBE_RANGE_KM = 50;

export interface NearbyPlace {
  readonly name: string;
  readonly distanceKm: number;
  readonly bearing: string;
  readonly population: number;
}

export interface SunFacts {
  /** Degrees above the horizon; negative means the sun has set. */
  readonly elevationDeg: number;
  readonly isDay: boolean;
  /** Solar time at this longitude, HH:MM. Noon is the sun at its highest, not a timezone. */
  readonly localSolarTime: string;
}

export interface LocationDescription {
  readonly body: string;
  readonly lonLat: LonLat;
  readonly surface: 'land' | 'water';
  /**
   * True when the point is close enough to the coastline that `surface` is a statement about
   * the dataset rather than about the world. See `SHORELINE_TOLERANCE_KM`.
   */
  readonly shorelineUncertain: boolean;
  readonly terrain: TerrainFacts;
  readonly coast: CoastFacts;
  readonly places: readonly NearbyPlace[];
  readonly sun: SunFacts;
  /** Instant the sun position was computed for. */
  readonly at: string;
}

export interface DescribeOptions {
  readonly heightmap: Heightmap;
  readonly places?: Places;
  /** When given, land/water comes from the coastline polygons instead of the heightmap. */
  readonly land?: Coastline;
  readonly at?: Date;
  /** How far out to look for towns. */
  readonly searchRadiusKm?: number;
  readonly maxPlaces?: number;
}

/**
 * Land or water.
 *
 * The heightmap alone gets this wrong in exactly the places people care about. At ~9.8 km per
 * texel, bilinear sampling drags the sea below zero across every low coastline, so Amsterdam,
 * Miami and the whole Nile delta report as ocean — the same class of bug the sample buffer's
 * Int16 elevation was introduced to fix. The coastline polygons answer it exactly, so they win
 * whenever they are loaded; the heightmap is the fallback for a body that has no vector coast.
 */
function surfaceAt(
  lonLat: LonLat,
  heightmap: Heightmap,
  land: Coastline | undefined,
): 'land' | 'water' {
  if (land) return geoContains(land.area, [lonLat[0], lonLat[1]]) ? 'land' : 'water';
  return heightmap.sample(lonLat[0], lonLat[1]) >= 0 ? 'land' : 'water';
}

/**
 * Is the shoreline near enough that the classification could flip on a better dataset?
 *
 * Answered by asking the same question in a ring around the point: if any neighbour a
 * tolerance away classifies differently, the coastline runs between them and the point is in
 * the band where the data cannot be trusted to a street.
 *
 * The heightmap gates it. `geoContains` against land-10m costs about 17 ms, and paying eight
 * of those on a query in the middle of Asia would be absurd — but the heightmap has already
 * established there is no coast within 50 km, which settles it for free.
 */
function shorelineUncertainAt(
  lonLat: LonLat,
  land: Coastline | undefined,
  body: Body,
  coast: CoastFacts,
): boolean {
  if (!land || coast.beyondRange || coast.distanceKm > SHORELINE_PROBE_RANGE_KM) return false;

  const here = geoContains(land.area, [lonLat[0], lonLat[1]]);
  for (let bearing = 0; bearing < 360; bearing += 45) {
    const p = destination(lonLat, bearing, SHORELINE_TOLERANCE_KM, body.radiusKm);
    if (geoContains(land.area, [p[0], p[1]]) !== here) return true;
  }
  return false;
}

function sunAt(lonLat: LonLat, body: Body, at: Date): SunFacts {
  const sun = subsolarPoint(at, body);
  const cosine = solarIncidence(lonLat, sun);
  const elevationDeg = (Math.asin(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;

  // Hour angle: how far this meridian has turned past the sub-solar one. 15 degrees an hour.
  const hourAngle = (((lonLat[0] - sun.lon + 540) % 360) - 180) / 15;
  const hours = (hourAngle + 12 + 24) % 24;
  const hh = Math.floor(hours);
  const mm = Math.floor((hours - hh) * 60);

  return {
    elevationDeg: Math.round(elevationDeg * 10) / 10,
    isDay: elevationDeg > 0,
    localSolarTime: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

function nearbyPlaces(
  lonLat: LonLat,
  places: Places,
  radiusKm: number,
  limit: number,
  body: Body,
): NearbyPlace[] {
  const found: Array<{ place: Place; distanceKm: number }> = [];

  for (const place of places.all) {
    const distanceKm = haversineKm(lonLat, [place.lon, place.lat], body.radiusKm);
    if (distanceKm <= radiusKm) found.push({ place, distanceKm });
  }

  found.sort((a, b) => a.distanceKm - b.distanceKm);

  return found.slice(0, limit).map(({ place, distanceKm }) => ({
    name: place.name,
    distanceKm: Math.round(distanceKm * 10) / 10,
    bearing: compass(bearingDeg(lonLat, [place.lon, place.lat])),
    population: place.population,
  }));
}

export function describeLocation(
  lonLat: LonLat,
  body: Body,
  options: DescribeOptions,
): LocationDescription {
  const { heightmap, places, land } = options;
  const at = options.at ?? new Date();
  const searchRadiusKm = options.searchRadiusKm ?? 200;
  const maxPlaces = options.maxPlaces ?? 5;

  const coast = nearestCoast(lonLat, heightmap, body);

  return {
    body: body.id,
    lonLat,
    surface: surfaceAt(lonLat, heightmap, land),
    shorelineUncertain: shorelineUncertainAt(lonLat, land, body, coast),
    terrain: terrainAt(lonLat, heightmap, body),
    coast,
    places: places ? nearbyPlaces(lonLat, places, searchRadiusKm, maxPlaces, body) : [],
    sun: sunAt(lonLat, body, at),
    at: at.toISOString(),
  };
}
