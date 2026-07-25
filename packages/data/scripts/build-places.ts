/**
 * Populated places, per docs/DATA.md: "Ordenar lugares por población, con índices de corte
 * precalculados por umbral."
 *
 * Sorted by population descending and written as one compact binary. Sorting at build time is
 * what lets a layer take a prefix of the array for its LOD instead of filtering 7 300 records
 * every frame; the cut indices say where each threshold ends.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'assets', 'earth');
const CACHE_DIR = join(here, '..', '.cache');

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';

/**
 * Place categories, collapsed from Natural Earth's `featurecla`. The layer picks a glyph per
 * category, so a capital reads differently from a town at a glance.
 */
export const PLACE_CATEGORY = {
  CAPITAL: 0,
  REGIONAL_CAPITAL: 1,
  CITY: 2,
  STATION: 3,
} as const;

function categoryOf(featurecla: string): number {
  const value = featurecla.toLowerCase();
  if (value.includes('admin-0 capital')) return PLACE_CATEGORY.CAPITAL;
  if (value.includes('capital')) return PLACE_CATEGORY.REGIONAL_CAPITAL;
  if (value.includes('station')) return PLACE_CATEGORY.STATION;
  return PLACE_CATEGORY.CITY;
}

/** Population thresholds from the LOD table in docs/CAMERA.md. */
const POPULATION_CUTS = [
  { lod: 'L1', minPopulation: 5_000_000 },
  { lod: 'L2', minPopulation: 1_000_000 },
  { lod: 'L3', minPopulation: 300_000 },
  { lod: 'L4', minPopulation: 50_000 },
  { lod: 'L5', minPopulation: 5_000 },
  { lod: 'L6', minPopulation: 0 },
] as const;

/** L0 shows only the twenty biggest, which is a count rather than a threshold. */
const L0_COUNT = 20;

interface PlaceFeature {
  readonly properties: {
    readonly name: string;
    readonly pop_max: number;
    readonly featurecla: string;
    readonly adm0name?: string;
  };
  readonly geometry: { readonly coordinates: [number, number] };
}

async function fetchPlaces(): Promise<PlaceFeature[]> {
  const cached = join(CACHE_DIR, 'ne_10m_populated_places_simple.geojson');
  if (!existsSync(cached)) {
    console.log('  fetching populated places from Natural Earth...');
    const response = await fetch(SOURCE);
    if (!response.ok) throw new Error(`Natural Earth returned ${response.status}`);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
  }
  return JSON.parse(readFileSync(cached, 'utf8')).features as PlaceFeature[];
}

export async function buildPlaces(): Promise<void> {
  const features = await fetchPlaces();

  const places = features
    .filter((f) => Number.isFinite(f.geometry.coordinates[0]) && f.properties.name)
    .map((f) => ({
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      population: Math.max(0, Math.round(f.properties.pop_max || 0)),
      category: categoryOf(f.properties.featurecla ?? ''),
      name: f.properties.name,
    }))
    // Descending, so any LOD is a prefix of the array.
    .sort((a, b) => b.population - a.population);

  // Record: f32 lon, f32 lat, u32 population, u8 category, u8 nameLength, then UTF-8 name.
  const chunks: Buffer[] = [];
  for (const place of places) {
    const name = Buffer.from(place.name, 'utf8').subarray(0, 255);
    const head = Buffer.alloc(14);
    head.writeFloatLE(place.lon, 0);
    head.writeFloatLE(place.lat, 4);
    head.writeUInt32LE(place.population, 8);
    head.writeUInt8(place.category, 12);
    head.writeUInt8(name.length, 13);
    chunks.push(head, name);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const gz = gzipSync(Buffer.concat(chunks), { level: 9 });
  const file = 'places-10m.bin.gz';
  writeFileSync(join(OUT_DIR, file), gz);

  const cuts: Record<string, number> = { L0: Math.min(L0_COUNT, places.length) };
  for (const { lod, minPopulation } of POPULATION_CUTS) {
    // Sorted descending, so the first place below the threshold ends that LOD's prefix.
    const index = places.findIndex((place) => place.population < minPopulation);
    cuts[lod] = index === -1 ? places.length : index;
  }
  cuts.L7 = places.length;

  writeFileSync(
    join(OUT_DIR, 'places.json'),
    `${JSON.stringify(
      {
        file,
        count: places.length,
        encoding: 'f32 lon, f32 lat, u32 pop, u8 category, u8 nameLen, utf8 name',
        cuts,
        bytes: gz.length,
        sha256: createHash('sha256').update(gz).digest('hex'),
        attribution: 'Natural Earth populated places (public domain)',
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `  ${file.padEnd(22)} ${(gz.length / 1024).toFixed(1)} KB gz  ${places.length} lugares` +
      `  cortes L0=${cuts.L0} L2=${cuts.L2} L4=${cuts.L4}`,
  );
}
