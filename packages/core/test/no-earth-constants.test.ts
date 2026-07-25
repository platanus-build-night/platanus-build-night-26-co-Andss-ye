import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Enforces the hardest constraint in CLAUDE.md and docs/BODIES.md: **no Earth constants in
 * core**. There is no EARTH_RADIUS_KM; there is body.radiusKm. The day the Moon shows up,
 * core must not need a single edit.
 *
 * Comments are stripped before scanning: prose may explain that Earth's flattening is
 * 1/298.257, but no code path may depend on it.
 */
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Strips block and line comments so prose about Earth doesn't trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /\b6371\b/, why: "Earth's mean radius — use body.radiusKm" },
  { pattern: /\b6378\b/, why: "Earth's equatorial radius — use body.radiusKm" },
  { pattern: /\b6356\b/, why: "Earth's polar radius — use body.radiusKm" },
  { pattern: /298\.257/, why: "Earth's flattening — use body.flattening" },
  { pattern: /23\.4392/, why: "Earth's axial tilt — use body.rotation.axialTiltDeg" },
  { pattern: /23\.9344/, why: "Earth's sidereal day — use body.rotation.siderealPeriodHours" },
  { pattern: /['"`]earth['"`]/i, why: 'a literal body id — core must not name a body' },
  { pattern: /\bEARTH_[A-Z_]+\b/, why: 'an Earth-specific constant' },
];

describe('no Earth constants in core', () => {
  const files = sourceFiles(SRC_DIR);

  it('finds source files to scan (guards against a silently empty test)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN)('contains no $why', ({ pattern }) => {
    const offenders = files
      .filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC_DIR, file));

    expect(offenders).toEqual([]);
  });

  it('the scan actually detects a violation when one exists', () => {
    const violation = 'const radiusKm = 6371;';
    expect(FORBIDDEN.some(({ pattern }) => pattern.test(stripComments(violation)))).toBe(true);
  });

  it('but tolerates the same number inside a comment', () => {
    const prose = '// Earth is 6371 km, but that lives in @glyphsphere/bodies.';
    expect(FORBIDDEN.some(({ pattern }) => pattern.test(stripComments(prose)))).toBe(false);
  });
});
