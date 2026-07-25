import { describe, expect, it } from 'vitest';
import { createHeightmap, type Heightmap } from '@glyphsphere/layers';
import { earth } from '@glyphsphere/bodies';
import { nearestCoast, terrainAt } from '../src/terrain.js';
import { describeLocation } from '../src/describe.js';
import { formatLocation } from '../src/format.js';

/**
 * A synthetic world rather than the real 8 MB relief file: these tests are about the
 * arithmetic, and a fixture whose right answers can be worked out by hand catches errors that
 * real data hides. Loading ETOPO1 is exercised by `bin/probe.ts`, not by the suite.
 *
 * One square plateau at 1 000 m spanning +/-10 degrees about the origin, ocean at -3 000 m
 * everywhere else, on a 1-degree grid.
 */
function plateauWorld(): Heightmap {
  const width = 360;
  const height = 180;
  const data = new Int16Array(width * height);

  for (let y = 0; y < height; y++) {
    const lat = 90 - (y + 0.5) * (180 / height);
    for (let x = 0; x < width; x++) {
      const lon = -180 + (x + 0.5) * (360 / width);
      const onPlateau = Math.abs(lon) <= 10 && Math.abs(lat) <= 10;
      data[y * width + x] = onPlateau ? 1000 : -3000;
    }
  }

  return createHeightmap(width, height, data);
}

/**
 * A hillside rising towards the east at 600 m per degree of longitude, flattening outside
 * +/-15 degrees so the values stay inside Int16. Slope and aspect have known signs on it.
 */
function eastRampWorld(): Heightmap {
  const width = 360;
  const height = 180;
  const data = new Int16Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lon = -180 + (x + 0.5) * (360 / width);
      data[y * width + x] = Math.round(500 + Math.max(-15, Math.min(15, lon)) * 600);
    }
  }

  return createHeightmap(width, height, data);
}

/**
 * The same hillside turned to rise towards the north, at 300 m per degree of latitude — the
 * steepest a pole-to-pole ramp can be before it overruns Int16.
 *
 * A degree of latitude is the same ground distance everywhere, so this slope is genuinely
 * identical at every latitude — which is what makes it the right fixture for checking that
 * the gradient is measured in ground distance. An east-west ramp could not test it: defined
 * in degrees of longitude, such a ramp really *is* steeper near the poles.
 */
function northRampWorld(): Heightmap {
  const width = 360;
  const height = 180;
  const data = new Int16Array(width * height);

  for (let y = 0; y < height; y++) {
    const lat = 90 - (y + 0.5) * (180 / height);
    for (let x = 0; x < width; x++) {
      data[y * width + x] = Math.round(500 + lat * 300);
    }
  }

  return createHeightmap(width, height, data);
}

describe('terrainAt', () => {
  it('reads elevation and names the band from the body, not from a constant', () => {
    const facts = terrainAt([0, 0], plateauWorld(), earth);

    expect(facts.elevationM).toBe(1000);
    // 1 000 m falls in Earth's 800-1500 band.
    expect(facts.band).toBe('hills');
  });

  it('reports a flat plateau as flat, with no aspect to face', () => {
    const facts = terrainAt([0, 0], plateauWorld(), earth);

    expect(facts.slopeDeg).toBeLessThan(0.1);
    expect(facts.aspect).toBeNull();
    expect(facts.localReliefM).toBe(0);
  });

  it('faces a slope downhill, which is the direction water runs', () => {
    // Ground rises towards +lon, so the downhill aspect must point west.
    const facts = terrainAt([0, 0], eastRampWorld(), earth);

    expect(facts.slopeDeg).toBeGreaterThan(0);
    expect(facts.aspect).toBe('W');
  });

  it('faces north-rising ground to the south', () => {
    expect(terrainAt([0, 0], northRampWorld(), earth).aspect).toBe('S');
  });

  it('measures slope in ground distance, so latitude does not change a hillside', () => {
    const world = northRampWorld();
    const equator = terrainAt([0, 0], world, earth).slopeDeg;
    const arctic = terrainAt([0, 66], world, earth).slopeDeg;

    // Sampling the raster by texel index would make these differ; stepping a fixed ground
    // distance is what keeps the same hillside reading the same everywhere.
    expect(arctic).toBeCloseTo(equator, 1);
    expect(equator).toBeGreaterThan(0);
  });
});

