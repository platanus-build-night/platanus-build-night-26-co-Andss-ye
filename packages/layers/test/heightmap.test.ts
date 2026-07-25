import { describe, expect, it } from 'vitest';
import { createHeightmap, decodeHeightmap } from '../src/loaders/heightmap.js';

/** Mirrors the encoder in packages/data/scripts/build-relief.ts. */
function encode(width: number, height: number, data: Int16Array): Uint8Array {
  const count = width * height;
  const out = new Uint8Array(count * 2);
  for (let y = 0; y < height; y++) {
    let previous = 0;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const delta = data[index]! - previous;
      previous = data[index]!;
      out[index] = (delta >> 8) & 0xff;
      out[count + index] = delta & 0xff;
    }
  }
  return out;
}

describe('heightmap encoding round-trip', () => {
  it('recovers every value, including the extremes of the range', () => {
    const width = 8;
    const height = 4;
    const data = new Int16Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = (i * 977) % 4000 - 2000;
    data[0] = -11000; // Challenger Deep
    data[1] = 8848; // Everest
    data[2] = 0; // sea level

    const decoded = decodeHeightmap(encode(width, height, data), { width, height });
    expect(Array.from(decoded.data)).toEqual(Array.from(data));
  });

  it('rejects a buffer that is too short rather than reading garbage', () => {
    expect(() => decodeHeightmap(new Uint8Array(4), { width: 8, height: 4 })).toThrow();
  });
});

describe('bilinear sampling', () => {
  // A 4x2 grid, values chosen so each corner is distinguishable.
  const width = 4;
  const height = 2;
  const data = Int16Array.from([0, 100, 200, 300, 400, 500, 600, 700]);
  const map = createHeightmap(width, height, data);

  it('returns the stored value at a pixel centre', () => {
    // Pixel centres: lon = -180 + (i + 0.5) * 90, lat = 90 - (j + 0.5) * 90
    expect(map.sample(-135, 45)).toBeCloseTo(0, 6);
    expect(map.sample(-45, 45)).toBeCloseTo(100, 6);
    expect(map.sample(-135, -45)).toBeCloseTo(400, 6);
  });

  it('interpolates between neighbours instead of snapping', () => {
    const midway = map.sample(-90, 45); // halfway between the first two columns
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(100);
    expect(midway).toBeCloseTo(50, 6);
  });

  it('is continuous across the antimeridian, because longitude wraps', () => {
    const west = map.sample(-179.999, 0);
    const east = map.sample(179.999, 0);
    expect(Math.abs(west - east)).toBeLessThan(1);
  });

  it('clamps at the poles instead of wrapping over them', () => {
    expect(Number.isFinite(map.sample(0, 90))).toBe(true);
    expect(Number.isFinite(map.sample(0, -90))).toBe(true);
  });

  it('never returns NaN anywhere on the globe', () => {
    for (let lon = -180; lon <= 180; lon += 17) {
      for (let lat = -90; lat <= 90; lat += 13) {
        expect(Number.isFinite(map.sample(lon, lat))).toBe(true);
      }
    }
  });
});
