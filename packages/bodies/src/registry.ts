import type { Body } from '@glyphsphere/core';
import { earth } from './earth/profile.js';

/**
 * Lookup by id, so a CameraState's `bodyId` can be resolved back to a profile. One entry today;
 * the point is that nothing downstream has to name Earth to find a body.
 */
const BODIES = new Map<string, Body>([[earth.id, earth]]);

export function getBody(id: string): Body | undefined {
  return BODIES.get(id);
}

export function registerBody(body: Body): void {
  BODIES.set(body.id, body);
}

export function allBodies(): readonly Body[] {
  return [...BODIES.values()];
}
