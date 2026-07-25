/**
 * Compiles the Iosevka subset used by the three glyph registers (braille, quadrant, ASCII)
 * into a small woff2, per docs/AESTHETIC.md and docs/ROADMAP.md Fase 0.
 *
 * Iosevka's TTF isn't vendored in the repo (it's tens of MB); point SOURCE_FONT at a local
 * copy before running this. Grab a fixed-width build (e.g. "Iosevka" or "Iosevka Fixed",
 * regular weight) from https://github.com/be5invis/Iosevka/releases.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const here = dirname(fileURLToPath(import.meta.url));
const CHARSET_PATH = join(here, 'charset.txt');
const SOURCE_FONT = join(here, 'source', 'iosevka.ttf');
const OUT_DIR = join(here, 'dist');
const OUT_FILE = join(OUT_DIR, 'iosevka-glyphsphere.woff2');

async function main(): Promise<void> {
  if (!existsSync(SOURCE_FONT)) {
    console.error(
      [
        `No se encontró la fuente en ${SOURCE_FONT}.`,
        '',
        'Descargá un build monoespaciado de Iosevka (peso Regular) desde:',
        '  https://github.com/be5invis/Iosevka/releases',
        `y guardalo como ${SOURCE_FONT} (creá la carpeta fonts/source/ si hace falta).`,
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const charset = readFileSync(CHARSET_PATH, 'utf8');
  const sourceBuffer = readFileSync(SOURCE_FONT);

  const woff2 = await subsetFont(sourceBuffer, charset, { targetFormat: 'woff2' });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, woff2);

  console.log(`${OUT_FILE} (${(woff2.length / 1024).toFixed(1)} KB, ${charset.length} glifos)`);
}

main();
