/**
 * `versor` ships no types. Only the quaternion helpers docs/CAMERA.md uses are declared.
 */
declare module 'versor' {
  export type Quaternion = [number, number, number, number];
  export type Cartesian = [number, number, number];
  export type Angles = [number, number, number];

  interface Versor {
    /** Quaternion for a [lambda, phi, gamma] rotation, in degrees. */
    (angles: readonly number[]): Quaternion;
    /** Unit vector for a [lon, lat] point, in degrees. */
    cartesian(lonLat: readonly number[]): Cartesian;
    /** Quaternion rotating v0 onto v1. */
    delta(v0: readonly number[], v1: readonly number[], alpha?: number): Quaternion;
    multiply(a: readonly number[], b: readonly number[]): Quaternion;
    /** Quaternion back to [lambda, phi, gamma] degrees. */
    rotation(q: readonly number[]): Angles;
    interpolate(a: readonly number[], b: readonly number[]): (t: number) => Angles;
  }

  const versor: Versor;
  export default versor;
}
