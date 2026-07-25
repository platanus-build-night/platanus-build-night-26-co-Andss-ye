import type { GlyphSampler } from '@glyphsphere/core';

/**
 * Rasterizes glyphs with an offscreen canvas so @glyphsphere/core can measure density and
 * detect missing coverage without ever touching the DOM itself (core/src/charset/atlas.ts
 * just consumes the resulting alpha buffers).
 */
export function createCanvasGlyphSampler(font: string, cellW: number, cellH: number): GlyphSampler {
  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable for glyph sampling');

  ctx.font = `${cellH}px ${font}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';

  return (codepoint) => {
    ctx.clearRect(0, 0, cellW, cellH);
    ctx.fillText(String.fromCodePoint(codepoint), 0, 0);
    const { data } = ctx.getImageData(0, 0, cellW, cellH);
    const alpha = new Uint8ClampedArray(cellW * cellH);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
    return { width: cellW, height: cellH, alpha };
  };
}
