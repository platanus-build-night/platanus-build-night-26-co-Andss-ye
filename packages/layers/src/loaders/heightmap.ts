/**
 * Equirectangular elevation grid with bilinear sampling.
 *
 * DOM-free on purpose: decoding through canvas would cap the data at 8 bits per channel, which
 * is exactly the precision docs/DATA.md rejects (256 levels over a 20 km range is 110 m per
 * level, and contour intervals go down to 20 m).
 */
export interface Heightmap {
  readonly width: number;
  readonly height: number;
  /** Elevation in metres, row-major from the north-west corner. */
  readonly data: Int16Array;
  /** Bilinearly interpolated elevation, in metres. */
  sample(lon: number, lat: number): number;
}

export interface HeightmapMeta {
  readonly width: number;
  readonly height: number;
}

/**
 * Reverses `packages/data/scripts/build-relief.ts`: undo the byte-plane split, then the
 * row-wise delta.
 */
export function decodeHeightmap(bytes: Uint8Array, meta: HeightmapMeta): Heightmap {
  const { width, height } = meta;
  const count = width * height;
  if (bytes.length < count * 2) {
    throw new Error(`heightmap is ${bytes.length} bytes, expected ${count * 2}`);
  }

  const data = new Int16Array(count);
  for (let y = 0; y < height; y++) {
    let previous = 0;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      // Reassemble the signed 16-bit delta from its two planes.
      const delta = ((bytes[index]! << 8) | bytes[count + index]!) << 16 >> 16;
      previous += delta;
      data[index] = previous;
    }
  }

  return createHeightmap(width, height, data);
}

export function createHeightmap(width: number, height: number, data: Int16Array): Heightmap {
  /** Wraps in longitude, clamps in latitude — the globe is a cylinder, not a torus. */
  const at = (x: number, y: number): number => {
    const wx = ((x % width) + width) % width;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return data[cy * width + wx]!;
  };

  return {
    width,
    height,
    data,

    /**
     * Bilinear, not nearest neighbour. Nearest produces visible steps along contour lines,
     * because a contour is exactly the boundary between two quantized bands and any sampling
     * staircase lands right on it (docs/DATA.md).
     */
    sample(lon: number, lat: number): number {
      // Pixel centres sit half a texel in from the edges of their cell.
      const fx = ((lon + 180) / 360) * width - 0.5;
      const fy = ((90 - lat) / 180) * height - 0.5;

      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;

      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      return top * (1 - ty) + bottom * ty;
    },
  };
}

/** Fetches and decodes a heightmap built by `pnpm data:build`. */
export async function loadHeightmap(url: string, meta: HeightmapMeta): Promise<Heightmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`heightmap ${url}: ${response.status}`);

  let bytes = new Uint8Array(await response.arrayBuffer());

  // A server that already applied Content-Encoding hands back plain bytes; otherwise the
  // gzip container is still there and has to come off here.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }

  return decodeHeightmap(bytes, meta);
}
