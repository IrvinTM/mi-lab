export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends Rect {
  maximized: boolean;
}

export const DEFAULT_SIZE = { width: 1280, height: 800 };
export const MIN_SIZE = { width: 800, height: 600 };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Reads the saved file's content, ignoring anything that is not a plausible window state. */
export function parseWindowState(raw: unknown): WindowState | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { x, y, width, height, maximized } = raw as Record<string, unknown>;
  if (![x, y, width, height].every(isFiniteNumber)) return undefined;
  const state = { x, y, width, height } as Rect;
  if (state.width < MIN_SIZE.width || state.height < MIN_SIZE.height) return undefined;
  return { ...state, maximized: maximized === true };
}

/** Whether enough of the window is on some screen for the user to grab it (e.g. a monitor was unplugged). */
export function isVisibleOn(bounds: Rect, workAreas: readonly Rect[], margin = 100): boolean {
  return workAreas.some((area) => {
    const width =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const height =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return width >= margin && height >= margin;
  });
}
