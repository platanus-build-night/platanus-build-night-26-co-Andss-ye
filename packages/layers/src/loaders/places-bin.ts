/**
 * Reads the binary written by `packages/data/scripts/build-places.ts`.
 *
 * Records are sorted by population descending, so selecting an LOD is taking a prefix — no
 * filtering, no sorting, no allocation per frame.
 */
export const PLACE_CATEGORY = {
  CAPITAL: 0,
  REGIONAL_CAPITAL: 1,
  CITY: 2,
  STATION: 3,
} as const;

export type PlaceCategory = (typeof PLACE_CATEGORY)[keyof typeof PLACE_CATEGORY];

export interface Place {
  readonly lon: number;
  readonly lat: number;
  readonly population: number;
  readonly category: number;
  readonly name: string;
}

export interface Places {
  readonly all: readonly Place[];
  /** Index where each LOD's prefix ends, from the build. */
  readonly cuts: Readonly<Record<string, number>>;
  /** The places worth drawing at this level of detail. */
  forLod(lod: string): readonly Place[];
}

export interface PlacesMeta {
  readonly cuts: Readonly<Record<string, number>>;
}

export function decodePlaces(bytes: Uint8Array, meta: PlacesMeta): Places {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const all: Place[] = [];

  let offset = 0;
  while (offset + 14 <= bytes.length) {
    const lon = view.getFloat32(offset, true);
    const lat = view.getFloat32(offset + 4, true);
    const population = view.getUint32(offset + 8, true);
    const category = view.getUint8(offset + 12);
    const nameLength = view.getUint8(offset + 13);
    offset += 14;

    if (offset + nameLength > bytes.length) break;
    const name = decoder.decode(bytes.subarray(offset, offset + nameLength));
    offset += nameLength;

    all.push({ lon, lat, population, category, name });
  }

  return {
    all,
    cuts: meta.cuts,
    forLod(lod: string): readonly Place[] {
      const cut = meta.cuts[lod];
      return cut === undefined ? all : all.slice(0, cut);
    },
  };
}

export async function loadPlaces(url: string, meta: PlacesMeta): Promise<Places> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`places ${url}: ${response.status}`);

  let bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }

  return decodePlaces(bytes, meta);
}
