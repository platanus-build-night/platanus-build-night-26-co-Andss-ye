/**
 * The Body contract itself is declared in @glyphsphere/core (core's own Projection and Layer
 * signatures need it, and core may not depend on this package). It is re-exported here so
 * that consumers have one obvious import site for everything body-related.
 */
export type {
  Body,
  ElevationBand,
  AtmosphereSpec,
  RotationSpec,
  DatasetManifest,
} from '@glyphsphere/core';
