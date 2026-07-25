/**
 * Minimal reader for the exact TIFF flavour NOAA's ImageServer returns: uncompressed, tiled,
 * single band, 16-bit signed. Not a general TIFF library — a dependency for one shape of file
 * we control the request for would be the wrong trade.
 */
const TAG = {
  IMAGE_WIDTH: 256,
  IMAGE_LENGTH: 257,
  BITS_PER_SAMPLE: 258,
  COMPRESSION: 259,
  SAMPLES_PER_PIXEL: 277,
  TILE_WIDTH: 322,
  TILE_LENGTH: 323,
  TILE_OFFSETS: 324,
  SAMPLE_FORMAT: 339,
} as const;

const SAMPLE_FORMAT_SIGNED_INT = 2;
const COMPRESSION_NONE = 1;

export interface Raster16 {
  readonly width: number;
  readonly height: number;
  readonly data: Int16Array;
}

export function decodeTiledTiff16(buffer: Buffer): Raster16 {
  if (buffer.readUInt16LE(0) !== 0x4949) {
    throw new Error('expected a little-endian TIFF');
  }

  const ifd = buffer.readUInt32LE(4);
  const entryCount = buffer.readUInt16LE(ifd);

  const values = new Map<number, number>();
  const counts = new Map<number, number>();
  for (let i = 0; i < entryCount; i++) {
    const entry = ifd + 2 + i * 12;
    const tag = buffer.readUInt16LE(entry);
    counts.set(tag, buffer.readUInt32LE(entry + 4));
    values.set(tag, buffer.readUInt32LE(entry + 8));
  }

  const need = (tag: number, name: string): number => {
    const value = values.get(tag);
    if (value === undefined) throw new Error(`TIFF is missing ${name}`);
    return value;
  };

  if (values.get(TAG.COMPRESSION) !== COMPRESSION_NONE) {
    throw new Error('only uncompressed TIFF is supported');
  }
  if (values.get(TAG.SAMPLE_FORMAT) !== SAMPLE_FORMAT_SIGNED_INT) {
    throw new Error('expected signed-integer samples (elevation in metres)');
  }
  if (values.get(TAG.BITS_PER_SAMPLE) !== 16 || values.get(TAG.SAMPLES_PER_PIXEL) !== 1) {
    throw new Error('expected a single 16-bit band');
  }

  const width = need(TAG.IMAGE_WIDTH, 'ImageWidth');
  const height = need(TAG.IMAGE_LENGTH, 'ImageLength');
  const tileWidth = need(TAG.TILE_WIDTH, 'TileWidth');
  const tileHeight = need(TAG.TILE_LENGTH, 'TileLength');

  // With one tile the offset sits inline; with several the field points at an array of them.
  const tileCount = counts.get(TAG.TILE_OFFSETS) ?? 1;
  const offsetField = need(TAG.TILE_OFFSETS, 'TileOffsets');
  const tileOffset = (index: number): number =>
    tileCount === 1 ? offsetField : buffer.readUInt32LE(offsetField + index * 4);

  const tilesAcross = Math.ceil(width / tileWidth);
  const data = new Int16Array(width * height);

  for (let y = 0; y < height; y++) {
    const tileRow = Math.floor(y / tileHeight);
    const rowInTile = y % tileHeight;
    for (let x = 0; x < width; x++) {
      const tile = tileRow * tilesAcross + Math.floor(x / tileWidth);
      const indexInTile = rowInTile * tileWidth + (x % tileWidth);
      data[y * width + x] = buffer.readInt16LE(tileOffset(tile) + indexInTile * 2);
    }
  }

  return { width, height, data };
}
