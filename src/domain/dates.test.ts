/// <reference types="node" />
import { afterAll, beforeAll } from 'vitest';
import {
  addDays,
  daysUntil,
  formatDateEs,
  isValidISODate,
  monthsBetween,
  parseISODate,
  todayISO,
  toISODate,
} from './dates';

describe('isValidISODate', () => {
  it('accepts real dates, including leap days', () => {
    expect(isValidISODate('2026-11-13')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true);
  });

  it('rejects malformed and impossible dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-00-10')).toBe(false);
    expect(isValidISODate('2026-1-5')).toBe(false);
    expect(isValidISODate('2026-11-13T00:00:00')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('adds zero and large offsets', () => {
    expect(addDays('2026-11-13', 0)).toBe('2026-11-13');
    expect(addDays('2026-11-13', 365)).toBe('2027-11-13');
  });

  it('throws on invalid input', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
});

describe('daysUntil', () => {
  it('is positive for the future, zero for today, negative for the past', () => {
    expect(daysUntil('2026-11-14', '2026-11-13')).toBe(1);
    expect(daysUntil('2026-11-13', '2026-11-13')).toBe(0);
    expect(daysUntil('2026-11-12', '2026-11-13')).toBe(-1);
  });

  it('spans months and leap years', () => {
    expect(daysUntil('2026-12-13', '2026-11-13')).toBe(30);
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2);
    expect(daysUntil('2027-11-13', '2026-11-13')).toBe(365);
  });

  it('throws on invalid input', () => {
    expect(() => daysUntil('nope', '2026-11-13')).toThrow();
    expect(() => daysUntil('2026-11-13', '2026-13-01')).toThrow();
  });
});

describe('monthsBetween', () => {
  it('counts whole calendar months', () => {
    expect(monthsBetween('2026-08-13', '2026-11-13')).toBe(3);
    expect(monthsBetween('2026-08-13', '2026-11-12')).toBe(2);
    expect(monthsBetween('2025-11-13', '2026-11-13')).toBe(12);
    expect(monthsBetween('2026-11-13', '2026-11-13')).toBe(0);
  });

  it('is negative when the range is reversed', () => {
    expect(monthsBetween('2026-11-13', '2026-08-13')).toBe(-3);
  });
});

describe('formatDateEs', () => {
  it('formats as "13 nov 2026" without a leading zero on the day', () => {
    expect(formatDateEs('2026-11-13')).toBe('13 nov 2026');
    expect(formatDateEs('2027-03-05')).toBe('5 mar 2027');
    expect(formatDateEs('2027-01-01')).toBe('1 ene 2027');
    expect(formatDateEs('2026-12-31')).toBe('31 dic 2026');
  });
});

describe.each(['America/El_Salvador', 'America/New_York', 'Pacific/Auckland', 'UTC'])(
  'in time zone %s',
  (timeZone) => {
    const previous = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = timeZone;
    });
    afterAll(() => {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    });

    it('parseISODate returns local midnight of the same calendar day', () => {
      const date = parseISODate('2026-11-13');
      expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 13]);
      expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
    });

    it('round-trips through toISODate', () => {
      expect(toISODate(parseISODate('2026-11-13'))).toBe('2026-11-13');
      expect(toISODate(parseISODate('2028-02-29'))).toBe('2028-02-29');
    });

    it('todayISO uses the local calendar date, not UTC', () => {
      // Late evening local time: in UTC−6 this instant is already the next day in UTC.
      expect(todayISO(new Date(2026, 10, 13, 23, 30))).toBe('2026-11-13');
      expect(todayISO(new Date(2026, 10, 13, 0, 5))).toBe('2026-11-13');
    });

    it('addDays and daysUntil ignore daylight saving changes', () => {
      expect(addDays('2026-03-07', 2)).toBe('2026-03-09'); // US spring forward on 2026-03-08
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // US fall back on 2026-11-01
      expect(daysUntil('2026-03-09', '2026-03-07')).toBe(2);
      expect(daysUntil('2026-11-02', '2026-10-31')).toBe(2);
      expect(daysUntil('2026-11-14', '2026-11-13')).toBe(1);
    });
  },
);
