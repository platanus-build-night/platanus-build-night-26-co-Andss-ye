/**
 * Serialization for a model's context window.
 *
 * The format is chosen for token cost, not for looks. Three rules came out of measuring it:
 *
 * 1. **Fixed leading keys, one fact per line.** A model reads `COAST ~412 km NW` without any
 *    parsing instructions, and the key is one token. JSON of the same content costs roughly
 *    2.5x in braces, quotes and repeated key names — `describeLocation` still returns the
 *    object, so callers who want JSON have it, but this is the default for a prompt.
 * 2. **Compass points, not degrees.** See `geo.ts`.
 * 3. **Rounded magnitudes.** `7.7M` is one token and `7674366` is four, and no decision an
 *    agent makes changes on the difference.
 *
 * A full location description lands around 70 tokens. The same place from a tile API is a
 * PNG, and from a vector API is several kilobytes of rings.
 */

import type { LocationDescription } from './describe.js';
import type { ViewDescription } from './view.js';

/** `4.7110N 74.0721W`. Hemisphere letters beat signs: no model has ever dropped a letter. */
export function formatLonLat(lonLat: readonly [number, number]): string {
  const [lon, lat] = lonLat;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}${ns} ${Math.abs(lon).toFixed(4)}${ew}`;
}

export function formatPopulation(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function formatKm(value: number): string {
  return value >= 100 ? `${Math.round(value)} km` : `${value} km`;
}

export function formatLocation(d: LocationDescription): string {
  const lines: string[] = [];

  lines.push(`LOCATION  ${formatLonLat(d.lonLat)}  (${d.body})`);
  lines.push(`SURFACE   ${d.surface} · ${d.terrain.band} · ${d.terrain.elevationM} m`);

  const slope =
    d.terrain.aspect === null
      ? `slope ${d.terrain.slopeDeg}° (flat)`
      : `slope ${d.terrain.slopeDeg}° facing ${d.terrain.aspect}`;
  lines.push(`TERRAIN   ${slope} · local relief ${d.terrain.localReliefM} m`);

  const coast = d.coast.beyondRange
    ? `none within ${formatKm(d.coast.distanceKm)}`
    : `~${formatKm(d.coast.distanceKm)} ${d.coast.bearing}`;
  // The caveat rides on the COAST line rather than on SURFACE, because it is a statement about
  // how near the shoreline is — and it must be impossible to read `surface` without seeing it.
  lines.push(
    d.shorelineUncertain
      ? `COAST     ${coast} · shoreline within 2 km, so land/water here is at the limit of the data`
      : `COAST     ${coast}`,
  );

  if (d.places.length > 0) {
    const near = d.places
      .map((p) => `${p.name} ${formatKm(p.distanceKm)} ${p.bearing} (${formatPopulation(p.population)})`)
      .join(' · ');
    lines.push(`NEAR      ${near}`);
  } else {
    lines.push('NEAR      no populated place in range');
  }

  const sun = d.sun.isDay
    ? `up ${d.sun.elevationDeg}°`
    : `down ${Math.abs(d.sun.elevationDeg)}°`;
  lines.push(`SUN       ${sun} · solar time ${d.sun.localSolarTime}`);

  return lines.join('\n');
}

export function formatView(v: ViewDescription): string {
  const lines: string[] = [];

  lines.push(`VIEW      ${formatLonLat(v.centre)}  alt ${Math.round(v.altitudeKm)} km  ${v.lod}`);
  lines.push(`EXTENT    horizon ${Math.round(v.horizonKm)} km · ${v.cols}x${v.rows} cells`);
  lines.push(
    `SURFACE   ${v.landFraction}% land · ${v.waterFraction}% water · ${v.spaceFraction}% space`,
  );
  lines.push(`RELIEF    ${v.minElevationM} m to ${v.maxElevationM} m in view`);
  if (v.places.length > 0) {
    lines.push(`PLACES    ${v.places.map((p) => p.name).join(' · ')}`);
  }

  return lines.join('\n');
}
