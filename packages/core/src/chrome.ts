import type { Body } from './body.js';
import { PAL } from './palette/palette.js';
import type { Projection } from './projection/projection.js';

/**
 * Vector primitives drawn outside the character grid.
 *
 * This is the **only documented exception** to "everything lives in the grid"
 * (docs/ARCHITECTURE.md), and it exists for one reason: a character cannot draw a smooth
 * curve. The limb is what turns a dump of text into a celestial body, so it is worth the
 * exception — and the list is deliberately tiny, so a renderer can implement it in a single
 * extra pass.
 */
export interface LimbRing {
  /** Centre in cell coordinates. */
  readonly centreCell: readonly [number, number];
  /** Radius in row units; the renderer applies the cell aspect. */
  readonly radiusRows: number;
  readonly paletteIndex: number;
  /** 0-1. docs/AESTHETIC.md: CHROME at 40 %, 1 physical pixel, no glow, no double ring. */
  readonly opacity: number;
}

export interface AtmosphereHalo {
  readonly centreCell: readonly [number, number];
  readonly radiusRows: number;
  readonly paletteIndex: number;
  /** Width outward from the limb, in CSS px. */
  readonly widthPx: number;
}

export interface ChromeCommands {
  readonly limb: LimbRing | null;
  readonly halo: AtmosphereHalo | null;
}

export const NO_CHROME: ChromeCommands = { limb: null, halo: null };

/** docs/AESTHETIC.md: the limb ring is CHROME at 40 %. */
const LIMB_OPACITY = 0.4;

/**
 * Builds the chrome for one body. The ring follows the clip circle exactly, so it contracts as
 * the camera pulls back and leaves the viewport as it descends — and disappears once the
 * horizon is no longer on screen, because then there is no limb to draw.
 */
export function buildChrome(projection: Projection, body: Body): ChromeCommands {
  const { view, radiusRows } = projection;
  const centreCell: [number, number] = [view.cols / 2, view.rows / 2];

  // Once the disc is larger than the viewport the horizon is off screen; a ring drawn then
  // would be an arc through the corners, which reads as an error rather than a planet.
  const halfDiagonalRows = Math.hypot((view.cols / 2) * view.cellAspect, view.rows / 2);
  if (radiusRows > halfDiagonalRows) return NO_CHROME;

  const limb: LimbRing = {
    centreCell,
    radiusRows,
    paletteIndex: PAL.CHROME,
    opacity: LIMB_OPACITY,
  };

  // A body with no atmosphere gets a hard limb. It is the most immediate visual difference
  // between Earth and the Moon, and it comes straight from the body profile.
  const halo: AtmosphereHalo | null = body.atmosphere
    ? {
        centreCell,
        radiusRows,
        paletteIndex: body.atmosphere.paletteIndex,
        widthPx: body.atmosphere.haloPx,
      }
    : null;

  return { limb, halo };
}
