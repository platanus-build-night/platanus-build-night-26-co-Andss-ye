import { PALETTE, type Palette } from '@glyphsphere/core';

/**
 * Earth's orbital palette — the default theme from docs/AESTHETIC.md. It is the base palette
 * as-is today; it lives behind `earth.palette` so a body with no water or atmosphere (the Moon)
 * can ship a different one without touching core.
 */
export const EARTH_PALETTE: Palette = PALETTE;
