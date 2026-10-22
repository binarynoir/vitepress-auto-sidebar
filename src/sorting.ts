import fs from 'node:fs';
import { readFrontmatter } from './frontmatter.js';
import type { SidebarGroupBy, SidebarSort, SidebarSortKey } from './types.js';

const DIRECTIONS = ['asc', 'desc'] as const;
const EXAMPLE = 'e.g. ".sort: date desc" or ".sort: blog.sticky desc, date desc"';

/**
 * Parses a sort setting: one or more keys separated by commas, each with an
 * optional direction (ascending if left out), such as `date desc`, `title`
 * or `blog.sticky desc, date desc`. Later keys break ties in earlier ones.
 * Returns why it can't be used instead, as a string, when it is malformed.
 */
export function parseSort(value: string): SidebarSort | string {
  const keys: SidebarSortKey[] = [];
  for (const part of value.split(',')) {
    const [key, direction = 'asc', ...rest] = part.trim().split(/\s+/);
    if (!key) return `it needs a key for each comma-separated part, ${EXAMPLE}`;
    if (rest.length) return `write each part as a key and an optional direction, ${EXAMPLE}`;
    const lower = direction.toLowerCase();
    if (!(DIRECTIONS as readonly string[]).includes(lower)) return `"${direction}" is not a direction: use asc or desc`;
    keys.push({ key, direction: lower as SidebarSortKey['direction'] });
  }
  return keys;
}

/** A value from parsed frontmatter by dotted path: `blog.date` reads `blog: { date }`. */
function readPath(data: Record<string, unknown>, keyPath: string): unknown {
  let value: unknown = data;
  for (const part of keyPath.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

// `2026-10-20`, then an optional `T` or space and `HH:mm[:ss[.sss]]`, then an optional `Z` or `±HH[:]mm`.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * A frontmatter date or date and time as milliseconds, or `undefined` if it
 * isn't one. A time without an offset is read as UTC, so pages sort the same
 * on every build machine whatever its time zone; a date alone is the start
 * of its day, so it sorts before the timed pages of the same day.
 */
export function toTimestamp(text: string): number | undefined {
  const match = DATE_TIME.exec(text);
  if (!match) return undefined;
  const [, year, month, day, hour = '0', minute = '0', second = '0', millisecond = '0', offset] = match;
  const wall = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond.padEnd(3, '0')),
  );
  const check = new Date(wall);
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) return undefined;
  if (!offset || offset.toUpperCase() === 'Z') return wall;
  const sign = offset.startsWith('-') ? -1 : 1;
  const digits = offset.slice(1).replace(':', '');
  return wall - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
}

type SortValue = number | string;

/**
 * Dates and numbers compare as numbers; other values as text. `true` is 1,
 * and `false` counts as no value, so a `sticky: true` key puts those pages
 * first and leaves the rest to the next key. Anything else is no value.
 */
function toSortValue(value: unknown): SortValue | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value ? 1 : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const text = value.trim();
  const time = toTimestamp(text);
  if (time !== undefined) return time;
  return text;
}

/**
 * Reads a page's value for a sort key. `date` is the page's `date`, or the
 * `@binarynoir/vitepress-blog` post date (`blog.date`) when it has none; any
 * other key is a frontmatter field, with dots for nested fields.
 */
export function readSortValue(filePath: string, key: string): SortValue | undefined {
  let data: Record<string, unknown>;
  try {
    data = readFrontmatter(fs.readFileSync(filePath, 'utf-8')).data;
  } catch {
    return undefined;
  }
  const value = readPath(data, key) ?? (key === 'date' ? readPath(data, 'blog.date') : undefined);
  return toSortValue(value);
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * A comparator for entry names. `valueOf` gives an entry's value for a key
 * (a title for `title`, a frontmatter value otherwise). Keys are compared in
 * order, each breaking ties in the one before. For each key, entries without
 * a value go after those with one, in either direction. Final ties go by name.
 */
export function createEntryComparator(
  sort: SidebarSort,
  valueOf: (name: string, key: string) => SortValue | undefined,
): (a: string, b: string) => number {
  const cache = new Map<string, SortValue | undefined>();
  const value = (name: string, key: string) => {
    const cacheKey = `${key}\u0000${name}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, valueOf(name, key));
    return cache.get(cacheKey);
  };
  const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  return (a, b) => {
    for (const { key, direction } of sort) {
      const sign = direction === 'desc' ? -1 : 1;
      if (key === 'name') return sign * byName(a, b);
      const valueA = value(a, key);
      const valueB = value(b, key);
      if (valueA === undefined && valueB === undefined) continue;
      if (valueA === undefined) return 1;
      if (valueB === undefined) return -1;
      const compared = sign * compareValues(valueA, valueB);
      if (compared) return compared;
    }
    return byName(a, b);
  };
}

/** Parses a `.limit` value: a whole number of entries, `0` for no limit. Returns why it can't be used, as a string. */
export function parseLimit(value: string): number | string {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return 'it needs a whole number of entries, e.g. ".limit: 10" (0 for no limit)';
  return Number(text);
}

const GROUP_BYS: readonly SidebarGroupBy[] = ['year', 'month', 'blog'];

/** Parses a `.group` value: `year`, `month` or `blog`, or `null` if it is none of them. */
export function parseGroupBy(value: string): SidebarGroupBy | null {
  const lower = value.trim().toLowerCase();
  return GROUP_BYS.find((groupBy) => groupBy === lower) ?? null;
}

/** Parses a `.more` value: the link text, bare or quoted. */
export function parseMore(value: string): string {
  return value
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();
}

/**
 * Keeps the first `limit` entries that `counts` (the ones the config file
 * doesn't list) and every entry it doesn't count, in order. `limit` 0 keeps
 * everything. `truncated` says whether anything was left out.
 */
export function limitEntries(
  names: string[],
  counts: (name: string) => boolean,
  limit: number | undefined,
): { names: string[]; truncated: boolean } {
  if (!limit) return { names, truncated: false };
  let seen = 0;
  const kept = names.filter((name) => !counts(name) || ++seen <= limit);
  return { names: kept, truncated: kept.length < names.length };
}
