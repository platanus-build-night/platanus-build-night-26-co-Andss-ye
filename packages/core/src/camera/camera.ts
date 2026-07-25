import {
  createCameraState,
  normalizeCameraState,
  type CameraState,
} from './state.js';
import { ROTATION_TIME_CONSTANT_MS, dampAltitude, dampAngle } from './damping.js';
import { planFlight, type Flight, type FlyOptions } from './fly-to.js';
import type { Body } from '../body.js';

export interface CameraOptions {
  /**
   * Skip damping and move instantly. Set this from `prefers-reduced-motion`: interaction is
   * unchanged, only the easing goes away (docs/AESTHETIC.md).
   */
  readonly reducedMotion?: boolean;
}

/**
 * Holds the camera. Per docs/CAMERA.md the camera never jumps: every mutation goes to a
 * **target** state, and the **current** state chases it. Both exist from day one because
 * introducing the split later means touching every call site.
 */
export class Camera {
  private targetState: CameraState;
  private currentState: CameraState;

  /** Public so a media-query listener can flip it at runtime. */
  reducedMotion: boolean;

  private flight: { plan: Flight; elapsedMs: number; resolve: () => void } | null = null;

  constructor(
    bodyId: string,
    initial: Partial<Omit<CameraState, 'bodyId'>> = {},
    options: CameraOptions = {},
  ) {
    this.targetState = createCameraState(bodyId, initial);
    this.currentState = { ...this.targetState };
    this.reducedMotion = options.reducedMotion ?? false;
  }

  /** What to render this frame. */
  get state(): Readonly<CameraState> {
    return this.currentState;
  }

  /** Where the camera is heading. Input handlers write here. */
  get target(): Readonly<CameraState> {
    return this.targetState;
  }

  get bodyId(): string {
    return this.currentState.bodyId;
  }

  /** Moves the target. Values are normalized (lon wraps, lat clamps, altitude clamps). */
  set(partial: Partial<CameraState>): void {
    // Any direct input cancels a flight in progress: the person has taken the controls back.
    this.cancelFlight();
    this.targetState = normalizeCameraState({ ...this.targetState, ...partial });
  }

  /**
   * Flies to a location along an arc — climb, travel, descend — instead of easing straight
   * there. This is what makes crossing the planet take a moment rather than a minute of
   * scrolling, and it is the documented behaviour in docs/CAMERA.md.
   */
  flyTo(
    target: Partial<Pick<CameraState, 'lon' | 'lat' | 'altitudeKm'>>,
    body: Body,
    options: FlyOptions = {},
  ): Promise<void> {
    this.cancelFlight();

    // With reduced motion the flight is the animation, so there is nothing to animate.
    if (this.reducedMotion) {
      this.jumpTo(target);
      return Promise.resolve();
    }

    const plan = planFlight(this.currentState, target, body, options);
    return new Promise<void>((resolve) => {
      this.flight = { plan, elapsedMs: 0, resolve };
    });
  }

  get isFlying(): boolean {
    return this.flight !== null;
  }

  private cancelFlight(): void {
    this.flight?.resolve();
    this.flight = null;
  }

  /** Sets target and current at once — no interpolation. For initial placement and tests. */
  jumpTo(partial: Partial<CameraState>): void {
    this.set(partial);
    this.currentState = { ...this.targetState };
  }

  /**
   * Advances `current` toward `target` by one frame. Exponential damping, per docs/CAMERA.md:
   * 90 ms for altitude, 60 ms for rotation.
   */
  update(dtMs: number): void {
    // A flight drives both states directly: it already describes the whole path, so damping
    // it a second time would fight the easing and undershoot the destination.
    if (this.flight) {
      const { plan, resolve } = this.flight;
      this.flight.elapsedMs += dtMs;
      const t = Math.min(1, this.flight.elapsedMs / plan.durationMs);

      this.targetState = normalizeCameraState({ ...this.targetState, ...plan.at(t) });
      this.currentState = { ...this.targetState };

      if (t >= 1) {
        this.flight = null;
        resolve();
      }
      return;
    }

    const target = this.targetState;
    const current = this.currentState;

    // Changing body is a cut, not a move: there is no meaningful path between two bodies.
    if (this.reducedMotion || current.bodyId !== target.bodyId) {
      this.currentState = { ...target };
      return;
    }

    // Normalized after damping, not before: crossing the +-180 seam legitimately produces 181,
    // and without wrapping it back `current` could never equal a target stored as -179, so the
    // camera would never report itself settled and the render loop would never idle.
    this.currentState = normalizeCameraState({
      bodyId: target.bodyId,
      lon: dampAngle(current.lon, target.lon, dtMs, ROTATION_TIME_CONSTANT_MS),
      lat: dampAngle(current.lat, target.lat, dtMs, ROTATION_TIME_CONSTANT_MS),
      altitudeKm: dampAltitude(current.altitudeKm, target.altitudeKm, dtMs),
      bearingDeg: dampAngle(current.bearingDeg, target.bearingDeg, dtMs, ROTATION_TIME_CONSTANT_MS),
    });
  }

  /** True while current has not caught up with target. */
  get isSettled(): boolean {
    if (this.flight) return false;
    const a = this.currentState;
    const b = this.targetState;
    return (
      a.bodyId === b.bodyId &&
      a.lon === b.lon &&
      a.lat === b.lat &&
      a.altitudeKm === b.altitudeKm &&
      a.bearingDeg === b.bearingDeg
    );
  }
}
