import type { NavigationController } from '@glyphsphere/core';

/**
 * Binds browser events to the DOM-free NavigationController. Everything platform-specific
 * lives here; core never sees an event object.
 */
export interface BindOptions {
  /** Converts client pixels to cell coordinates. */
  readonly toCell: (clientX: number, clientY: number) => [number, number];
  /** Called whenever input changed the camera, so the host can schedule a frame. */
  readonly onChange: () => void;
}

/** Cells moved per pixel of trackpad scroll. Tuned by feel; the physical world needs a knob. */
const PAN_GAIN = 0.06;

export function bindNavigation(
  element: HTMLElement,
  nav: NavigationController,
  { toCell, onChange }: BindOptions,
): () => void {
  const pointers = new Map<number, [number, number]>();
  let spaceHeld = false;

  const setCursor = () => {
    element.style.cursor = pointers.size > 0 ? 'grabbing' : spaceHeld ? 'grab' : 'default';
  };

  // --- Mouse and touch, unified through Pointer Events ---------------------------------
  const onPointerDown = (event: PointerEvent) => {
    // Ignore the right button; it belongs to the context menu.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, toCell(event.clientX, event.clientY));

    if (pointers.size === 1) {
      nav.pointerDown([...pointers.values()][0]!);
    } else if (pointers.size === 2) {
      // A second finger turns the drag into a pinch/twist.
      nav.pointerUp();
      const [a, b] = [...pointers.values()];
      nav.gestureStart(a!, b!);
    }
    setCursor();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, toCell(event.clientX, event.clientY));

    const positions = [...pointers.values()];
    if (positions.length === 1) {
      nav.pointerMove(positions[0]!);
    } else if (positions.length >= 2) {
      nav.gestureMove(positions[0]!, positions[1]!);
    }
    onChange();
  };

  const endPointer = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);

    nav.gestureEnd();
    nav.pointerUp();

    // Dropping from two fingers to one resumes a plain drag from where the survivor is.
    const remaining = [...pointers.values()];
    if (remaining.length === 1) nav.pointerDown(remaining[0]!);
    setCursor();
  };

  // --- Wheel and trackpad ---------------------------------------------------------------
  /**
   * A trackpad pinch arrives as a wheel event with `ctrlKey` set (browsers synthesize that);
   * a two-finger swipe arrives without it. A mouse wheel reports deltaX exactly 0, so a
   * non-zero horizontal component is the reliable tell for a trackpad swipe.
   *
   * Comparing |deltaX| against |deltaY| — the obvious heuristic — breaks diagonal swipes: the
   * moment the vertical component wins, a pan turns into a zoom mid-gesture. Any horizontal
   * intent means pan, and then *both* axes are panned so diagonals track the fingers.
   */
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const cell = toCell(event.clientX, event.clientY);

    // Space held is an explicit pan request, the convention from design tools.
    const isPan = !event.ctrlKey && (event.deltaX !== 0 || spaceHeld);

    if (isPan) {
      // Scroll direction is inverted relative to camera movement: content follows the fingers.
      nav.panBy(cell, [cell[0] - event.deltaX * PAN_GAIN, cell[1] - event.deltaY * PAN_GAIN]);
    } else {
      // Shift accelerates: crossing from orbit to a street is a few flicks instead of fifty.
      nav.wheel(cell, event.deltaY, event.deltaMode, event.shiftKey);
    }
    onChange();
  };

  // --- Space as a pan modifier, the convention from design tools ------------------------
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || spaceHeld) return;
    spaceHeld = true;
    // Space scrolls the page by default, which would fight the pan.
    event.preventDefault();
    setCursor();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code !== 'Space') return;
    spaceHeld = false;
    setCursor();
  };

  /** Double-click zooms in a step toward the point clicked; with shift, out. The map-tool convention. */
  const onDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    nav.zoomSteps(toCell(event.clientX, event.clientY), event.shiftKey ? -2 : 2);
    onChange();
  };

  const preventContextMenu = (event: Event) => event.preventDefault();

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endPointer);
  element.addEventListener('pointercancel', endPointer);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('dblclick', onDoubleClick);
  element.addEventListener('contextmenu', preventContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', endPointer);
    element.removeEventListener('pointercancel', endPointer);
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('dblclick', onDoubleClick);
    element.removeEventListener('contextmenu', preventContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}
