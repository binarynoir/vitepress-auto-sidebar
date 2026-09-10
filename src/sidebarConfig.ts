import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getErrorMessage } from './util.js';
import type { SidebarFrontmatter, SidebarItem, SidebarMulti } from './types.js';

/**
 * One parsed line from a `.sidebar` config file.
 *
 * Syntax supported (one directive per line, `#` starts a comment):
 *   itemName                       order a file or subdirectory
 *   itemName:Custom Title          order + override its display title
 *   "https://example.com":Title    insert an external link in this section
 *   ROOT="https://x.com":Title     insert an external link at the sidebar root
 *   -itemName                      hide this item (still processed if it's a
 *                                  directory whose own `.hide`/`.hideall` isn't set)
 *   ...                            everything not explicitly listed goes here,
 *                                  sorted alphabetically
 */
export interface SidebarDirective {
  name: string;
  title?: string;
  url?: string;
  isWebLink?: boolean;
  isRootLevel?: boolean;
  hidden?: boolean;
}

const WEB_LINK_RE = /^["']?(https?:\/\/[^"':]+)["']?:(?:"([^"]+)"|'([^']+)'|([^"':]+))$/i;
const QUOTED_TITLE_RE = /^([^:]+):(?:"([^"]+)"|'([^']+)')$/;

export function parseSidebarDirectives(rawLines: string[]): SidebarDirective[] {
  return rawLines.map((rawLine) => {
    let item = rawLine.trim();
    let hidden = false;

    if (item.startsWith('-')) {
      hidden = true;
      item = item.substring(1).trim();
    }

    const isRootLevel = item.startsWith('ROOT=');
    if (isRootLevel) item = item.substring('ROOT='.length);

    const webLinkMatch = item.match(WEB_LINK_RE);
    if (webLinkMatch) {
      const url = webLinkMatch[1];
      const title = (webLinkMatch[2] || webLinkMatch[3] || webLinkMatch[4]).trim();
      return { name: url, title, url, isWebLink: true, isRootLevel, hidden };
    }

    const quotedMatch = item.match(QUOTED_TITLE_RE);
    if (quotedMatch) {
      return {
        name: quotedMatch[1].trim(),
        title: (quotedMatch[2] || quotedMatch[3]).trim(),
        isRootLevel,
        hidden,
      };
    }

    const parts = item.split(':');
    if (parts.length > 1) {
      return { name: parts[0].trim(), title: parts.slice(1).join(':').trim(), isRootLevel, hidden };
    }

    return { name: item, isRootLevel, hidden };
  });
}

/** The name/url a `SidebarDirective` is matched against when sorting. */
function directiveKey(item: SidebarDirective): string {
  return item.isWebLink && item.url ? item.url : item.name;
}

/**
 * Sorts `items` (file/dir names, or weblink URLs) according to already-parsed
 * `.sidebar` entries. Items named explicitly before `...` come first (in
 * listed order), items named after `...` come last, and everything else is
 * inserted alphabetically at the `...` marker (or appended alphabetically if
 * there's no marker).
 */
export function sortItemsByOrder(items: string[], directives: SidebarDirective[]): string[] {
  const parsed = directives.filter((i) => !i.hidden);
  if (!parsed.length) return items;

  const remaining = new Set(items);
  const ellipsisIndex = parsed.findIndex((i) => i.name === '...');

  if (ellipsisIndex === -1) {
    const result: string[] = [];
    for (const directive of parsed) {
      const key = directiveKey(directive);
      if (remaining.has(key)) {
        result.push(key);
        remaining.delete(key);
      }
    }
    return [...result, ...[...remaining].sort()];
  }

  const before = parsed.slice(0, ellipsisIndex);
  const after = parsed.slice(ellipsisIndex + 1);
  const namedBefore = new Set(before.map(directiveKey));
  const namedAfter = new Set(after.map(directiveKey));

  const result: string[] = [];
  for (const directive of before) {
    const key = directiveKey(directive);
    if (remaining.has(key)) {
      result.push(key);
      remaining.delete(key);
    }
  }

  const middle = items.filter((item) => !namedBefore.has(item) && !namedAfter.has(item) && remaining.has(item));
  middle.sort();
  for (const item of middle) remaining.delete(item);
  result.push(...middle);

  for (const directive of after) {
    const key = directiveKey(directive);
    if (remaining.has(key)) {
      result.push(key);
      remaining.delete(key);
    }
  }

  result.push(...[...remaining].sort());
  return result;
}

