import type { ISODate } from './types';

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

interface Ymd {
  year: number;
  month: number; // 1..12
  day: number;
}

function splitISO(date: ISODate): Ymd {
  const match = ISO_PATTERN.exec(date);
  if (!match) throw new Error(`Invalid ISO date: "${date}"`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Days since 1970-01-01 for a calendar date. UTC math: unaffected by time zones or DST. */
function toDayNumber({ year, month, day }: Ymd): number {
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromDayNumber(days: number): Ymd {
  const d = new Date(days * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function formatISO({ year, month, day }: Ymd): ISODate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** True for a well-formed, real calendar date ('2026-02-30' is not valid). */
export function isValidISODate(value: string): boolean {
  const match = ISO_PATTERN.exec(value);
  if (!match) return false;
  const ymd = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return formatISO(fromDayNumber(toDayNumber(ymd))) === value;
}

/**
 * Parses 'YYYY-MM-DD' into a local-time Date at midnight.
 * Never `new Date('YYYY-MM-DD')`: that is UTC and yields the previous day in UTC−6.
 */
export function parseISODate(date: ISODate): Date {
  if (!isValidISODate(date)) throw new Error(`Invalid ISO date: "${date}"`);
  const { year, month, day } = splitISO(date);
  return new Date(year, month - 1, day);
}

/** Formats the local calendar date of a Date as 'YYYY-MM-DD'. */
export function toISODate(date: Date): ISODate {
  return formatISO({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

/**
 * The local calendar date of `now`. The clock is a parameter on purpose: the only caller that
 * reads the real clock is `state/today.ts`.
 */
export function todayISO(now: Date): ISODate {
  return toISODate(now);
}

export function addDays(date: ISODate, days: number): ISODate {
  if (!isValidISODate(date)) throw new Error(`Invalid ISO date: "${date}"`);
  return formatISO(fromDayNumber(toDayNumber(splitISO(date)) + days));
}

/** Whole days from `today` until `date`: positive if in the future, negative if past. */
export function daysUntil(date: ISODate, today: ISODate): number {
  if (!isValidISODate(date)) throw new Error(`Invalid ISO date: "${date}"`);
  if (!isValidISODate(today)) throw new Error(`Invalid ISO date: "${today}"`);
  return toDayNumber(splitISO(date)) - toDayNumber(splitISO(today));
}

/**
 * Whole calendar months from `from` to `to` (a month counts once the day of month is reached).
 * Negative when `to` is before `from`.
 */
export function monthsBetween(from: ISODate, to: ISODate): number {
  if (to < from) return -monthsBetween(to, from);
  const a = splitISO(from);
  const b = splitISO(to);
  const months = (b.year - a.year) * 12 + (b.month - a.month);
  return b.day < a.day ? months - 1 : months;
}

/** '2026-11-13' → '13 nov 2026'. */
export function formatDateEs(date: ISODate): string {
  const { year, month, day } = splitISO(date);
  return `${day} ${MONTHS_ES[month - 1]} ${year}`;
}

const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** First and last day of a calendar month ('2028-02' → 2028-02-01..2028-02-29). */
export function monthRange(yearMonth: string): { from: ISODate; to: ISODate } {
  const match = YEAR_MONTH_PATTERN.exec(yearMonth);
  const year = match ? Number(match[1]) : 0;
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw new RangeError(`Invalid year-month: "${yearMonth}"`);
  const from = formatISO({ year, month, day: 1 });
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return { from, to: addDays(formatISO({ ...next, day: 1 }), -1) };
}

/** The month before the one `today` falls in. */
export function previousMonthRange(today: ISODate): { from: ISODate; to: ISODate } {
  const { year, month } = splitISO(today);
  return monthRange(
    month === 1 ? `${pad(year - 1, 4)}-12` : `${pad(year, 4)}-${pad(month - 1, 2)}`,
  );
}

/** From the 1st of `today`'s month up to `today` (never a future date). */
export function currentMonthRange(today: ISODate): { from: ISODate; to: ISODate } {
  const { year, month } = splitISO(today);
  const { from, to } = monthRange(`${pad(year, 4)}-${pad(month, 2)}`);
  return { from, to: to < today ? to : today };
}
