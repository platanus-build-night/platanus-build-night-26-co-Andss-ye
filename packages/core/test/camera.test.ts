import { describe, expect, it } from 'vitest';
import { Camera } from '../src/camera/camera.js';
import {
  MAX_ALT_KM,
  MIN_ALT_KM,
  createCameraState,
  normalizeCameraState,
  wrapBearing,
  wrapLon,
} from '../src/camera/state.js';

describe('camera state normalization', () => {
  it('wraps longitude into [-180, 180)', () => {
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(540)).toBe(-180);
  });

  it('does not accumulate when panning many times around the body', () => {
    let lon = 0;
    for (let i = 0; i < 100; i++) lon = wrapLon(lon + 37);
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThan(180);
  });

  it('wraps bearing into [0, 360)', () => {
    expect(wrapBearing(0)).toBe(0);
    expect(wrapBearing(370)).toBe(10);
    expect(wrapBearing(-90)).toBe(270);
  });

  it('clamps latitude instead of wrapping it, so the view never flips over a pole', () => {
    expect(normalizeCameraState(createCameraState('b', { lat: 120 })).lat).toBe(90);
    expect(normalizeCameraState(createCameraState('b', { lat: -120 })).lat).toBe(-90);
  });

  it('clamps altitude to the documented range', () => {
    expect(createCameraState('b', { altitudeKm: 0 }).altitudeKm).toBe(MIN_ALT_KM);
    expect(createCameraState('b', { altitudeKm: 1e9 }).altitudeKm).toBe(MAX_ALT_KM);
  });

  it('requires a bodyId rather than defaulting to one', () => {
    expect(createCameraState('moon').bodyId).toBe('moon');
  });
});

describe('Camera', () => {
  it('starts with current equal to target', () => {
    const camera = new Camera('test-body', { altitudeKm: 500 });
    expect(camera.state).toEqual(camera.target);
    expect(camera.isSettled).toBe(true);
  });

  it('set() moves the target and normalizes it', () => {
    const camera = new Camera('test-body');
    camera.set({ lon: 200, altitudeKm: 1e9 });
    expect(camera.target.lon).toBe(-160);
    expect(camera.target.altitudeKm).toBe(MAX_ALT_KM);
  });

  it('update() eases current toward target rather than snapping', () => {
    const camera = new Camera('test-body', { altitudeKm: 20_000 });
    camera.set({ altitudeKm: 400 });

    camera.update(16);
    expect(camera.state.altitudeKm).toBeLessThan(20_000);
    expect(camera.state.altitudeKm).toBeGreaterThan(400);

    for (let i = 0; i < 200; i++) camera.update(16);
    expect(camera.state.altitudeKm).toBeCloseTo(400, 6);
    expect(camera.isSettled).toBe(true);
  });

  it('jumpTo() sets both at once', () => {
    const camera = new Camera('test-body');
    camera.jumpTo({ lat: 45 });
    expect(camera.state.lat).toBe(45);
    expect(camera.isSettled).toBe(true);
  });

  it('exposes the body it is bound to', () => {
    expect(new Camera('some-body').bodyId).toBe('some-body');
  });
});
