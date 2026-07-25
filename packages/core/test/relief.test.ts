import { describe, expect, it } from 'vitest';
import { subsolarPoint, solarIncidence } from '../src/math/solar.js';
import { adaptiveIntervalM, contourIntervalM } from '../src/raster/contour.js';
import { embossShift, applyShift, EMBOSS_MIN } from '../src/raster/emboss.js';
import { coastalShadowWidth } from '../src/raster/coastal-shadow.js';
import { limitBands } from '../src/raster/registers/semantic.js';
import { PAL } from '../src/palette/palette.js';
import { testBody } from './fixtures.js';

const body = testBody({ rotation: { siderealPeriodHours: 23.9344696, axialTiltDeg: 23.4392811, tidallyLocked: false } });

describe('solar position', () => {
  it('puts the sun near the equator at an equinox', () => {
    const sun = subsolarPoint(new Date('2024-03-20T12:00:00Z'), body);
    expect(Math.abs(sun.lat)).toBeLessThan(1);
  });

  it('reaches the tropics at the solstices, and the right one', () => {
    const june = subsolarPoint(new Date('2024-06-21T12:00:00Z'), body);
    const december = subsolarPoint(new Date('2024-12-21T12:00:00Z'), body);
    expect(june.lat).toBeCloseTo(23.44, 0); // Tropic of Cancer
    expect(december.lat).toBeCloseTo(-23.44, 0); // Tropic of Capricorn
  });

  /**
   * Near Greenwich at noon UTC, not exactly on it. These two used to demand *exactly* zero and
   * exactly 15 deg an hour, which is the **mean** sun — the fiction clocks run on. The real sun
   * leads or trails it by up to 16 minutes (the equation of time), so pinning it to the clock
   * was pinning the terminator to the wrong place by up to 4 deg of longitude.
   */
  it('is near Greenwich at noon UTC and near the antimeridian at midnight', () => {
    const noon = subsolarPoint(new Date('2024-03-20T12:00:00Z'), body).lon;
    expect(Math.abs(noon)).toBeLessThan(4.2); // the annual bound on the equation of time

    const midnight = Math.abs(subsolarPoint(new Date('2024-03-20T00:00:00Z'), body).lon);
    expect(midnight).toBeGreaterThan(175.8);
  });

  it('tracks westward at fifteen degrees an hour', () => {
    const noon = subsolarPoint(new Date('2024-03-20T12:00:00Z'), body).lon;
    const later = subsolarPoint(new Date('2024-03-20T14:00:00Z'), body).lon;
    // Two hours of rotation, plus the sub-arcminute drift of the equation of time itself.
    expect(noon - later).toBeCloseTo(30, 1);
  });

  it('takes obliquity from the body, so a body with no tilt has no seasons', () => {
    const untilted = testBody({
      rotation: { siderealPeriodHours: 24, axialTiltDeg: 0, tidallyLocked: false },
    });
    expect(subsolarPoint(new Date('2024-06-21T12:00:00Z'), untilted).lat).toBeCloseTo(0, 6);
  });

  it('incidence is 1 under the sun, 0 at the terminator and negative at night', () => {
    const sun = { lon: 0, lat: 0 };
    expect(solarIncidence([0, 0], sun)).toBeCloseTo(1, 6);
    expect(solarIncidence([90, 0], sun)).toBeCloseTo(0, 6);
    expect(solarIncidence([180, 0], sun)).toBeCloseTo(-1, 6);
  });
});

