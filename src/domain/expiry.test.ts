import { addDays } from './dates';
import { expiryStatus } from './expiry';

const TODAY = '2026-11-13';
const THRESHOLDS = { criticalDays: 30, warningDays: 90 };

function statusIn(days: number, thresholds = THRESHOLDS) {
  return expiryStatus(addDays(TODAY, days), TODAY, thresholds);
}

describe('expiryStatus', () => {
  it.each([
    [-1, 'expired'],
    [0, 'critical'],
    [30, 'critical'],
    [31, 'warning'],
    [90, 'warning'],
    [91, 'ok'],
  ] as const)('a lot expiring in %i days is %s', (days, expected) => {
    expect(statusIn(days)).toBe(expected);
  });

  it('is expired far in the past and ok far in the future', () => {
    expect(statusIn(-400)).toBe('expired');
    expect(statusIn(800)).toBe('ok');
  });

  it('respects custom thresholds', () => {
    const custom = { criticalDays: 7, warningDays: 14 };
    expect(statusIn(7, custom)).toBe('critical');
    expect(statusIn(8, custom)).toBe('warning');
    expect(statusIn(14, custom)).toBe('warning');
    expect(statusIn(15, custom)).toBe('ok');
  });

  it('works across year boundaries', () => {
    expect(expiryStatus('2027-01-05', '2026-12-20', THRESHOLDS)).toBe('critical');
    expect(expiryStatus('2027-03-01', '2026-12-20', THRESHOLDS)).toBe('warning');
  });
});
