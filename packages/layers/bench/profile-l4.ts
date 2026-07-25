/** Per-layer cost of one L4 frame with every real dataset loaded. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { earth } from '../../bodies/src/index.js';
import {
  defaultLayers,
  parseLandTopology,
  decodePlaces,
  decodeHeightmap,
} from '../src/index.js';
import {
  Grid,
  LayerStack,
  createSampleBuffer,
  createSampleContext,
  createViewMetrics,
  createCameraState,
  buildProjection,
  paintBodySilhouette,
  reduce,
} from '../../core/src/index.js';
import { mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

const assets = '../data/assets/earth';
const COLS = 240;
const ROWS = 70;
const N = 20;

const json = (f: string) => JSON.parse(readFileSync(join(assets, f), 'utf8'));
const gz = (f: string) => gunzipSync(readFileSync(join(assets, f)));

const land = parseLandTopology(json('land-10m.topo.json'), 'land');
const countries = json('countries-50m.topo.json') as Topology;
const borders = mesh(countries, countries.objects.countries as GeometryCollection, (a, b) => a !== b);
const rivers = JSON.parse(new TextDecoder().decode(gz('rivers-10m.geojson.gz')));
const lakes = JSON.parse(new TextDecoder().decode(gz('lakes-10m.geojson.gz')));
const places = decodePlaces(new Uint8Array(gz('places-10m.bin.gz')), json('places.json'));
const heightmap = decodeHeightmap(new Uint8Array(gz('relief-etopo1.bin.gz')), json('relief.json'));

console.log(
  `rivers ${rivers.features.length}  lakes ${lakes.features.length}  ` +
    `places ${places.all.length}  land polys ${land.polygons.length}`,
);

const layers = defaultLayers(earth, { land, heightmap, borders, rivers, lakes, places });
const stack = new LayerStack(layers);
const view = createViewMetrics(COLS, ROWS);
const grid = new Grid(COLS, ROWS);
const buffer = createSampleBuffer(COLS, ROWS);

for (const altitudeKm of [400, 150, 60, 20]) {
  const camera = createCameraState(earth.id, { lon: -80.19, lat: 25.77, altitudeKm });
  const projection = buildProjection(earth, camera, view);
  const ctx = createSampleContext(buffer, projection, earth, camera);

  console.log(`\n--- ${altitudeKm} km sobre Miami ---`);
  let total = 0;
  for (const layer of stack.active(camera, earth, 'geometry')) {
    buffer.clear();
    paintBodySilhouette(buffer, projection);
    for (let i = 0; i < 3; i++) layer.paint?.(ctx, earth);
    const t0 = performance.now();
    for (let i = 0; i < N; i++) layer.paint?.(ctx, earth);
    const ms = (performance.now() - t0) / N;
    total += ms;
    console.log(`  ${layer.id.padEnd(12)} ${ms.toFixed(2).padStart(8)} ms`);
  }

  buffer.clear();
  paintBodySilhouette(buffer, projection);
  for (const layer of stack.active(camera, earth, 'geometry')) layer.paint?.(ctx, earth);
  for (let i = 0; i < 3; i++) reduce(buffer, grid, earth);
  const t1 = performance.now();
  for (let i = 0; i < N; i++) reduce(buffer, grid, earth);
  const rms = (performance.now() - t1) / N;
  total += rms;
  console.log(`  ${'reduce'.padEnd(12)} ${rms.toFixed(2).padStart(8)} ms`);
  console.log(`  ${'TOTAL'.padEnd(12)} ${total.toFixed(2).padStart(8)} ms   (presupuesto 10)`);
}
