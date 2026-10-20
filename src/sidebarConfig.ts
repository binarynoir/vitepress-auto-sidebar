import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from './frontmatter.js';
import { parseLimit, parseMore, parseSort } from './sorting.js';
import { getErrorMessage } from './util.js';
import type { SidebarFrontmatter, SidebarItem, SidebarMulti, SidebarSort } from './types.js';

/**
 * One parsed line from a `.sidebar` config file.
 *
 * Syntax supported (one directive per line, `#` starts a comment):
 *   itemName                       order a file or subdirectory
 *   itemName:Custom Title          order + override its display title
 *   itemName: "Custom Title"       the same; titles may be single- or double-quoted,
 *                                  with optional whitespace after the colon
 *   "https://example.com":Title    insert an external link in this section
 *                                  (the URL's quotes are optional)
 *   ROOT="https://x.com":Title     insert an external link at the sidebar root
 *   -itemName                      hide this item (still processed if it's a
 *                                  directory whose own `.hide`/`.hideall` isn't set)
 *   ...                            everything not explicitly listed goes here,
 *                                  sorted alphabetically
 *   [Group Title]                  start a heading group: what follows, up to the
 *                                  next heading, is shown under this title
 *
 * Lines starting with `.` are folder settings, not entries; see `SidebarSettings`.
 */
export interface SidebarDirective {
  name: string;
  title?: string;
  url?: string;
  isWebLink?: boolean;
  isRootLevel?: boolean;
  hidden?: boolean;
  /** A `[Group Title]` line: a group heading, not an entry on disk. */
  isHeading?: boolean;
}

const HEADING_RE = /^\[(.+)\]$/;

/** Whether a sorted entry name is a `[Group Title]` heading. */
export function isHeadingName(name: string): boolean {
  return HEADING_RE.test(name);
}

// A URL, quoted or bare, then `:` and a title that is double-quoted,
// single-quoted or bare, with optional whitespace around the colon. A bare
// URL can't contain whitespace or quotes, so it ends at the last colon
// before the title (keeping a port, as in `https://host:8080/path`).
const WEB_LINK_RE =
  /^(?:(["'])(https?:\/\/[^"']+)\1|(https?:\/\/[^\s"']+))\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s"'][^"']*))$/i;
const QUOTED_TITLE_RE = /^([^:]+):\s*(?:"([^"]+)"|'([^']+)')$/;

