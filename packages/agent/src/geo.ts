/**
 * Spherical relations: distance, bearing, and a point at a bearing.
 *
 * This is the whole reason the agent package exists. A map API answers "what is at this
 * coordinate" with geometry — rings of lon/lat pairs. A language model cannot reason over
 * rings; it reasons over *relations*: "the coast is 40 km northwest", "the ground rises
 * 1 200 m to the east". Everything in this package is a function that turns geometry the
 * renderer already has into one of those sentences.
 *
 * Every function takes `radiusKm` rather than closing over Earth's. Same rule as core.
 */

const DEG = Math.PI / 180;

export type LonLat = readonly [lon: number, lat: number];

/**
 * Great-circle distance. Haversine rather than the spherical law of cosines: the latter loses
 * precision at short distances in float64, and short distances are the interesting ones here
 * (how far to the coast, how far to the next town).
 */
export function haversineKm(a: LonLat, b: LonLat, radiusKm: number): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const lat1 = a[1] * DEG;
  const lat2 = b[1] * DEG;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, degrees clockwise from north. */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const lat1 = a[1] * DEG;
  const lat2 = b[1] * DEG;
  const dLon = (b[0] - a[0]) * DEG;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/** Where you end up going `distanceKm` from `origin` on bearing `bearing`. */
export function destination(
  origin: LonLat,
  bearing: number,
  distanceKm: number,
  radiusKm: number,
): LonLat {
  const delta = distanceKm / radiusKm;
  const theta = bearing * DEG;
  const lat1 = origin[1] * DEG;
  const lon1 = origin[0] * DEG;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [((((lon2 / DEG) + 540) % 360) - 180), lat2 / DEG];
}

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/**
 * Bearing as a compass point. Sixteen points, not degrees, because "NW" is a direction a model
 * can act on and "312.4°" is a number it has to convert first — badly, and often.
 */
export function compass(bearing: number): string {
  const index = Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16;
  return POINTS[index]!;
}
