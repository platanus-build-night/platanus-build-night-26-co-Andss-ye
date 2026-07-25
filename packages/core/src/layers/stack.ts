import type { Body } from '../body.js';
import type { CameraState } from '../camera/state.js';
import type { Layer } from './types.js';

export interface LayerPosition {
  readonly before?: string;
  readonly after?: string;
}

/**
 * Ordered set of layers. The order is the one in docs/ARCHITECTURE.md — ocean, relief,
 * contours, landmask, hydro, ... then point layers, then labels and HUD — and it matters:
 * later geometry layers overwrite earlier declarations in the sample buffer.
 */
export class LayerStack {
  private layers: Layer[] = [];
  private version = 0;

  constructor(initial: readonly Layer[] = []) {
    this.layers = [...initial];
  }

  /**
   * Bumped whenever the set of layers changes. The geometry cache keys on this, so adding a
   * layer invalidates cached glyphs without the caller having to remember to say so.
   * A layer that loads data asynchronously should call `touch()` when it arrives.
   */
  get revision(): number {
    return this.version;
  }

  /** Marks the stack as changed — for a layer whose *contents* changed, not the set. */
  touch(): void {
    this.version++;
  }

  get all(): readonly Layer[] {
    return this.layers;
  }

  get(id: string): Layer | undefined {
    return this.layers.find((layer) => layer.id === id);
  }

  /** User layers default to just before `labels`, per docs/ARCHITECTURE.md. */
  add(layer: Layer, position: LayerPosition = {}): void {
    this.version++;
    const anchor = position.before ?? position.after;
    if (!anchor) {
      this.layers.push(layer);
      return;
    }

    const index = this.layers.findIndex((existing) => existing.id === anchor);
    if (index === -1) {
      this.layers.push(layer);
      return;
    }

    this.layers.splice(position.after ? index + 1 : index, 0, layer);
  }

  remove(id: string): void {
    this.version++;
    this.layers = this.layers.filter((layer) => layer.id !== id);
  }

  /** Layers that apply to this body and are visible at this altitude, in order. */
  active(camera: CameraState, body: Body, kind?: Layer['kind']): Layer[] {
    return this.layers.filter(
      (layer) =>
        (kind === undefined || layer.kind === kind) &&
        (layer.appliesTo?.(body) ?? true) &&
        layer.visibleAt(camera, body),
    );
  }
}