describe('contour interval', () => {
  it('follows the altitude table from docs/RELIEF.md on flat ground', () => {
    expect(contourIntervalM(10_000)).toBe(2000);
    expect(contourIntervalM(3_000)).toBe(1000);
    expect(contourIntervalM(1_000)).toBe(500);
    expect(contourIntervalM(300)).toBe(200);
    expect(contourIntervalM(50)).toBe(50);
    expect(contourIntervalM(10)).toBe(20);
  });

  it('never goes below the table, however gentle the terrain', () => {
    expect(adaptiveIntervalM(3_000, 0)).toBe(contourIntervalM(3_000));
    expect(adaptiveIntervalM(3_000, 1)).toBeGreaterThanOrEqual(contourIntervalM(3_000));
  });

  /**
   * The reason this exists: over steep ground a fixed interval puts a contour in every subcell,
   * and docs/AESTHETIC.md requires braille to stay a clear minority of the frame.
   */
  it('opens up over steep terrain', () => {
    const gentle = adaptiveIntervalM(2_000, 20);
    const steep = adaptiveIntervalM(2_000, 900);
    expect(steep).toBeGreaterThan(gentle);
  });

  it('only ever returns intervals a cartographer would print', () => {
    const nice = new Set([20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000]);
    for (const rise of [0, 3, 17, 120, 640, 2500]) {
      expect(nice.has(adaptiveIntervalM(2_000, rise))).toBe(true);
    }
  });
});

describe('emboss', () => {
  it('ignores ground too flat to shade', () => {
    expect(embossShift(1, 0, 1, 0, EMBOSS_MIN / 2)).toBe(0);
  });

  it('lightens a slope facing the light and darkens one facing away', () => {
    expect(embossShift(1, 0, 1, 0, 1)).toBe(1); // facing the sun
    expect(embossShift(-1, 0, 1, 0, 1)).toBe(-2); // straight away from it
  });

  it('leaves a slope across the light alone', () => {
    expect(embossShift(0, 1, 1, 0, 1)).toBe(0);
  });

  it('shadow is stronger than highlight, as docs/RELIEF.md specifies', () => {
    const lit = embossShift(1, 0, 1, 0, 1);
    const dark = embossShift(-1, 0, 1, 0, 1);
    expect(Math.abs(dark)).toBeGreaterThan(Math.abs(lit));
  });

  it('keeps the shifted index inside the terrain ramp', () => {
    // Shading must never push a mountain into the water colours or the instrument cyans.
    expect(applyShift(PAL.LITTORAL, -5, PAL.LITTORAL, PAL.SNOW)).toBe(PAL.LITTORAL);
    expect(applyShift(PAL.SNOW, +5, PAL.LITTORAL, PAL.SNOW)).toBe(PAL.SNOW);
    expect(applyShift(PAL.PLAIN, -1, PAL.LITTORAL, PAL.SNOW)).toBe(PAL.PLAIN - 1);
  });
});

describe('coastal shadow width', () => {
  it('is one cell from orbit, two regionally, and none in the city', () => {
    expect(coastalShadowWidth(20_000)).toBe(1);
    expect(coastalShadowWidth(1_000)).toBe(2);
    expect(coastalShadowWidth(10)).toBe(0);
  });
});

describe('band thinning', () => {
  const bands = testBody({
    bands: [
      { maxM: -4000, glyph: ' ', paletteIndex: PAL.ABYSS },
      { maxM: -200, glyph: '·', paletteIndex: PAL.PELAGIC },
      { maxM: 0, glyph: '~', paletteIndex: PAL.SHELF },
      { maxM: 300, glyph: ',', paletteIndex: PAL.PLAIN },
      { maxM: 1500, glyph: ';', paletteIndex: PAL.STEPPE },
      { maxM: 3500, glyph: '^', paletteIndex: PAL.HIGHLAND },
      { maxM: 9000, glyph: '▲', paletteIndex: PAL.SNOW },
    ],
  }).bands;

  it('returns the table untouched when nothing needs dropping', () => {
    expect(limitBands(bands, bands.length)).toBe(bands);
    expect(limitBands(bands, 99)).toBe(bands);
  });

  it('thins to the requested count', () => {
    expect(limitBands(bands, 5).length).toBeLessThanOrEqual(5);
    expect(limitBands(bands, 3).length).toBeLessThanOrEqual(3);
  });

  /** The water/land edge is the one boundary that must survive any thinning. */
  it('always keeps a sea-level band', () => {
    for (const count of [2, 3, 4, 5]) {
      const kept = limitBands(bands, count);
      expect(kept.some((band) => band.maxM === 0)).toBe(true);
    }
  });

  it('keeps the extremes, so the full elevation range stays representable', () => {
    const kept = limitBands(bands, 4);
    expect(kept[0]).toBe(bands[0]);
    expect(kept.at(-1)).toBe(bands.at(-1));
  });
});