describe('nearestCoast', () => {
  it('finds the plateau edge at roughly the right distance and bearing', () => {
    // The plateau runs to 10 degrees of latitude: about 1 111 km from the centre.
    const coast = nearestCoast([0, 0], plateauWorld(), earth);

    expect(coast.beyondRange).toBe(false);
    expect(coast.distanceKm).toBeGreaterThan(950);
    expect(coast.distanceKm).toBeLessThan(1200);
    expect(['N', 'E', 'S', 'W']).toContain(coast.bearing);
  });

  it('finds the same shoreline from the water side', () => {
    // Just off the eastern edge, looking back west at the plateau.
    const coast = nearestCoast([12, 0], plateauWorld(), earth);

    expect(coast.beyondRange).toBe(false);
    expect(coast.distanceKm).toBeLessThan(350);
    expect(coast.bearing).toBe('W');
  });

  it('says so instead of guessing when no shoreline is in range', () => {
    const allOcean = createHeightmap(36, 18, new Int16Array(36 * 18).fill(-3000));
    const coast = nearestCoast([0, 0], allOcean, earth, 500);

    expect(coast.beyondRange).toBe(true);
    expect(coast.distanceKm).toBe(500);
  });
});

describe('describeLocation', () => {
  const at = new Date('2026-03-20T12:00:00Z');

  it('classifies land and water from the heightmap when no coastline is supplied', () => {
    const world = plateauWorld();

    expect(describeLocation([0, 0], earth, { heightmap: world, at }).surface).toBe('land');
    expect(describeLocation([40, 0], earth, { heightmap: world, at }).surface).toBe('water');
  });

  it('puts the sun overhead at the equator at equinox noon on the Greenwich meridian', () => {
    const d = describeLocation([0, 0], earth, { heightmap: plateauWorld(), at });

    expect(d.sun.isDay).toBe(true);
    expect(d.sun.elevationDeg).toBeGreaterThan(87);
  });

  it('reports apparent solar time, which is not the clock', () => {
    const d = describeLocation([0, 0], earth, { heightmap: plateauWorld(), at });

    // 12:00 UTC at Greenwich, but the equation of time runs -7.4 minutes on 20 March, so
    // apparent noon is 11:52. Reporting 12:00 here would mean the equation of time had been
    // dropped — the same error that drifts the terminator by up to 4 degrees of longitude.
    const [hh, mm] = d.sun.localSolarTime.split(':').map(Number);
    const minutesFromNoon = hh! * 60 + mm! - 720;
    expect(minutesFromNoon).toBeLessThan(0);
    expect(Math.abs(minutesFromNoon)).toBeLessThan(17);
  });

  it('puts the sun down on the far side of the planet at the same instant', () => {
    const d = describeLocation([180, 0], earth, { heightmap: plateauWorld(), at });

    expect(d.sun.isDay).toBe(false);
    expect(d.sun.elevationDeg).toBeLessThan(-88);
  });

  it('is deterministic: the same instant and coordinates give identical bytes', () => {
    const world = plateauWorld();
    const once = describeLocation([5, 5], earth, { heightmap: world, at });
    const twice = describeLocation([5, 5], earth, { heightmap: world, at });

    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});

describe('formatLocation', () => {
  it('stays inside a prompt budget and keeps one fact per line', () => {
    const text = formatLocation(
      describeLocation([0, 0], earth, {
        heightmap: plateauWorld(),
        at: new Date('2026-03-20T12:00:00Z'),
      }),
    );

    const lines = text.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toMatch(/^LOCATION {2}0\.0000N 0\.0000E/);
    // ~4 characters per token: the whole description has to stay small enough that an agent
    // can afford to call it repeatedly while exploring.
    expect(text.length).toBeLessThan(400);
  });
});
