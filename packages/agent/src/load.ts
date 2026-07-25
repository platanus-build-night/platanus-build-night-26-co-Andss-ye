/**
 * Loads the Earth datasets from disk, for a process with a filesystem.
 *
 * Kept apart from every other module in this package on purpose: this is the only file that
 * imports `node:*`. Everything else takes already-decoded data as an argument, so the same
 * describe and render code runs unchanged in a browser, a worker, or a Cloudflare function
 * that fetches the same bytes over HTTP.
 */

import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  decodeHeightmap,
  decodePlaces,
  parseLandTopology,
  type Heightmap,
  type LandTopology,
  type Places,
} from '@glyphsphere/layers';
import type { Topology } from 'topojson-specification';

export interface EarthData {
  readonly heightmap: Heightmap;
  readonly places: Places;
  readonly land: LandTopology;
}

/** Detail level of the coastline to load. L4 is the 10m file: 3 MB, worth it for a shoreline. */
export type LandDetail = 'L0' | 'L2' | 'L4';

const LAND_FILES: Record<LandDetail, string> = {
  L0: 'land-110m.topo.json',
  L2: 'land-50m.topo.json',
  L4: 'land-10m.topo.json',
};

/**
 * Where `@glyphsphere/data` put its assets.
 *
 * Resolved through the package's own manifest rather than by walking up from `import.meta.url`:
 * the relative depth from source and from a build output differ, and one of the two silently
 * breaks whenever the build layout changes.
 */
function assetsDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('@glyphsphere/data/assets/earth/manifest.json'));
}

async function readMaybeGzipped(path: string): Promise<Uint8Array> {
  const bytes = await readFile(path);
  // gzip magic. The build writes .gz, but a decompressed copy should still load.
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? new Uint8Array(gunzipSync(bytes)) : new Uint8Array(bytes);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function loadEarthData(detail: LandDetail = 'L4'): Promise<EarthData> {
  const dir = assetsDir();

  const [reliefMeta, placesMeta] = await Promise.all([
    readJson<{ width: number; height: number; file: string }>(join(dir, 'relief.json')),
    readJson<{ cuts: Record<string, number>; file: string }>(join(dir, 'places.json')),
  ]);

  const [reliefBytes, placesBytes, landTopology] = await Promise.all([
    readMaybeGzipped(join(dir, reliefMeta.file)),
    readMaybeGzipped(join(dir, placesMeta.file)),
    readJson<Topology>(join(dir, LAND_FILES[detail])),
  ]);

  return {
    heightmap: decodeHeightmap(reliefBytes, {
      width: reliefMeta.width,
      height: reliefMeta.height,
    }),
    places: decodePlaces(placesBytes, { cuts: placesMeta.cuts }),
    land: parseLandTopology(landTopology),
  };
}
