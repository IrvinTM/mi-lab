import { msUntilNextDay } from './today';

describe('msUntilNextDay', () => {
  it('counts to the next local midnight plus one second', () => {
    expect(msUntilNextDay(new Date(2026, 10, 13, 23, 59, 0))).toBe(61_000);
    expect(msUntilNextDay(new Date(2026, 10, 13, 0, 0, 0))).toBe(86_401_000);
  });

  it('crosses month and year ends', () => {
    expect(msUntilNextDay(new Date(2026, 11, 31, 23, 0, 0))).toBe(3_601_000);
  });
});
