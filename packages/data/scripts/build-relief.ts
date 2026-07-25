/**
 * Builds the elevation heightmap, per docs/DATA.md.
 *
 * Source is NOAA's ETOPO1 ice-surface mosaic — the dataset the doc names — served by an
 * ImageServer that resamples on request. That matters: the full ETOPO1 GeoTIFF is a 322 MB
 * download, and asking for exactly the grid we need avoids it entirely.
 *
 * Format notes against the doc's spec:
 * - Equirectangular, 16-bit, elevation in metres, no baked shading. As specified.
 * - Stored as raw Int16 rather than a 16-bit PNG. A browser can only decode PNG through
 *   canvas, which hands back 8-bit channels and would throw away half the precision the
 *   16 bits exist for. Raw Int16 also keeps the loader DOM-free, so it works in a worker
 *   and in Node.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTiledTiff16, type Raster16 } from './tiff.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'assets', 'earth');
const CACHE_DIR = join(here, '..', '.cache');

/** docs/DATA.md: equirectangular 4096 x 2048. */
const WIDTH = 4096;
const HEIGHT = 2048;

const SERVICE =
  'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/ETOPO1_ice_surface/ImageServer';

function requestUrl(): string {
  const params = new URLSearchParams({
    bbox: '-180,-90,180,90',
    bboxSR: '4326',
    imageSR: '4326',
    size: `${WIDTH},${HEIGHT}`,
    format: 'tiff',
    pixelType: 'S16',
    interpolation: 'RSP_BilinearInterpolation',
    f: 'image',
  });
  return `${SERVICE}/exportImage?${params}`;
}

async function fetchTiff(): Promise<Buffer> {
  const cached = join(CACHE_DIR, `etopo1-${WIDTH}x${HEIGHT}.tif`);
  if (existsSync(cached)) {
    console.log(`  using cached ${cached}`);
    return readFileSync(cached);
  }

  console.log(`  fetching ${WIDTH}x${HEIGHT} from NOAA ETOPO1...`);
  const response = await fetch(requestUrl());
  if (!response.ok) throw new Error(`NOAA returned ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  // A service error comes back as JSON with a 200, so check we really got an image.
  if (buffer.readUInt16LE(0) !== 0x4949) {
    throw new Error(`expected TIFF, got: ${buffer.subarray(0, 200).toString('utf8')}`);
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cached, buffer);
  return buffer;
}

/**
 * Row-wise delta, then split into high and low byte planes.
 *
 * Elevation is spatially correlated, so a row delta is usually small; splitting the planes
 * then puts all the smooth high bytes together, away from the noisy low ones. Raw Int16 gzips
 * to 12.7 MB, this to 8.4 MB, for a few lines and no loss of precision.
 */
function encode(raster: Raster16): Buffer {
  const { width, height, data } = raster;
  const count = width * height;
  const out = Buffer.alloc(count * 2);

  for (let y = 0; y < height; y++) {
    let previous = 0;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const value = data[index]!;
      const delta = value - previous;
      previous = value;
      out[index] = (delta >> 8) & 0xff; // high plane
      out[count + index] = delta & 0xff; // low plane
    }
  }
  return out;
}

export async function buildRelief(): Promise<void> {
  const raster = decodeTiledTiff16(await fetchTiff());

  let min = Infinity;
  let max = -Infinity;
  for (const value of raster.data) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const gz = gzipSync(encode(raster), { level: 9 });
  const file = 'relief-etopo1.bin.gz';
  writeFileSync(join(OUT_DIR, file), gz);

  const meta = {
    file,
    width: raster.width,
    height: raster.height,
    encoding: 'row-delta-byte-planes-gzip',
    projection: 'equirectangular',
    units: 'metres',
    elevationRangeM: [min, max],
    bytes: gz.length,
    sha256: createHash('sha256').update(gz).digest('hex'),
    attribution: 'NOAA NCEI ETOPO1 Ice Surface (public domain)',
  };
  writeFileSync(join(OUT_DIR, 'relief.json'), `${JSON.stringify(meta, null, 2)}\n`);

  console.log(
    `  ${file.padEnd(22)} ${(gz.length / 1024 / 1024).toFixed(1)} MB gz` +
      `  range ${min}..${max} m`,
  );
}
