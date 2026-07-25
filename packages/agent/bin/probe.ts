#!/usr/bin/env tsx
/**
 * The same two answers the MCP server gives, from a terminal.
 *
 * It exists so the library can be checked without an agent in the loop — if the numbers here
 * are wrong, no amount of protocol plumbing will make them right.
 *
 *   pnpm --filter @glyphsphere/agent probe 4.71 -74.07
 *   pnpm --filter @glyphsphere/agent probe 4.71 -74.07 --view 800
 */

import { earth } from '@glyphsphere/bodies';
import { describeLocation } from '../src/describe.js';
import { formatLocation, formatView } from '../src/format.js';
import { renderView } from '../src/view.js';
import { loadEarthData } from '../src/load.js';

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const lat = Number(positional[0]);
const lon = Number(positional[1]);

if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
  console.error('usage: probe <lat> <lon> [--view <altitudeKm>]');
  process.exit(1);
}

const viewFlag = argv.indexOf('--view');
const altitudeKm = viewFlag === -1 ? null : Number(argv[viewFlag + 1] ?? 2000);

const started = Date.now();
const { heightmap, places, land } = await loadEarthData();
const loadedMs = Date.now() - started;

if (altitudeKm === null) {
  const queried = Date.now();
  const description = describeLocation([lon, lat], earth, { heightmap, places, land });
  console.log(formatLocation(description));
  console.log(`\n(data ${loadedMs} ms · query ${Date.now() - queried} ms · offline)`);
} else {
  const queried = Date.now();
  const view = renderView(earth, {
    centre: [lon, lat],
    altitudeKm,
    heightmap,
    places,
    land,
  });
  console.log(formatView(view));
  console.log(`\n${view.text}`);
  console.log(`\n(data ${loadedMs} ms · frame ${Date.now() - queried} ms · offline)`);
}
