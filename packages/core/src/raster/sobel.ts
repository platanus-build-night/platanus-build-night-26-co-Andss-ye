/**
 * Sobel gradient over a subcell channel. Used to tell a *clean* area edge — a straight or
 * gently curving coast — from a ragged one. A clean edge draws better as a directional glyph
 * that traces the slope; a ragged one draws better as a quadrant that reports coverage
 * (docs/RENDERING.md, paso 2).
 */
import type { SampleChannel } from './sample-buffer.js';

export interface Gradient {
  /** Magnitude, normalized to roughly [0, 1] for a hard full-scale edge. */
  readonly magnitude: number;
  /** Direction of increase, radians, atan2(gy, gx). */
  readonly angleRad: number;
}

/** Samples with edge clamping, so the border of the buffer doesn't fabricate a gradient. */
function at(channel: SampleChannel, width: number, height: number, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return channel[cy * width + cx]!;
}

/**
 * `fullScale` is the channel value a hard step edge spans — 255 for a mask, and a terrain
 * relief in metres for the elevation channel. It has to be given rather than assumed: elevation
 * stopped being a 0-255 byte when sea level turned out not to survive the quantization, and a
 * gradient normalized against the wrong scale silently reports every slope as flat.
 */
export function sobelAt(
  channel: SampleChannel,
  width: number,
  height: number,
  x: number,
  y: number,
  fullScale = 255,
): Gradient {
  const tl = at(channel, width, height, x - 1, y - 1);
  const tc = at(channel, width, height, x, y - 1);
  const tr = at(channel, width, height, x + 1, y - 1);
  const ml = at(channel, width, height, x - 1, y);
  const mr = at(channel, width, height, x + 1, y);
  const bl = at(channel, width, height, x - 1, y + 1);
  const bc = at(channel, width, height, x, y + 1);
  const br = at(channel, width, height, x + 1, y + 1);

  const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
  const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);

  return {
    // 4 * fullScale is |Sobel| of a perfect step edge, per axis.
    magnitude: Math.min(1, Math.hypot(gx, gy) / (4 * fullScale)),
    angleRad: Math.atan2(gy, gx),
  };
}