export function readSidebarConfigFile(directoryPath: string, configFilenames: string[], verbose: boolean): string[] {
  try {
    for (const filename of configFilenames) {
      const configFilePath = path.posix.join(directoryPath, filename);
      if (!fs.existsSync(configFilePath)) continue;

      const items = fs
        .readFileSync(configFilePath, 'utf-8')
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line && !line.startsWith('#'));

      if (verbose) {
        console.log(`   config: ${filename} (${items.length} items) in ${directoryPath}`);
      }
      return items;
    }
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read sidebar config in ${directoryPath}: ${getErrorMessage(error)}`);
  }
  return [];
}

/** Reads `.hide` / `.hideall` directives out of a directory's `.sidebar` file. */
export function checkHideDirective(
  directoryPath: string,
  configFilenames: string[],
): { hide: boolean; skip: boolean } {
  try {
    for (const filename of configFilenames) {
      const configFilePath = path.posix.join(directoryPath, filename);
      if (!fs.existsSync(configFilePath)) continue;

      const lines = fs
        .readFileSync(configFilePath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      if (lines.includes('.hideall') || lines.includes('.hide-all')) return { hide: false, skip: true };
      if (lines.includes('.hide')) return { hide: true, skip: false };
    }
    return { hide: false, skip: false };
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to check hide directive in ${directoryPath}: ${getErrorMessage(error)}`);
    return { hide: false, skip: false };
  }
}

/**
 * Finds a directory's landing page file, preferring `index.md` (the native
 * VitePress convention) and falling back to `README.md` (which VitePress
 * also auto-rewrites to `index.html`). Both are matched case-insensitively;
 * returns the exact on-disk filename.
 */
export function getIndexFilename(directoryPath: string): string | null {
  try {
    const files = fs.readdirSync(directoryPath);
    return (
      files.find((file) => file.toLowerCase() === 'index.md') ??
      files.find((file) => file.toLowerCase() === 'readme.md') ??
      null
    );
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read directory ${directoryPath}: ${getErrorMessage(error)}`);
    return null;
  }
}

/** True for filenames reserved as a directory's landing page (`index.md` / `README.md`). */
export function isIndexFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower === 'index.md' || lower === 'readme.md';
}

/**
 * Reads a markdown file's title, preferring frontmatter `title`, then falling
 * back to its first `# Heading`. Returns null if neither is present/readable.
 */
export function getMarkdownTitle(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);
    const frontmatter = data as SidebarFrontmatter;
    if (frontmatter.title?.trim()) return frontmatter.title.trim();

    const heading = content.match(/^\s*#\s+(.+)$/m);
    if (heading) return heading[1].trim();
  } catch (error) {
    console.warn(`[vitepress-auto-sidebar] failed to read title from ${filePath}: ${getErrorMessage(error)}`);
  }
  return null;
}

/** Reads the `section-title` frontmatter field from a directory's README, if any. */
export function getSectionTitleFrontmatter(readmePath: string): string | null {
  try {
    const raw = fs.readFileSync(readmePath, 'utf-8');
    const frontmatter = matter(raw).data as SidebarFrontmatter;
    return frontmatter['section-title']?.trim() || null;
  } catch (error) {
    console.warn(`[vitepress-auto-sidebar] failed to read frontmatter from ${readmePath}: ${getErrorMessage(error)}`);
    return null;
  }
}

/** Reads a directory's `sidebar.json`, an escape hatch to hand-author part of the tree. */
export function readSidebarJsonOverride(directoryPath: string): SidebarMulti | null {
  const overridePath = path.posix.join(directoryPath, 'sidebar.json');
  try {
    if (!fs.existsSync(overridePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
    return parsed as SidebarMulti;
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to parse ${overridePath}: ${getErrorMessage(error)}`);
    return null;
  }
}

export type { SidebarItem };
