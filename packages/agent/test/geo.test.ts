import { describe, expect, it } from 'vitest';
import { bearingDeg, compass, destination, haversineKm } from '../src/geo.js';

const EARTH_KM = 6371;

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm([-74.07, 4.71], [-74.07, 4.71], EARTH_KM)).toBe(0);
  });

  it('measures a quarter of the great circle from the equator to the pole', () => {
    const quarter = (Math.PI / 2) * EARTH_KM;
    expect(haversineKm([0, 0], [0, 90], EARTH_KM)).toBeCloseTo(quarter, 6);
  });

  it('agrees with the published Bogota-Madrid distance', () => {
    // 8 030 km by the great circle, per any navigation table.
    const km = haversineKm([-74.0721, 4.711], [-3.7038, 40.4168], EARTH_KM);
    expect(km).toBeGreaterThan(7950);
    expect(km).toBeLessThan(8100);
  });

  it('scales with the body, so the Moon is not measured in Earth kilometres', () => {
    const earth = haversineKm([0, 0], [10, 0], 6371);
    const moon = haversineKm([0, 0], [10, 0], 1737);
    expect(moon / earth).toBeCloseTo(1737 / 6371, 6);
  });
});

describe('bearingDeg', () => {
  it('reads due north as 0 and due east as 90', () => {
    expect(bearingDeg([0, 0], [0, 10])).toBeCloseTo(0, 6);
    expect(bearingDeg([0, 0], [10, 0])).toBeCloseTo(90, 6);
    expect(bearingDeg([0, 0], [0, -10])).toBeCloseTo(180, 6);
    expect(bearingDeg([0, 0], [-10, 0])).toBeCloseTo(270, 6);
  });
});

describe('destination', () => {
  it('round-trips against haversineKm and bearingDeg', () => {
    const origin = [-74.07, 4.71] as const;
    const target = destination(origin, 37, 250, EARTH_KM);

    expect(haversineKm(origin, target, EARTH_KM)).toBeCloseTo(250, 6);
    expect(bearingDeg(origin, target)).toBeCloseTo(37, 4);
  });

  it('wraps longitude across the antimeridian instead of running off the scale', () => {
    const target = destination([179, 0], 90, 500, EARTH_KM);
    expect(target[0]).toBeLessThan(0);
    expect(target[0]).toBeGreaterThan(-180);
  });
});

describe('compass', () => {
  it('maps the cardinal and intercardinal points', () => {
    expect(compass(0)).toBe('N');
    expect(compass(90)).toBe('E');
    expect(compass(180)).toBe('S');
    expect(compass(270)).toBe('W');
    expect(compass(315)).toBe('NW');
  });

  it('wraps rather than falling off the end of the table', () => {
    expect(compass(360)).toBe('N');
    expect(compass(359)).toBe('N');
    expect(compass(-90)).toBe('W');
  });
});
