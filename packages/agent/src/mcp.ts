/**
 * An MCP server over stdio, so any agent that speaks the protocol — Claude Code, Claude
 * Desktop, Cursor, a custom SDK loop — can ask this library about the real world.
 *
 * **No SDK dependency.** MCP over stdio is JSON-RPC 2.0 in newline-delimited JSON, and the
 * three methods a tool server has to answer are below. Pulling in a package to write eighty
 * lines would break CLAUDE.md's dependency rule for no gain.
 *
 * Datasets load on the first tool call, not at startup: `initialize` has to answer promptly or
 * the client times out, and 11 MB of relief and coastline takes longer than that budget.
 */

import { createInterface } from 'node:readline';
import { earth } from '@glyphsphere/bodies';
import { describeLocation } from './describe.js';
import { formatLocation, formatView } from './format.js';
import { renderView } from './view.js';
import { loadEarthData, type EarthData } from './load.js';

const PROTOCOL_VERSION = '2024-11-05';

interface Request {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: 'describe_location',
    description:
      'Ground-truth facts about a point on Earth: land or water, elevation and terrain band, ' +
      'slope and which way it faces, distance and bearing to the nearest coast, nearby ' +
      'populated places, and the sun position. Runs offline from Natural Earth and ETOPO1 — ' +
      'no API key, no network, and the same coordinates always give the same answer.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude in degrees, -90 to 90.' },
        lon: { type: 'number', description: 'Longitude in degrees, -180 to 180.' },
        radius_km: {
          type: 'number',
          description: 'How far out to look for populated places. Default 200.',
        },
        max_places: { type: 'number', description: 'How many places to return. Default 5.' },
      },
      required: ['lat', 'lon'],
    },
  },
  {
    name: 'render_view',
    description:
      'Renders the planet as a character grid from a viewpoint above it, and reports what is ' +
      'in frame: land/water/space fractions, elevation range, and visible cities. The text ' +
      'frame is the same data describe_location reports, drawn — so a human can look at it ' +
      'and check what the model was told.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude the view is centred on.' },
        lon: { type: 'number', description: 'Longitude the view is centred on.' },
        altitude_km: {
          type: 'number',
          description: 'Camera altitude. 20000 shows the globe, 500 shows a country.',
        },
        cols: { type: 'number', description: 'Grid width in characters. Default 100.' },
        rows: { type: 'number', description: 'Grid height in characters. Default 44.' },
      },
      required: ['lat', 'lon', 'altitude_km'],
    },
  },
] as const;

let cached: EarthData | null = null;
async function data(): Promise<EarthData> {
  cached ??= await loadEarthData();
  return cached;
}

function number(params: Record<string, unknown>, key: string): number {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`"${key}" must be a number`);
  }
  return value;
}

function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  return typeof params[key] === 'number' ? (params[key] as number) : undefined;
}

async function callTool(name: string, params: Record<string, unknown>): Promise<string> {
  const { heightmap, places, land } = await data();
  const lat = number(params, 'lat');
  const lon = number(params, 'lon');

  if (name === 'describe_location') {
    const searchRadiusKm = optionalNumber(params, 'radius_km');
    const maxPlaces = optionalNumber(params, 'max_places');
    return formatLocation(
      describeLocation([lon, lat], earth, {
        heightmap,
        places,
        land,
        ...(searchRadiusKm === undefined ? {} : { searchRadiusKm }),
        ...(maxPlaces === undefined ? {} : { maxPlaces }),
      }),
    );
  }

  if (name === 'render_view') {
    const cols = optionalNumber(params, 'cols');
    const rows = optionalNumber(params, 'rows');
    const view = renderView(earth, {
      centre: [lon, lat],
      altitudeKm: number(params, 'altitude_km'),
      heightmap,
      places,
      land,
      ...(cols === undefined ? {} : { cols }),
      ...(rows === undefined ? {} : { rows }),
    });
    return `${formatView(view)}\n\n${view.text}`;
  }

  throw new Error(`unknown tool "${name}"`);
}

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(request: Request): Promise<void> {
  // A notification has no id and takes no reply — answering one is a protocol error.
  if (request.id === undefined) return;
  const id = request.id;

  try {
    if (request.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'glyphsphere', version: '0.1.0' },
        },
      });
      return;
    }

    if (request.method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }

    if (request.method === 'tools/call') {
      const params = request.params ?? {};
      const name = String(params['name'] ?? '');
      const args = (params['arguments'] ?? {}) as Record<string, unknown>;
      const text = await callTool(name, args);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      return;
    }

    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${request.method}` } });
  } catch (error) {
    // A failed tool call is reported as a result with isError, not as a JSON-RPC error: the
    // model is supposed to see the message and correct itself, and a transport error is
    // handled by the client before it ever reaches the model.
    const message = error instanceof Error ? error.message : String(error);
    send({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: `error: ${message}` }], isError: true },
    });
  }
}

export function serve(): void {
  const lines = createInterface({ input: process.stdin });

  // Requests are handled in order. Concurrency would buy nothing: the first call blocks on
  // loading the datasets and every later one is a few milliseconds of arithmetic.
  let queue: Promise<void> = Promise.resolve();

  lines.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed === '') return;

    let request: Request;
    try {
      request = JSON.parse(trimmed) as Request;
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      return;
    }

    queue = queue.then(() => handle(request));
  });
}
