import { PALETTE } from '../src/palette/palette.js';
import type { Body } from '../src/body.js';

/**
 * Test bodies are defined here, not imported from @glyphsphere/bodies: core must not depend
 * on a concrete body, and a test that reached for the real Earth profile would hide exactly
 * the coupling no-earth-constants.test.ts exists to prevent.
 */
export function testBody(overrides: Partial<Body> = {}): Body {
  return {
    id: 'test-body',
    name: 'Test Body',
    radiusKm: 6371,
    flattening: 0,
    elevationRangeM: [-11000, 9000],
    bands: [],
    palette: PALETTE,
    hasHydrosphere: true,
    atmosphere: null,
    rotation: { siderealPeriodHours: 24, axialTiltDeg: 0, tidallyLocked: false },
    datasets: { land: {} },
    ...overrides,
  };
}

/** A deliberately different radius, to catch anything that assumes the first body's size. */
export function smallBody(): Body {
  return testBody({ id: 'small-body', name: 'Small Body', radiusKm: 1737 });
}
