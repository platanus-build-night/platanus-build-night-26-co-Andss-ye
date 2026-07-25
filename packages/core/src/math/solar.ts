import type { Body } from '../body.js';

/**
 * Where the sun is, for the terminator and for relief shading.
 *
 * docs/RELIEF.md §3 is specific that the light is **not fixed**: it comes from the real solar
 * position, which makes the shading consistent with the day/night terminator and makes the
 * same place look different at different hours. Nobody notices consciously; everybody feels it.
 *
 * Low-precision NOAA solar position — good to about a minute of arc, which is far finer than a
 * character cell.
 */
const DEG = Math.PI / 180;

/** Days since the J2000.0 epoch. */
function julianCenturies(date: Date): number {
  return (date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0) / 36_525;
}

export interface SubsolarPoint {
  /** Longitude where the sun is directly overhead. */
  readonly lon: number;
  /** Latitude, i.e. the solar declination. */
  readonly lat: number;
}

/**
 * The point where the sun is at the zenith. Everything else — terminator, incidence angle,
 * shading direction — follows from it.
 */
export function subsolarPoint(date: Date, body: Body): SubsolarPoint {
  const t = julianCenturies(date);

  // Geometric mean longitude and anomaly of the sun.
  const meanLon = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - t * 0.0001537);

  // Equation of centre: the orbit is an ellipse, not a circle.
  const centre =
    Math.sin(meanAnomaly * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomaly * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomaly * DEG) * 0.000289;

  const trueLon = meanLon + centre;

  // Obliquity comes from the body, not a constant: this is what lets the Moon reuse it.
  const obliquity = body.rotation.axialTiltDeg;
  const declination = Math.asin(Math.sin(obliquity * DEG) * Math.sin(trueLon * DEG)) / DEG;

  /**
   * The **equation of time**: the real sun runs ahead of or behind the clock by up to 16
   * minutes, because the orbit is elliptical and the axis is tilted.
   *
   * Without it the terminator sits on the mean sun and drifts up to 4.1 degrees of longitude
   * through the year — seventeen minutes of daylight in the wrong place, worst in early
   * February and early November. NOAA's low-precision form, in minutes.
   */
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const y = Math.tan((obliquity / 2) * DEG) ** 2;
  const equationOfTimeMin =
    4 *
    (y * Math.sin(2 * meanLon * DEG) -
      2 * eccentricity * Math.sin(meanAnomaly * DEG) +
      4 * eccentricity * y * Math.sin(meanAnomaly * DEG) * Math.cos(2 * meanLon * DEG) -
      0.5 * y * y * Math.sin(4 * meanLon * DEG) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * DEG)) /
    DEG;

  // The sub-solar meridian tracks UTC: apparent noon at Greenwich puts the sun at 0 degrees.
  // One minute of clock is a quarter degree of longitude.
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const lon = -((utcHours - 12) * 15) - equationOfTimeMin * 0.25;

  return { lon: ((lon + 180) % 360 + 360) % 360 - 180, lat: declination };
}

/**
 * Cosine of the solar incidence angle at a point: 1 at the sub-solar point, 0 at the
 * terminator, negative on the night side.
 */
export function solarIncidence(
  lonLat: readonly [number, number],
  sun: SubsolarPoint,
): number {
  const [lon, lat] = lonLat;
  return (
    Math.sin(lat * DEG) * Math.sin(sun.lat * DEG) +
    Math.cos(lat * DEG) * Math.cos(sun.lat * DEG) * Math.cos((lon - sun.lon) * DEG)
  );
}

/**
 * Direction the light comes from, in screen space, as a unit vector. Relief shading compares
 * the terrain gradient against this.
 */
export function solarScreenDirection(
  sun: SubsolarPoint,
  toCell: (lonLat: readonly [number, number]) => readonly [number, number] | null,
  centreLonLat: readonly [number, number],
  cellAspect: number,
): readonly [number, number] {
  const here = toCell(centreLonLat);
  const towardSun = toCell([sun.lon, sun.lat]);

  // The sun is over the horizon: fall back to light from the upper left, the convention that
  // stops relief reading as inverted craters.
  if (!here || !towardSun) return [-0.707, -0.707];

  const dx = (towardSun[0] - here[0]) * cellAspect;
  const dy = towardSun[1] - here[1];
  const length = Math.hypot(dx, dy);
  return length < 1e-9 ? [-0.707, -0.707] : [dx / length, dy / length];
}
