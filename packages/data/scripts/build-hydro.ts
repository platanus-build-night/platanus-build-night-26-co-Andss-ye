/**
 * Rivers and lakes, per docs/DATA.md. Both are stored as GeoJSON rather than TopoJSON: they
 * share no boundaries with anything, so topology would save nothing, and the layer needs them
 * as plain geometry anyway.
 *
 * Rivers carry a `scalerank` that acts as a hierarchy — the Amazon and a tributary should not
 * be drawn at the same zoom — so it is kept and the layer filters on it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'assets', 'earth');
const CACHE_DIR = join(here, '..', '.cache');

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

interface Feature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

async function fetchGeoJson(name: string): Promise<{ features: Feature[] }> {
  const cached = join(CACHE_DIR, `${name}.geojson`);
  if (!existsSync(cached)) {
    console.log(`  fetching ${name} from Natural Earth...`);
    const response = await fetch(`${BASE}/${name}.geojson`);
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
  }
  return JSON.parse(readFileSync(cached, 'utf8'));
}

/** Drops every property the renderer will not read. Most of the file weight is metadata. */
function slim(features: Feature[], keep: readonly string[]): Feature[] {
  return features.map((feature) => {
    const properties: Record<string, unknown> = {};
    for (const key of keep) {
      if (feature.properties[key] !== undefined) properties[key] = feature.properties[key];
    }
    return { type: 'Feature', properties, geometry: feature.geometry };
  });
}

export async function buildHydro(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const sources = [
    { name: 'ne_10m_rivers_lake_centerlines', out: 'rivers-10m', keep: ['scalerank', 'name'] },
    { name: 'ne_10m_lakes', out: 'lakes-10m', keep: ['scalerank', 'name'] },
  ] as const;

  for (const { name, out, keep } of sources) {
    const source = await fetchGeoJson(name);
    const collection = {
      type: 'FeatureCollection',
      features: slim(source.features, keep),
    };

    const gz = gzipSync(Buffer.from(JSON.stringify(collection)), { level: 9 });
    const file = `${out}.geojson.gz`;
    writeFileSync(join(OUT_DIR, file), gz);

    writeFileSync(
      join(OUT_DIR, `${out}.json`),
      `${JSON.stringify(
        {
          file,
          features: collection.features.length,
          bytes: gz.length,
          sha256: createHash('sha256').update(gz).digest('hex'),
          attribution: 'Natural Earth (public domain)',
        },
        null,
        2,
      )}\n`,
    );

    console.log(
      `  ${file.padEnd(22)} ${(gz.length / 1024).toFixed(1)} KB gz  ${collection.features.length} features`,
    );
  }
}
