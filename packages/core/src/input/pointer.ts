import type { Camera } from '../camera/camera.js';
import { beginDrag, dragTo, type DragState } from '../camera/drag.js';
import { MAX_ALT_KM, MIN_ALT_KM, clamp } from '../camera/state.js';
import { anchorZoom, applyZoom, zoomStep, zoomToward, ZOOM_ACCELERATION } from '../camera/wheel.js';
import type { Projection } from '../projection/projection.js';
import { describeGesture, gestureDelta, type TwoPointGesture } from './gestures.js';

/**
 * Drives a camera from pointer input. Mouse and touch are unified here: both arrive as cell
 * coordinates, and neither the browser's event objects nor the DOM appear anywhere — core has
 * to run in a worker, in Node and in React Native (CLAUDE.md).
 *
 * The host attaches listeners and converts client pixels to cells; this owns the gesture state
 * machine and the camera maths.
 */
export interface NavigationOptions {
  /** Builds a projection for the given altitude. Zoom needs to test a candidate altitude. */
  readonly projectionFor: (altitudeKm: number) => Projection;
  /** The projection for the current frame. */
  readonly currentProjection: () => Projection;
}

export class NavigationController {
  private drag: DragState | null = null;
  private gesture: TwoPointGesture | null = null;

  constructor(
    private readonly camera: Camera,
    private readonly options: NavigationOptions,
  ) {}

  get isDragging(): boolean {
    return this.drag !== null || this.gesture !== null;
  }

  /** Returns false when the press landed off the body, so the host can ignore the drag. */
  pointerDown(cellXY: readonly [number, number]): boolean {
    this.drag = beginDrag(this.options.currentProjection(), cellXY);
    return this.drag !== null;
  }

  pointerMove(cellXY: readonly [number, number]): void {
    if (!this.drag) return;
    const rotation = dragTo(this.drag, cellXY);
    // null means the cursor left the body: hold position rather than snapping somewhere.
    if (rotation) this.camera.set(rotation);
  }

  pointerUp(): void {
    this.drag = null;
  }

  /** `accelerated` is the modifier-key path, for crossing the altitude range in a hurry. */
  wheel(
    cellXY: readonly [number, number],
    deltaY: number,
    deltaMode: number,
    accelerated = false,
  ): void {
    const projection = this.options.currentProjection();
    const zoom = zoomToward(
      projection,
      cellXY,
      deltaY,
      deltaMode,
      this.options.projectionFor,
      accelerated ? ZOOM_ACCELERATION : 1,
    );
    this.camera.set(applyZoom(projection.camera, zoom));
  }

  /**
   * Discrete zoom toward a point — what a double-click does in every map tool. Negative steps
   * zoom out.
   */
  zoomSteps(cellXY: readonly [number, number], steps: number): void {
    const projection = this.options.currentProjection();
    const target = zoomStep(projection.camera.altitudeKm, steps);
    const zoom = anchorZoom(projection, cellXY, target, this.options.projectionFor);
    this.camera.set(applyZoom(projection.camera, zoom));
  }

  /**
   * Two-finger pan. Trackpad scroll and a two-finger drag are the same intent, so this reuses
   * the drag path: grab the point under the gesture and carry it. That keeps "what you touch
   * stays under your finger" true for every input device.
   */
  panBy(fromCell: readonly [number, number], toCell: readonly [number, number]): void {
    const grab = beginDrag(this.options.currentProjection(), fromCell);
    if (!grab) return;
    const rotation = dragTo(grab, toCell);
    if (rotation) this.camera.set(rotation);
  }

  gestureStart(a: readonly [number, number], b: readonly [number, number]): void {
    this.gesture = describeGesture(a, b, this.options.currentProjection().view.cellAspect);
  }

  gestureMove(a: readonly [number, number], b: readonly [number, number]): void {
    if (!this.gesture) return;

    const projection = this.options.currentProjection();
    const next = describeGesture(a, b, projection.view.cellAspect);
    const delta = gestureDelta(this.gesture, next);

    const target = this.camera.target;
    this.camera.set({
      altitudeKm: clamp(target.altitudeKm * delta.altitudeScale, MIN_ALT_KM, MAX_ALT_KM),
      bearingDeg: target.bearingDeg + delta.bearingDeltaDeg,
    });

    // Pan by the midpoint movement, so a pinch that also slides tracks the fingers.
    if (delta.panCell[0] !== 0 || delta.panCell[1] !== 0) {
      this.panBy(this.gesture.centreCell, next.centreCell);
    }

    this.gesture = next;
  }

  gestureEnd(): void {
    this.gesture = null;
  }
}
