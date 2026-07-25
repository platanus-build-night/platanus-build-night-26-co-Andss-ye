import { describe, expect, it } from 'vitest';
import {
  LINE_CLASS,
  SUB_X,
  SUB_Y,
  createSampleBuffer,
  fillRings,
  strokeRings,
} from '../src/raster/sample-buffer.js';

/** Rectangle as a closed ring, flat [x,y,...]. */
function rect(x0: number, y0: number, x1: number, y1: number): number[] {
  return [x0, y0, x1, y0, x1, y1, x0, y1];
}

function countSet(channel: Uint8Array): number {
  let n = 0;
  for (const v of channel) if (v !== 0) n++;
  return n;
}

describe('createSampleBuffer', () => {
  it('is sized to the braille subcell grid', () => {
    const buffer = createSampleBuffer(10, 5);
    expect(buffer.width).toBe(10 * SUB_X);
    expect(buffer.height).toBe(5 * SUB_Y);
    expect(buffer.coverage.length).toBe(buffer.width * buffer.height);
  });

  it('clear() resets every channel', () => {
    const buffer = createSampleBuffer(4, 4);
    buffer.coverage.fill(255);
    buffer.lineMask.fill(255);
    buffer.bodyMask.fill(255);
    buffer.clear();
    expect(countSet(buffer.coverage)).toBe(0);
    expect(countSet(buffer.lineMask)).toBe(0);
    expect(countSet(buffer.bodyMask)).toBe(0);
  });
});

describe('fillRings', () => {
  const W = 20;
  const H = 20;

  it('fills a rectangle at the right size and place', () => {
    const target = new Uint8Array(W * H);
    fillRings([rect(4, 4, 12, 10)], target, W, H);

    expect(countSet(target)).toBe(8 * 6);
    expect(target[6 * W + 6]).toBe(255); // inside
    expect(target[2 * W + 6]).toBe(0); // above
    expect(target[6 * W + 15]).toBe(0); // right
  });

  // Nonzero winding, the rule GeoJSON and d3 actually use: a hole is wound against its outer
  // ring, so it subtracts, while a ring wound *with* it adds instead of cancelling.
  it('subtracts a hole wound against its outer ring', () => {
    const outer = rect(2, 2, 18, 18); // clockwise as written
    const hole = [6, 6, 6, 12, 12, 12, 12, 6]; // counter-clockwise

    const target = new Uint8Array(W * H);
    fillRings([outer, hole], target, W, H);
    expect(target[9 * W + 9]).toBe(0); // inside the hole
    expect(target[3 * W + 3]).toBe(255); // inside the outer ring, outside the hole
    expect(countSet(target)).toBe(16 * 16 - 6 * 6);
  });

  /**
   * Regression: d3 emits the clip circle once per polygon that contains the camera, so two
   * identically-wound rings can cover the same area. Under even-odd they cancelled and the
   * whole view flipped to ocean whenever you descended into the middle of a continent.
   */
  it('keeps overlapping rings of the same winding filled', () => {
    const target = new Uint8Array(W * H);
    fillRings([rect(2, 2, 18, 18), rect(2, 2, 18, 18)], target, W, H);
    expect(target[9 * W + 9]).toBe(255);
    expect(countSet(target)).toBe(16 * 16);
  });

  it('a nested same-wound ring does not punch a hole', () => {
    const target = new Uint8Array(W * H);
    fillRings([rect(2, 2, 18, 18), rect(6, 6, 12, 12)], target, W, H);
    expect(target[9 * W + 9]).toBe(255); // still solid
    expect(countSet(target)).toBe(16 * 16);
  });

  it('clips to the buffer instead of writing out of bounds', () => {
    const target = new Uint8Array(W * H);
    expect(() => fillRings([rect(-50, -50, 50, 50)], target, W, H)).not.toThrow();
    expect(countSet(target)).toBe(W * H);
  });

  it('ignores degenerate rings', () => {
    const target = new Uint8Array(W * H);
    fillRings([[1, 1], [1, 1, 5, 5]], target, W, H);
    expect(countSet(target)).toBe(0);
  });

  it('writes the value it is given, for non-binary channels like elevation', () => {
    const target = new Uint8Array(W * H);
    fillRings([rect(4, 4, 8, 8)], target, W, H, 143);
    expect(target[6 * W + 6]).toBe(143);
  });
});

describe('strokeRings', () => {
  const W = 20;
  const H = 20;

  it('draws a connected outline with no gaps', () => {
    const mask = new Uint8Array(W * H);
    const classes = new Uint8Array(W * H);
    strokeRings([rect(4, 4, 12, 4)], mask, classes, W, H, LINE_CLASS.COAST);

    for (let x = 4; x <= 12; x++) expect(mask[4 * W + x]).toBe(255);
  });

  it('records the line class alongside the mask', () => {
    const mask = new Uint8Array(W * H);
    const classes = new Uint8Array(W * H);
    strokeRings([[2, 2, 8, 2]], mask, classes, W, H, LINE_CLASS.RIVER, 1, [false]);
    expect(classes[2 * W + 5]).toBe(LINE_CLASS.RIVER);
  });

  it('leaves a diagonal unbroken', () => {
    const mask = new Uint8Array(W * H);
    const classes = new Uint8Array(W * H);
    strokeRings([[2, 2, 12, 12]], mask, classes, W, H, LINE_CLASS.COAST, 1, [false]);
    for (let i = 2; i <= 12; i++) expect(mask[i * W + i]).toBe(255);
  });

  it('widens by whole subcells', () => {
    const thin = new Uint8Array(W * H);
    const thick = new Uint8Array(W * H);
    const classes = new Uint8Array(W * H);
    strokeRings([[2, 10, 16, 10]], thin, classes, W, H, LINE_CLASS.COAST, 1, [false]);
    strokeRings([[2, 10, 16, 10]], thick, classes, W, H, LINE_CLASS.COAST, 3, [false]);
    expect(countSet(thick)).toBeGreaterThan(countSet(thin));
  });

  it('an open line does not close back on itself', () => {
    const open = new Uint8Array(W * H);
    const closed = new Uint8Array(W * H);
    const classes = new Uint8Array(W * H);
    const path = [4, 4, 12, 4, 12, 10];
    strokeRings([path], open, classes, W, H, LINE_CLASS.COAST, 1, [false]);
    strokeRings([path], closed, classes, W, H, LINE_CLASS.COAST, 1, [true]);
    expect(countSet(closed)).toBeGreaterThan(countSet(open));
  });

  it('does not write out of bounds', () => {
    const mask = new Uint8Array(W * H);
    const classes = new Uint8Array(W * H);
    expect(() =>
      strokeRings([[-100, -100, 100, 100]], mask, classes, W, H, LINE_CLASS.COAST, 1, [false]),
    ).not.toThrow();
  });
});
