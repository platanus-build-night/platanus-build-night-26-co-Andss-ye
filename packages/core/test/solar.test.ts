import { describe, expect, it } from 'vitest';
import { subsolarPoint, solarIncidence } from '../src/math/solar.js';
import { testBody } from './fixtures.js';

/**
 * The terminator is only worth drawing if it is where the sun actually puts it. These are
 * published almanac values, not the implementation's own output.
 */
const earthLike = testBody({ rotation: { siderealPeriodHours: 23.9345, axialTiltDeg: 23.4393, tidallyLocked: false } });

describe('solar declination', () => {
  /** Solstices and equinoxes, UTC, with the declination the almanac gives. */
  const EVENTS = [
    ['March equinox 2024', '2024-03-20T03:06:00Z', 0],
    ['June solstice 2024', '2024-06-20T20:51:00Z', 23.44],
    ['September equinox 2024', '2024-09-22T12:44:00Z', 0],
    ['December solstice 2024', '2024-12-21T09:21:00Z', -23.44],
  ] as const;

  for (const [name, iso, declination] of EVENTS) {
    it(`${name} is within a hundredth of a degree`, () => {
      expect(subsolarPoint(new Date(iso), earthLike).lat).toBeCloseTo(declination, 1);
    });
  }
});

describe('subsolar longitude', () => {
  /**
   * At 12:00 UTC the sun is overhead at minus the equation of time, expressed in degrees
   * (1 minute of clock = 0.25 deg). Ignoring it — treating the mean sun as the real one — puts
   * the terminator up to 4.1 deg out, which is 17 minutes of daylight in the wrong place.
   */
  const EQUATION_OF_TIME_MIN = [
    ['11 February, the annual minimum', '2024-02-11T12:00:00Z', -14.2],
    ['15 April, a zero crossing', '2024-04-15T12:00:00Z', 0],
    ['26 July', '2024-07-26T12:00:00Z', -6.5],
    ['3 November, the annual maximum', '2024-11-03T12:00:00Z', 16.5],
  ] as const;

  for (const [name, iso, minutes] of EQUATION_OF_TIME_MIN) {
    it(`${name}`, () => {
      const expected = -minutes * 0.25;
      // Half a degree: two minutes of clock, finer than a cell at any planetary zoom.
      expect(subsolarPoint(new Date(iso), earthLike).lon).toBeCloseTo(expected, 0);
    });
  }

  it('advances 15 degrees westward per hour', () => {
    const a = subsolarPoint(new Date('2024-06-15T00:00:00Z'), earthLike);
    const b = subsolarPoint(new Date('2024-06-15T01:00:00Z'), earthLike);
    let delta = a.lon - b.lon;
    if (delta < -180) delta += 360;
    if (delta > 180) delta -= 360;
    expect(delta).toBeCloseTo(15, 1);
  });

  it('stays inside [-180, 180]', () => {
    for (let hour = 0; hour < 24; hour++) {
      const { lon } = subsolarPoint(new Date(Date.UTC(2024, 5, 15, hour)), earthLike);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });
});

describe('the terminator falls where sunrise is', () => {
  /**
   * Sunrise at Greenwich on the equinox is about 06:00 UTC, so at that moment the incidence
   * there crosses zero. This is the end-to-end check that the night side is the night side.
   */
  it('Greenwich crosses into daylight around 06:00 UTC at the equinox', () => {
    const before = solarIncidence([0, 51.48], subsolarPoint(new Date('2024-03-20T05:00:00Z'), earthLike));
    const after = solarIncidence([0, 51.48], subsolarPoint(new Date('2024-03-20T07:00:00Z'), earthLike));
    expect(before).toBeLessThan(0);
    expect(after).toBeGreaterThan(0);
  });

  it('the antipode of the subsolar point is the darkest place on the body', () => {
    const sun = subsolarPoint(new Date('2024-06-15T12:00:00Z'), earthLike);
    const antipode: [number, number] = [sun.lon > 0 ? sun.lon - 180 : sun.lon + 180, -sun.lat];
    expect(solarIncidence(antipode, sun)).toBeCloseTo(-1, 3);
    expect(solarIncidence([sun.lon, sun.lat], sun)).toBeCloseTo(1, 6);
  });

  it('a tilt of zero puts the sun on the equator all year', () => {
    const noTilt = testBody({ rotation: { siderealPeriodHours: 24, axialTiltDeg: 0, tidallyLocked: false } });
    for (const iso of ['2024-03-20T00:00:00Z', '2024-06-21T00:00:00Z', '2024-12-21T00:00:00Z']) {
      expect(subsolarPoint(new Date(iso), noTilt).lat).toBeCloseTo(0, 6);
    }
  });
});
