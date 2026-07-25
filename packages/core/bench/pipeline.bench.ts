/**
 * Per-stage timings against the budget in docs/RENDERING.md (~9 ms total for 240x70).
 * Run with `pnpm bench`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Relative, not by package name: core must not depend on the workspace, not even in devDeps
// (docs/ARCHITECTURE.md). A benchmark needs a real body and real layers to mean anything, so
// it reaches across the tree directly rather than declaring a dependency cycle.
import { earth } from '../../bodies/src/index.js';
import { defaultLayers, parseLandTopology } from '../../layers/src/index.js';
import {
  Grid,
  LayerStack,
  createPipeline,
  createSampleBuffer,
  createSampleContext,
  createViewMetrics,
  createCameraState,
  buildProjection,
  paintBodySilhouette,
  reduce,
  singleBodyScene,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', '..', 'data', 'assets', 'earth');

const COLS = 240;
const ROWS = 70;
const ITERATIONS = 30;

function loadLand(file: string) {
  return parseLandTopology(JSON.parse(readFileSync(join(assets, file), 'utf8')), 'land');
}

function time(label: string, budgetMs: number, fn: () => void): void {
  for (let i = 0; i < 5; i++) fn(); // warm up the JIT
  const started = performance.now();
  for (let i = 0; i < ITERATIONS; i++) fn();
  const ms = (performance.now() - started) / ITERATIONS;
  const verdict = ms <= budgetMs ? 'ok' : 'OVER';
  console.log(`  ${label.padEnd(34)} ${ms.toFixed(2).padStart(7)} ms  (budget ${budgetMs}) ${verdict}`);
}

/**
 * Each dataset is measured at the altitude the LOD ladder actually assigns it
 * (docs/CAMERA.md). Benchmarking land-50m at globe view would measure a combination LOD never
 * produces, and would overstate the cost: the closer the camera, the more geometry d3 clips
 * away before it reaches the rasterizer.
 */
const CASES = [
  { dataset: 'land-110m.topo.json', altitudeKm: 20_000, lod: 'L0-L1' },
  { dataset: 'land-50m.topo.json', altitudeKm: 4_000, lod: 'L2-L3' },
] as const;

for (const { dataset, altitudeKm, lod } of CASES) {
  console.log(`\n${dataset}  ${lod} @ ${altitudeKm} km  ${COLS}x${ROWS}`);

  const land = loadLand(dataset);
  const stack = new LayerStack(defaultLayers(earth, { land }));
  const scene = singleBodyScene(earth);
  const view = createViewMetrics(COLS, ROWS);
  const camera = createCameraState(earth.id, { lon: 10, lat: 45, altitudeKm });
  const grid = new Grid(COLS, ROWS);
  const pipeline = createPipeline(COLS, ROWS);

  const projection = buildProjection(earth, camera, view);
  const buffer = createSampleBuffer(COLS, ROWS);
  const ctx = createSampleContext(buffer, projection, earth, camera);
  const registers = { registers: new Uint8Array(COLS * ROWS) };

  time('build projection', 0.1, () => buildProjection(earth, camera, view));
  time('body silhouette', 1.0, () => paintBodySilhouette(buffer, projection));
  time('paint layers', 3.5, () => {
    for (const layer of stack.active(camera, earth, 'geometry')) layer.paint?.(ctx, earth);
  });
  time('reduce to glyphs', 3.0, () => reduce(buffer, grid, earth, {}, registers));

  // Invalidated each iteration: without it every repeat is a cache hit and the benchmark
  // reports the cost of a memcpy instead of the cost of a frame.
  time('full frame (moving camera)', 9.0, () => {
    pipeline.invalidate();
    pipeline.render({ scene, camera, view, grid, stack });
  });

  // The still-camera path, which is what runs while nothing moves.
  time('full frame (still camera)', 1.0, () =>
    pipeline.render({ scene, camera, view, grid, stack }),
  );
}
