/**
 * The instrument panel, in real type.
 *
 * It used to be written into the character grid, which meant the numbers competed with the
 * planet for cells and were held to the grid's 0.5 cell aspect — legible, but the same material
 * as the terrain. Moving it up here is the other half of the two-layer idea: the body is drawn
 * in characters because characters *mean* something there, and the readout is set in type
 * because that is what type is for.
 *
 * Rows are declared once and only their values are written, so a frame during a drag touches a
 * dozen text nodes and nothing else.
 */
export interface HudRow {
  readonly id: string;
  readonly label: string;
}

export class Hud {
  private readonly values = new Map<string, HTMLElement>();
  private readonly bars = new Map<string, HTMLElement>();
  private readonly last = new Map<string, string>();

  constructor(private readonly root: HTMLElement) {}

  /** Declares a titled block of readouts. Called once, at start-up. */
  section(title: string, rows: readonly HudRow[]): void {
    const section = document.createElement('section');
    section.className = 'gs-section';

    const heading = document.createElement('h2');
    heading.textContent = title;
    section.append(heading);

    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'gs-row';

      const name = document.createElement('span');
      name.className = 'gs-key';
      name.textContent = row.label;

      const value = document.createElement('span');
      value.className = 'gs-value';

      line.append(name, value);
      section.append(line);
      this.values.set(row.id, value);
    }

    this.root.append(section);
  }

  /**
   * A titled block of proportions — the register mix. A number tells you braille is at 31 %; a
   * bar tells you at a glance that it has not run away, which is the thing docs/AESTHETIC.md
   * actually asks you to watch.
   */
  meters(title: string, rows: readonly HudRow[]): void {
    const section = document.createElement('section');
    section.className = 'gs-section';

    const heading = document.createElement('h2');
    heading.textContent = title;
    section.append(heading);

    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'gs-meter';

      const name = document.createElement('span');
      name.className = 'gs-key';
      name.textContent = row.label;

      const track = document.createElement('span');
      track.className = 'gs-track';
      const fill = document.createElement('span');
      fill.className = 'gs-fill';
      track.append(fill);

      const value = document.createElement('span');
      value.className = 'gs-value gs-pct';

      line.append(name, track, value);
      section.append(line);
      this.values.set(row.id, value);
      this.bars.set(row.id, fill);
    }

    this.root.append(section);
  }

  set(id: string, text: string): void {
    if (this.last.get(id) === text) return;
    this.last.set(id, text);
    const node = this.values.get(id);
    if (node) node.textContent = text;
  }

  /** `fraction` in 0..1. */
  meter(id: string, fraction: number, text: string): void {
    this.set(id, text);
    const fill = this.bars.get(id);
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  /** Marks a readout as pressing — over budget, or something the eye should go to. */
  flag(id: string, on: boolean): void {
    this.values.get(id)?.classList.toggle('gs-warn', on);
  }
}

/** The key hints along the bottom, built once. */
export function keyHints(root: HTMLElement, hints: readonly (readonly [string, string])[]): void {
  for (const [key, description] of hints) {
    const hint = document.createElement('span');
    hint.className = 'gs-hint';

    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    const text = document.createElement('span');
    text.textContent = description;

    hint.append(kbd, text);
    root.append(hint);
  }
}
