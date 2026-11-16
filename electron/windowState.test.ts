import { isVisibleOn, parseWindowState } from './windowState';

const screen1 = { x: 0, y: 0, width: 1920, height: 1040 };

describe('parseWindowState', () => {
  it('accepts a saved state', () => {
    expect(parseWindowState({ x: 10, y: 20, width: 1000, height: 700, maximized: true })).toEqual({
      x: 10,
      y: 20,
      width: 1000,
      height: 700,
      maximized: true,
    });
  });

  it.each([
    null,
    'x',
    {},
    { x: 0, y: 0, width: 100, height: 100 },
    { x: NaN, y: 0, width: 900, height: 700 },
  ])('ignores %j', (raw) => {
    expect(parseWindowState(raw)).toBeUndefined();
  });
});

describe('isVisibleOn', () => {
  it('is true when the window is on a screen', () => {
    expect(isVisibleOn({ x: 100, y: 50, width: 1280, height: 800 }, [screen1])).toBe(true);
  });

  it('is false when its monitor is gone', () => {
    expect(isVisibleOn({ x: 2500, y: 50, width: 1280, height: 800 }, [screen1])).toBe(false);
  });

  it('is false when only a sliver is visible', () => {
    expect(isVisibleOn({ x: 1900, y: 50, width: 1280, height: 800 }, [screen1])).toBe(false);
  });
});
