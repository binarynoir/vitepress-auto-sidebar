import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from './frontmatter.js';
import { readBlogIndex } from './blog.js';
import type { SidebarGroupBy } from './types.js';

/** The group an entry goes in: entries with the same `key` share one group, titled `text`. */
export interface EntryGroup {
  key: string;
  text: string;
  /** The folder the group links to, relative to the docs root (`blog` groups only). */
  folder?: string;
}

/**
 * A page's year and month as written in its `date` (or `blog.date`), so a
 * post dated late on the last day of a month stays in that month whatever
 * its offset. `null` when it has no date.
 */
function readYearMonth(filePath: string): { year: number; month: number } | null {
  let data: Record<string, unknown>;
  try {
    data = readFrontmatter(fs.readFileSync(filePath, 'utf-8')).data;
  } catch {
    return null;
  }
  const blog = data.blog && typeof data.blog === 'object' ? (data.blog as Record<string, unknown>) : {};
  const value = data.date ?? blog.date;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
  }
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})(?:-|$)/.exec(value.trim()) : null;
  const month = match ? Number(match[2]) : 0;
  return match && month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

/**
 * The section blog a post pulled into a main blog's folder came from: the
 * nearest folder above the post, below `dirPath`, whose landing page is a
 * section blog. `null` for the folder's own posts.
 */
function findSectionBlog(rootPath: string, dirPath: string, relativePath: string): string | null {
  for (let folder = path.posix.dirname(relativePath); folder !== dirPath; folder = path.posix.dirname(folder)) {
    if (folder === '.' || folder === '') return null;
    if (readBlogIndex(rootPath, folder)?.scope === 'section') return folder;
  }
  return null;
}

/**
 * The group a file entry of `dirPath` goes in under `groupBy`, or `null` to
 * leave it ungrouped: an undated page for `year` and `month`, the folder's
 * own posts for `blog`. `folderTitle` gives a section blog's group title.
 */
export function findEntryGroup(
  rootPath: string,
  dirPath: string,
  name: string,
  groupBy: SidebarGroupBy,
  folderTitle: (folder: string) => string,
): EntryGroup | null {
  const relativePath = path.posix.join(dirPath, name);
  if (groupBy === 'blog') {
    const folder = findSectionBlog(rootPath, dirPath, relativePath);
    return folder ? { key: folder, text: folderTitle(folder), folder } : null;
  }
  const date = readYearMonth(path.posix.join(rootPath, relativePath));
  if (!date) return null;
  if (groupBy === 'year') return { key: String(date.year), text: String(date.year) };
  const text = new Date(Date.UTC(date.year, date.month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { key: `${date.year}-${date.month}`, text };
}