export function parseSidebarDirectives(rawLines: string[]): SidebarDirective[] {
  return rawLines
    .filter((rawLine) => !isSettingLine(rawLine))
    .map((rawLine) => {
      let item = rawLine.trim();
      let hidden = false;

      const headingMatch = item.match(HEADING_RE);
      if (headingMatch) {
        return { name: item, title: headingMatch[1].trim(), isHeading: true };
      }

      if (item.startsWith('-')) {
        hidden = true;
        item = item.substring(1).trim();
      }

      const isRootLevel = item.startsWith('ROOT=');
      if (isRootLevel) item = item.substring('ROOT='.length);

      const webLinkMatch = item.match(WEB_LINK_RE);
      if (webLinkMatch) {
        const url = webLinkMatch[2] || webLinkMatch[3];
        const title = (webLinkMatch[4] || webLinkMatch[5] || webLinkMatch[6]).trim();
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

/**
 * A folder's settings, from the `.sidebar` lines that start with a dot:
 * `.name` turns a setting on, `.name: value` gives it a value.
 */
export interface SidebarSettings {
  /** `.hide`: leave this folder's own link out, but keep its children. */
  hide: boolean;
  /** `.hideall` (or `.hide-all`): leave this folder and everything in it out. */
  skip: boolean;
  /** `.sort: key [asc|desc], …`: how the entries this file doesn't list are ordered. */
  sort?: SidebarSort;
  /** `.limit: n`: most entries shown of those this file doesn't list, after sorting. `0` for no limit. */
  limit?: number;
  /** `.more: Text`: when `.limit` leaves entries out, end with a link to the landing page, titled `Text`. */
  more?: string;
}

// `.name` or `.name: value`. A file named in the folder starts with a letter,
// digit or `-`, never a dot (dotfiles are skipped), so the two can't collide.
const SETTING_RE = /^\.([a-z][\w-]*)\s*(?::\s*(.*))?$/i;

/** Whether a `.sidebar` line is a setting (`.hide`, `.sort: date desc`) rather than an entry. */
export function isSettingLine(line: string): boolean {
  return SETTING_RE.test(line.trim());
}

type SettingResult = { settings: Partial<SidebarSettings> } | { problem: string };

/** Reads one setting line. Every setting the `.sidebar` format knows is handled here. */
function parseSettingLine(line: string): SettingResult {
  const [, rawName, rawValue] = SETTING_RE.exec(line.trim())!;
  const name = rawName.toLowerCase();
  const value = rawValue?.trim() ?? '';
  switch (name) {
    case 'hide':
      return value ? { problem: '.hide takes no value' } : { settings: { hide: true } };
    case 'hideall':
    case 'hide-all':
      return value ? { problem: `.${name} takes no value` } : { settings: { skip: true } };
    case 'sort': {
      const sort = parseSort(value);
      return typeof sort === 'string' ? { problem: sort } : { settings: { sort } };
    }
    case 'limit': {
      const limit = parseLimit(value);
      return typeof limit === 'string' ? { problem: limit } : { settings: { limit } };
    }
    case 'more': {
      const more = parseMore(value);
      return more ? { settings: { more } } : { problem: 'it needs the link text, e.g. ".more: Older posts"' };
    }
    // @binarynoir/vitepress-auto-navbar's settings. The navbar can read `.sidebar`
    // files too, so they are expected here and left to it.
    case 'link':
    case 'inherit':
      return { settings: {} };
    default:
      return { problem: `.${rawName} is not a setting (known settings: .sort, .limit, .more, .hide, .hideall)` };
  }
}

/** Collects a folder's settings from its `.sidebar` lines. Lines that can't be used are ignored. */
export function parseSidebarSettings(lines: string[]): SidebarSettings {
  const settings: SidebarSettings = { hide: false, skip: false };
  for (const line of lines) {
    if (!isSettingLine(line)) continue;
    const result = parseSettingLine(line);
    if ('settings' in result) Object.assign(settings, result.settings);
  }
  return settings;
}

/**
 * Why a `.sidebar` line can't be used as written, or `null` if it can: a link
 * that isn't `URL:Title`, a title whose quotes don't match, or a setting that
 * is unknown or has a bad value. Such a line would otherwise be dropped from
 * the sidebar, or keep its stray quotes.
 */
export function directiveProblem(line: string): string | null {
  if (isSettingLine(line)) {
    const result = parseSettingLine(line);
    return 'problem' in result ? result.problem : null;
  }
  const [directive] = parseSidebarDirectives([line]);
  if (directive.isHeading || directive.isWebLink) return null;
  if (/https?:\/\//i.test(line)) {
    return 'a link must be written as URL:Title, e.g. https://example.com:"Title"';
  }
  if (directive.title && /^["']/.test(directive.title)) {
    return 'its title has unmatched quotes';
  }
  return null;
}

// Lines already warned about, so each is reported once per process even
// though a `.sidebar` file is read for several passes of every build.
const warnedLines = new Set<string>();

/** The name/url a `SidebarDirective` is matched against when sorting. */
function directiveKey(item: SidebarDirective): string {
  return item.isWebLink && item.url ? item.url : item.name;
}

/**
 * Sorts `items` (file/dir names, or weblink URLs) according to already-parsed
 * `.sidebar` entries. Items named explicitly before `...` come first (in
 * listed order), items named after `...` come last, and everything else is
 * inserted at the `...` marker (or appended if there's no marker), in
 * `compare` order: alphabetical by default, or a folder's `.sort` setting.
 */
export function sortItemsByOrder(
  items: string[],
  directives: SidebarDirective[],
  compare?: (a: string, b: string) => number,
): string[] {
  const parsed = directives.filter((i) => !i.hidden);
  if (!parsed.length) return compare ? [...items].sort(compare) : items;

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
    return [...result, ...[...remaining].sort(compare)];
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
  middle.sort(compare);
  for (const item of middle) remaining.delete(item);
  result.push(...middle);

  for (const directive of after) {
    const key = directiveKey(directive);
    if (remaining.has(key)) {
      result.push(key);
      remaining.delete(key);
    }
  }

  result.push(...[...remaining].sort(compare));
  return result;
}

export function readSidebarConfigFile(directoryPath: string, configFilenames: string[], verbose: boolean): string[] {
  try {
    for (const filename of configFilenames) {
      const configFilePath = path.posix.join(directoryPath, filename);
      if (!fs.existsSync(configFilePath)) continue;

      const items: string[] = [];
      fs.readFileSync(configFilePath, 'utf-8')
        .split('\n')
        .forEach((rawLine, index) => {
          const line = rawLine.trim().replace(/\s+/g, ' ');
          if (!line || line.startsWith('#')) return;
          items.push(line);

          const problem = directiveProblem(line);
          const key = `${configFilePath}:${index + 1}:${line}`;
          if (problem && !warnedLines.has(key)) {
            warnedLines.add(key);
            console.warn(
              `[vitepress-auto-sidebar] could not parse "${line}" at ${configFilePath}:${index + 1}: ${problem}`,
            );
          }
        });

      if (verbose) {
        console.log(`   config: ${filename} (${items.length} items) in ${directoryPath}`);
      }
      return items;
    }
  } catch (error) {
    console.error(
      `[vitepress-auto-sidebar] failed to read sidebar config in ${directoryPath}: ${getErrorMessage(error)}`,
    );
  }
  return [];
}

/** Reads a directory's settings (`.hide`, `.hideall`, `.sort`, …) out of its `.sidebar` file. */
export function readSidebarSettings(directoryPath: string, configFilenames: string[]): SidebarSettings {
  try {
    for (const filename of configFilenames) {
      const configFilePath = path.posix.join(directoryPath, filename);
      if (!fs.existsSync(configFilePath)) continue;

      const lines = fs
        .readFileSync(configFilePath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      return parseSidebarSettings(lines);
    }
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read settings in ${directoryPath}: ${getErrorMessage(error)}`);
  }
  return { hide: false, skip: false };
}

/** Reads `.hide` / `.hideall` out of a directory's `.sidebar` file. */
export function checkHideDirective(directoryPath: string, configFilenames: string[]): { hide: boolean; skip: boolean } {
  const { hide, skip } = readSidebarSettings(directoryPath, configFilenames);
  return skip ? { hide: false, skip: true } : { hide, skip: false };
}

/**
 * Finds a directory's landing page file, preferring `index.md` (the native
 * VitePress convention) and falling back to `README.md`. VitePress serves a
 * `README.md` at `README.html`, not the directory's index, unless it is
 * rewritten (e.g. by `@binarynoir/vitepress-readme-index`). Both are matched
 * case-insensitively; returns the exact on-disk filename.
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
    const { data, content } = readFrontmatter(raw);
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
    const frontmatter = readFrontmatter(raw).data as SidebarFrontmatter;
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
