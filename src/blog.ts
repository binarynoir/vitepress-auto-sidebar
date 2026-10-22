import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from './frontmatter.js';
import { isExcluded, type ExclusionContext } from './exclusions.js';
import { getIndexFilename, isIndexFilename } from './sidebarConfig.js';
import type { SidebarSort } from './types.js';

/**
 * How a blog folder orders the entries its `.sidebar` doesn't list when it
 * has no `.sort`: pinned posts first, then newest first, as the blog page does.
 */
export const BLOG_SORT: SidebarSort = [
  { key: 'blog.pinned', direction: 'desc' },
  { key: 'date', direction: 'desc' },
];

/** What a `@binarynoir/vitepress-blog` blog page's `blog-index` frontmatter says about where its posts come from. */
export interface BlogIndex {
  /** `site` for a main blog, `section` for a blog of one part of the site. */
  scope: 'site' | 'section';
  /** Folders the blog covers, relative to the docs root. Empty means the whole site. */
  folders: string[];
}

/** Parsed frontmatter, or `{}` if the file can't be read or its YAML is invalid. */
function readData(filePath: string): Record<string, unknown> {
  try {
    return readFrontmatter(fs.readFileSync(filePath, 'utf-8')).data;
  } catch {
    return {};
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toScope(value: unknown): BlogIndex['scope'] {
  return value === 'site' || value === 'global' ? 'site' : 'section';
}

function toStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim());
}

/**
 * The blog a folder's landing page is, or `null` if it isn't one. Folders
 * resolve as the blog plugin resolves them: relative to the docs root, or to
 * the page's folder when they start with `./` or `../`; a section blog with
 * none covers its own folder, a main blog with none the whole site.
 */
export function readBlogIndex(rootPath: string, dirPath: string): BlogIndex | null {
  const indexFile = getIndexFilename(path.posix.join(rootPath, dirPath));
  if (!indexFile) return null;
  const value = readData(path.posix.join(rootPath, dirPath, indexFile))['blog-index'];
  if (!value) return null;
  const options = toRecord(value);
  const scope = toScope(options.scope);
  const folders = toStringList(options.folders).map((folder) =>
    (/^\.\.?(\/|$)/.test(folder) ? path.posix.join(dirPath, folder) : path.posix.normalize(folder))
      .replace(/^\/+|\/+$/g, '')
      .replace(/^\.$/, ''),
  );
  return { scope, folders: folders.length ? folders : scope === 'section' ? [dirPath] : [] };
}

/** Whether a page is a blog post marked `scope: site` (or `global`). A blog page is never a post. */
function isSitePost(filePath: string): boolean {
  const data = readData(filePath);
  return !data['blog-index'] && toScope(toRecord(data.blog).scope) === 'site';
}

/**
 * The `scope: site` posts a main blog in `dirPath` lists that live in a
 * folder below or beside it, as paths relative to `dirPath`
 * (`team/launch.md`, `../news/launch.md`), so its sidebar lists them with
 * its own posts. Posts directly in `dirPath` are left out: they are listed
 * already. `isSkipped` says which file and folder names are never pages.
 */
export function listSitePosts(
  rootPath: string,
  dirPath: string,
  exclusions: ExclusionContext,
  isSkipped: (name: string) => boolean,
): string[] {
  const blog = readBlogIndex(rootPath, dirPath);
  if (blog?.scope !== 'site') return [];

  const found = new Set<string>();
  const walk = (folder: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.posix.join(rootPath, folder), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (isSkipped(entry.name)) continue;
      const relativePath = folder ? `${folder}/${entry.name}` : entry.name;
      if (isExcluded(relativePath, exclusions)) continue;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.isFile() && entry.name.endsWith('.md') && folder !== dirPath) {
        if (isSitePost(path.posix.join(rootPath, relativePath))) found.add(relativePath);
      }
    }
  };
  for (const folder of blog.folders.length ? blog.folders : ['']) walk(folder);

  return [...found].map((relativePath) => path.posix.relative(dirPath, relativePath)).sort();
}

/** The URL of a page, by its path relative to the docs root: a landing page is its folder's URL. */
export function toPageUrl(relativePath: string): string {
  const url = isIndexFilename(path.posix.basename(relativePath))
    ? `/${path.posix.dirname(relativePath)}/`
    : `/${relativePath}`;
  return url.replace(/\/+/g, '/').replace(/^\/\.\/$/, '/');
}
