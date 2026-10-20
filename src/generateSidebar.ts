import fs from 'node:fs';
import path from 'node:path';
import { createTitles, type Titles } from './titles.js';
import { createExclusionContext, isExcluded, type ExclusionContext } from './exclusions.js';
import {
  checkHideDirective,
  getIndexFilename,
  getMarkdownTitle,
  getSectionTitleFrontmatter,
  isIndexFilename,
  parseSidebarDirectives,
  readSidebarConfigFile,
  readSidebarJsonOverride,
  readSidebarSettings,
  sortItemsByOrder,
  type SidebarDirective,
} from './sidebarConfig.js';
import { createEntryComparator, limitEntries, parseSort, readSortValue } from './sorting.js';
import { getErrorMessage } from './util.js';
import type {
  GenerateSidebarOptions,
  ResolvedSidebarOptions,
  SidebarItem,
  SidebarMulti,
  SidebarSort,
} from './types.js';

interface GenerateContext {
  rootPath: string;
  options: ResolvedSidebarOptions;
  exclusions: ExclusionContext;
  titles: Titles;
}

/**
 * Scans `rootPath` and builds a VitePress `themeConfig.sidebar` multi-sidebar
 * config: one top-level directory becomes one URL-prefixed section. A
 * subdirectory of it is promoted to its own sibling group only if it has
 * more than one visible entry; a single-page one is nested as a plain link
 * in its parent's group instead (see `flattenSinglePage`).
 *
 * See the README for the `.sidebar` / `.exclude` config file syntax.
 */
export function generateSidebar(rootPath: string, options: GenerateSidebarOptions = {}): SidebarMulti {
  const resolved: ResolvedSidebarOptions = {
    maxDepth: (options.maxDepth ?? 3) + 1,
    maxTitleLength: options.maxTitleLength ?? 50,
    configFilenames: options.configFilenames ?? ['.sidebar'],
    excludeFilenames: options.excludeFilenames ?? ['.exclude'],
    excludeFrontmatter: options.excludeFrontmatter ?? [],
    collapsed: options.collapsed ?? false,
    flattenSinglePage: options.flattenSinglePage ?? true,
    titleReplacements: options.titleReplacements ?? {},
    titleCase: options.titleCase ?? true,
    stripTags: options.stripTags ?? true,
    transformTitle: options.transformTitle,
    groupTitleFromIndex: options.groupTitleFromIndex ?? false,
    sort: resolveSortOption(options.sort),
    limit: resolveLimitOption(options.limit),
    more: options.more?.trim() || undefined,
    verbose: options.verbose ?? false,
  };

  const ctx: GenerateContext = {
    rootPath,
    options: resolved,
    exclusions: createExclusionContext(rootPath, resolved.excludeFilenames, resolved.excludeFrontmatter),
    titles: createTitles(resolved),
  };

  if (resolved.verbose) {
    console.log(`[vitepress-auto-sidebar] scanning ${rootPath} (maxDepth=${options.maxDepth ?? 3})`);
  }

  const sidebar: SidebarMulti = {};

  let topLevelEntries: string[] = [];
  try {
    topLevelEntries = fs.readdirSync(rootPath);
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read root directory ${rootPath}: ${getErrorMessage(error)}`);
    return sidebar;
  }

  for (const entry of topLevelEntries) {
    if (isSkippedEntryName(entry)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(path.posix.join(rootPath, entry));
    } catch {
      continue;
    }
    if (stat.isFile()) continue;

    if (isExcluded(entry, ctx.exclusions)) {
      if (resolved.verbose) console.log(`   excluded: ${entry}`);
      continue;
    }

    if (resolved.verbose) console.log(`processing: ${entry}`);
    Object.assign(sidebar, buildSectionForTopDir(ctx, entry, 1));
  }

  if (resolved.verbose) {
    console.log(`[vitepress-auto-sidebar] generated ${Object.keys(sidebar).length} section(s)`);
  }

  return sidebar;
}

/** Parses the `sort` option, warning (and keeping the default) if it can't be used. */
function resolveSortOption(value: string | undefined): SidebarSort | undefined {
  if (value === undefined) return undefined;
  const sort = parseSort(value);
  if (typeof sort !== 'string') return sort;
  console.warn(`[vitepress-auto-sidebar] ignoring the sort option "${value}": ${sort}`);
  return undefined;
}

/** Checks the `limit` option, warning (and keeping no limit) if it can't be used. */
function resolveLimitOption(value: number | undefined): number {
  if (value === undefined) return 0;
  if (Number.isInteger(value) && value >= 0) return value;
  console.warn(`[vitepress-auto-sidebar] ignoring the limit option ${value}: it needs a whole number, 0 for no limit`);
  return 0;
}

/**
 * Cuts a folder's sorted entries to its `.limit` (or the `limit` option),
 * counting only the files and folders its `.sidebar` doesn't list.
 */
function limitFolderEntries(
  ctx: GenerateContext,
  dirPath: string,
  names: string[],
  directives: SidebarDirective[],
  isEntry: (name: string) => boolean,
): { names: string[]; truncated: boolean; more?: string } {
  const settings = readSidebarSettings(path.posix.join(ctx.rootPath, dirPath), ctx.options.configFilenames);
  const listed = new Set(directives.filter((directive) => !directive.hidden).map((directive) => directive.name));
  const limit = settings.limit ?? ctx.options.limit;
  const result = limitEntries(names, (name) => isEntry(name) && !listed.has(name), limit);
  return { ...result, more: settings.more ?? ctx.options.more };
}

/**
 * How a directory orders the entries its `.sidebar` doesn't list: its own
 * `.sort` setting, else the `sort` option, else `undefined` (alphabetical).
 * `titleOf` gives an entry's sidebar title, for sorting by `title`.
 */
function entryComparator(
  ctx: GenerateContext,
  dirPath: string,
  titleOf: (name: string) => string,
): ((a: string, b: string) => number) | undefined {
  const fullDir = path.posix.join(ctx.rootPath, dirPath);
  const sort = readSidebarSettings(fullDir, ctx.options.configFilenames).sort ?? ctx.options.sort;
  if (!sort) return undefined;
  return createEntryComparator(sort, (name, key) => {
    if (key === 'title') return titleOf(name);
    const entryPath = path.posix.join(fullDir, name);
    // A folder sorts by its landing page's frontmatter.
    const isDirectory = !name.endsWith('.md') && fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory();
    const indexFile = isDirectory ? getIndexFilename(entryPath) : null;
    const file = name.endsWith('.md') ? entryPath : indexFile ? path.posix.join(entryPath, indexFile) : null;
    return file ? readSortValue(file, key) : undefined;
  });
}

/** Builds the `{ [urlPrefix]: SidebarItem[] }` entry for one top-level docs directory. */
function buildSectionForTopDir(ctx: GenerateContext, fsDir: string, currentDepth: number): SidebarMulti {
  if (isExcluded(fsDir, ctx.exclusions)) return {};

  const fullDir = path.posix.join(ctx.rootPath, fsDir);
  const override = readSidebarJsonOverride(fullDir);
  if (override) return override;

  const { hide: isRootHidden, skip: isRootSkipped } = checkHideDirective(fullDir, ctx.options.configFilenames);
  if (isRootSkipped) return {};

  const urlDir = toUrlDir(fsDir);
  const configItems = readSidebarConfigFile(fullDir, ctx.options.configFilenames, ctx.options.verbose);
  const directives = parseSidebarDirectives(configItems);
  const ellipsisIndex = directives.findIndex((i) => i.name === '...');

  const rootTitle = resolveDirectoryTitle(ctx, fsDir, ctx.titles.fromName(path.posix.basename(fsDir)));

  const indexFile = getIndexFilename(fullDir);
  const indexRelPath = indexFile ? path.posix.join(fsDir, indexFile) : null;
  const hasIndex = !!(indexFile && indexRelPath && !isExcluded(indexRelPath, ctx.exclusions));
  const indexConfig = indexFile ? directives.find((p) => p.name.toLowerCase() === indexFile.toLowerCase()) : undefined;
  const indexHidden = !!indexConfig?.hidden;

  // Subdirectories that flatten to a plain link (flattenSinglePage) nest here,
  // alongside root-level files; ones that stay a real multi-page group come
  // back as `deferredGroups` and get promoted to their own sibling entries
  // below instead, same as sidebar-key content.
  const {
    items: nestedRootEntries,
    deferredGroups,
    headingGroups,
  } = collectChildEntries(ctx, fsDir, false, currentDepth, directives);

  const rootChildren: SidebarItem[] = [];
  if (hasIndex && indexFile && !indexHidden) {
    rootChildren.push({
      text: explicitTitle(ctx, indexConfig?.title, path.posix.join(fullDir, indexFile)) ?? rootTitle,
      link: urlDir,
    });
  }
  rootChildren.push(...nestedRootEntries);

  // Same flatten check subdirectories get: a top-level section with nothing
  // but its own landing page (or a single file, if it has no landing page)
  // is one link, not a group whose only child repeats its own label.
  const rootItem: SidebarItem = buildGroupOrLeaf(
    ctx,
    rootTitle,
    hasIndex && !indexHidden ? urlDir : undefined,
    rootChildren,
  ) ?? { text: rootTitle };

  // ROOT=-prefixed web links, positioned by their line index relative to `...`.
  const rootLevelLinks = new Map<number, SidebarItem>();
  directives.forEach((item, index) => {
    if (item.hidden || item.name === '...') return;
    if (item.isRootLevel && item.isWebLink && item.url && item.title) {
      rootLevelLinks.set(index, { text: ctx.titles.fromText(item.title, 'config'), link: item.url });
    }
  });

  const specifiedOrder = new Map<string, number>();
  directives.forEach((item, index) => {
    if (item.hidden || item.name === '...' || item.isWebLink) return;
    specifiedOrder.set(item.name, index);
  });

  // Directories promoted to their own sibling section entries: with
  // flattenSinglePage on, only the ones collectChildEntries deferred above
  // (real multi-page groups); with it off, every visible subdirectory, as
  // before — collectChildEntries doesn't consider directories at all in that
  // case, so deferredGroups is always empty and this falls back to building
  // them directly.
  let promotedGroups: Map<string, SidebarItem>;
  if (ctx.options.flattenSinglePage) {
    promotedGroups = deferredGroups;
  } else {
    promotedGroups = new Map();
    const hiddenDirNames = new Set(
      directives.filter((i) => i.hidden && !i.isWebLink && i.name !== '...').map((i) => i.name.toLowerCase()),
    );
    if (currentDepth < ctx.options.maxDepth) {
      for (const dir of listChildDirectories(ctx, fsDir, directives)) {
        if (hiddenDirNames.has(dir.toLowerCase())) continue;
        const child = buildDirectorySidebarItem(
          ctx,
          path.posix.join(fsDir, dir),
          ctx.titles.fromName(dir),
          currentDepth + 1,
        );
        if (child) promotedGroups.set(dir, child);
      }
    }
  }
  const allDirectories = [...promotedGroups.keys()];
  const buildChildSection = (dir: string): SidebarItem | null => promotedGroups.get(dir) ?? null;

  const sectionItems: SidebarItem[] = isRootHidden ? [] : [rootItem];
  const processedDirs = new Set<string>();

  const emitRange = (start: number, endExclusive: number) => {
    for (let i = start; i < endExclusive; i++) {
      const link = rootLevelLinks.get(i);
      if (link) sectionItems.push(link);

      for (const dir of allDirectories) {
        if (processedDirs.has(dir) || specifiedOrder.get(dir) !== i) continue;
        const child = buildChildSection(dir);
        if (child) sectionItems.push(child);
        processedDirs.add(dir);
      }
    }
  };

  if (ellipsisIndex === -1) {
    emitRange(0, configItems.length);
    for (const dir of allDirectories.filter((d) => !processedDirs.has(d)).sort()) {
      const child = buildChildSection(dir);
      if (child) sectionItems.push(child);
    }
  } else {
    emitRange(0, ellipsisIndex);
    for (const dir of allDirectories.filter((d) => !processedDirs.has(d)).sort()) {
      const child = buildChildSection(dir);
      if (child) {
        sectionItems.push(child);
        processedDirs.add(dir);
      }
    }
    emitRange(ellipsisIndex + 1, configItems.length);
  }

  // `[Heading]` groups follow everything listed before the first heading.
  sectionItems.push(...headingGroups);

  return { [urlDir]: sectionItems };
}

/** Builds the `SidebarItem` for one (non-top-level) subdirectory. */
function buildDirectorySidebarItem(
  ctx: GenerateContext,
  dirPath: string,
  defaultTitle: string,
  currentDepth: number,
): SidebarItem | null {
  if (isExcluded(dirPath, ctx.exclusions)) return null;

  const fullDir = path.posix.join(ctx.rootPath, dirPath);
  const { hide, skip } = checkHideDirective(fullDir, ctx.options.configFilenames);
  if (skip) return null;

  if (hide) {
    // Don't show this directory itself, but keep surfacing its children.
    const directives = parseSidebarDirectives(
      readSidebarConfigFile(fullDir, ctx.options.configFilenames, ctx.options.verbose),
    );
    const items: SidebarItem[] = [];
    for (const sub of listChildDirectories(ctx, dirPath, directives)) {
      const child = buildDirectorySidebarItem(
        ctx,
        path.posix.join(dirPath, sub),
        ctx.titles.fromName(sub),
        currentDepth + 1,
      );
      if (child) items.push(child);
    }
    return buildGroupOrLeaf(ctx, defaultTitle, undefined, items);
  }

  const title = resolveDirectoryTitle(ctx, dirPath, defaultTitle);
  const indexFile = getIndexFilename(fullDir);
  const indexRelPath = indexFile ? path.posix.join(dirPath, indexFile) : null;
  const hasIndex = !!(indexFile && indexRelPath && !isExcluded(indexRelPath, ctx.exclusions));
  const link = hasIndex ? toUrlDir(dirPath) : undefined;

  const directives = parseSidebarDirectives(
    readSidebarConfigFile(fullDir, ctx.options.configFilenames, ctx.options.verbose),
  );

  const items: SidebarItem[] = [];
  if (hasIndex && indexFile && link) {
    const indexConfig = directives.find((p) => p.name.toLowerCase() === indexFile.toLowerCase());
    if (!indexConfig?.hidden) {
      items.push({ text: explicitTitle(ctx, indexConfig?.title, path.posix.join(fullDir, indexFile)) ?? title, link });
    }
  }
  const children = collectChildEntries(ctx, dirPath, true, currentDepth, directives);
  items.push(...children.items, ...children.headingGroups);

  return buildGroupOrLeaf(ctx, title, link, items);
}

/**
 * Builds the `SidebarItem` for a directory from its resolved title, its own
 * link (if it has a landing page), and its already-built child items.
 *
 * When `flattenSinglePage` is on and the directory has exactly one visible
 * entry that isn't itself a group (typically just its own landing page),
 * that single entry is collapsed into a plain `{ text, link }` leaf using
 * the directory's own title, instead of a one-item group — matching how a
 * hand-written sidebar would usually represent a single-page section.
 */
function buildGroupOrLeaf(
  ctx: GenerateContext,
  text: string,
  link: string | undefined,
  items: SidebarItem[],
): SidebarItem | null {
  if (!items.length) return null;

  const [onlyItem] = items;
  if (ctx.options.flattenSinglePage && items.length === 1 && onlyItem && !onlyItem.items) {
    return { text, link: onlyItem.link ?? link };
  }

  return {
    text,
    ...(link ? { link } : {}),
    items,
    collapsed: ctx.options.collapsed,
  };
}

/** Return value of {@link collectChildEntries}. */
interface ChildEntries {
  /** Files, web links, and (when eligible) subdirectories to render in place. */
  items: SidebarItem[];
  /**
   * Only populated when `recursive` is false: subdirectories that came back
   * as a real multi-item group rather than a flattened leaf, keyed by name.
   * A non-recursive caller can't nest a whole group here (this pass produces
   * one flat list), so it hands these back for the caller to promote to its
   * own sibling section entries instead.
   */
  deferredGroups: Map<string, SidebarItem>;
  /**
   * One group per `[Heading]` line that has anything under it, holding every
   * entry sorted after it, up to the next heading. Entries in these groups are
   * nested in place whether or not they are themselves groups, so they are
   * never in `items` or `deferredGroups`.
   */
  headingGroups: SidebarItem[];
}

/**
 * Gathers a directory's markdown files (as leaf items) and its inline web
 * links, all sorted per `directives`. Subdirectories are handled differently
 * depending on `recursive`:
 *
 * - `recursive: true` — every subdirectory is nested in place, as a group or
 *   a flattened leaf (see {@link buildGroupOrLeaf}).
 * - `recursive: false` — only subdirectories that flatten to a leaf (when
 *   `flattenSinglePage` is on) are nested in place; ones that stay a real
 *   group come back via `deferredGroups` instead, since a top-level section
 *   promotes those to its own sibling entries rather than nesting them.
 *
 * Entries sorted after a `[Heading]` line go into that heading's group
 * instead, in both modes (see {@link ChildEntries.headingGroups}).
 */
function collectChildEntries(
  ctx: GenerateContext,
  dirPath: string,
  recursive: boolean,
  currentDepth: number,
  directives: SidebarDirective[],
): ChildEntries {
  const { maxDepth } = ctx.options;
  const fullDir = path.posix.join(ctx.rootPath, dirPath);
  const deferredGroups = new Map<string, SidebarItem>();
  const headingGroups: SidebarItem[] = [];

  const hiddenNames = new Set(
    directives.filter((i) => i.hidden && !i.isWebLink && i.name !== '...').map((i) => i.name.toLowerCase()),
  );
  const titleOverrides = new Map<string, string>();
  for (const item of directives) {
    if (!item.hidden && item.title) {
      titleOverrides.set(item.isWebLink && item.url ? item.url : item.name, item.title);
    }
  }

  const itemTypes = new Map<string, 'file' | 'directory' | 'weblink' | 'heading'>();
  const allNames: string[] = [];

  let dirEntries: string[] = [];
  try {
    dirEntries = fs.readdirSync(fullDir);
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read ${fullDir}: ${getErrorMessage(error)}`);
    return { items: [], deferredGroups, headingGroups };
  }

  // A non-recursive pass can only inline subdirectories that flatten to a
  // plain link; without flattenSinglePage, every subdirectory needs its own
  // group, which this pass can't produce, so it's left for the caller.
  const considerDirectories = recursive || ctx.options.flattenSinglePage;

  for (const entry of dirEntries) {
    if (isIndexFilename(entry) || isSkippedEntryName(entry) || entry === '.sidebar') continue;
    if (hiddenNames.has(entry.toLowerCase())) continue;

    const entryFullPath = path.posix.join(fullDir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryFullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (!considerDirectories) continue;
      if (isExcluded(path.posix.join(dirPath, entry), ctx.exclusions)) continue;
      allNames.push(entry);
      itemTypes.set(entry, 'directory');
    } else if (stat.isFile() && path.extname(entry) === '.md') {
      if (isExcluded(path.posix.join(dirPath, entry), ctx.exclusions)) continue;
      allNames.push(entry);
      itemTypes.set(entry, 'file');
    }
  }

  for (const item of directives) {
    if (item.hidden || !item.isWebLink || item.isRootLevel || !item.url) continue;
    if (!allNames.includes(item.url)) {
      itemTypes.set(item.url, 'weblink');
      allNames.push(item.url);
    }
  }

  for (const item of directives) {
    if (!item.isHeading || itemTypes.has(item.name)) continue;
    itemTypes.set(item.name, 'heading');
    allNames.push(item.name);
  }

  const titleOf = (name: string) =>
    itemTypes.get(name) === 'directory'
      ? resolveDirectoryTitle(ctx, path.posix.join(dirPath, name), ctx.titles.fromName(name))
      : (explicitTitle(ctx, titleOverrides.get(name), path.posix.join(fullDir, name)) ?? ctx.titles.fromName(name));
  const {
    names: sortedNames,
    truncated,
    more,
  } = limitFolderEntries(
    ctx,
    dirPath,
    sortItemsByOrder(allNames, directives, entryComparator(ctx, dirPath, titleOf)),
    directives,
    (name) => itemTypes.get(name) === 'file' || itemTypes.get(name) === 'directory',
  );

  const results: SidebarItem[] = [];
  // The `[Heading]` group entries currently go into, once one has been seen.
  let currentHeading: SidebarItem | null = null;
  const place = (item: SidebarItem) => (currentHeading ? currentHeading.items!.push(item) : results.push(item));

  for (const name of sortedNames) {
    const type = itemTypes.get(name);

    if (type === 'heading') {
      currentHeading = {
        text: ctx.titles.fromText(titleOverrides.get(name) ?? name, 'config'),
        items: [],
        collapsed: ctx.options.collapsed,
      };
      headingGroups.push(currentHeading);
    } else if (type === 'file') {
      place({
        text: explicitTitle(ctx, titleOverrides.get(name), path.posix.join(fullDir, name)) ?? ctx.titles.fromName(name),
        link: toFileUrl(dirPath, name),
      });
    } else if (type === 'weblink') {
      place({ text: ctx.titles.fromText(titleOverrides.get(name) ?? name, 'config'), link: name });
    } else if (type === 'directory' && currentDepth < maxDepth) {
      const child = buildDirectorySidebarItem(
        ctx,
        path.posix.join(dirPath, name),
        ctx.titles.fromName(name),
        currentDepth + 1,
      );
      if (!child) continue;
      if (!recursive && child.items && !currentHeading) {
        deferredGroups.set(name, child);
      } else {
        place(child);
      }
    }
  }

  // Entries were left out: end with a link to the landing page, where they can all be found.
  const indexFile = truncated && more ? getIndexFilename(fullDir) : null;
  if (indexFile && !isExcluded(path.posix.join(dirPath, indexFile), ctx.exclusions)) {
    place({ text: ctx.titles.fromText(more!, 'config'), link: toUrlDir(dirPath) });
  }

  return { items: results, deferredGroups, headingGroups: headingGroups.filter((group) => group.items!.length) };
}

/** Lists a directory's visible, non-excluded child directories, in configured order. */
function listChildDirectories(ctx: GenerateContext, dirPath: string, directives: SidebarDirective[]): string[] {
  const fullDir = path.posix.join(ctx.rootPath, dirPath);
  const hiddenNames = new Set(
    directives.filter((i) => i.hidden && !i.isWebLink && i.name !== '...').map((i) => i.name.toLowerCase()),
  );

  const dirs: string[] = [];
  try {
    for (const entry of fs.readdirSync(fullDir)) {
      if (isSkippedEntryName(entry) || hiddenNames.has(entry.toLowerCase())) continue;

      const entryFullPath = path.posix.join(fullDir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(entryFullPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      if (isExcluded(path.posix.join(dirPath, entry), ctx.exclusions)) continue;

      dirs.push(entry);
    }
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read ${fullDir}: ${getErrorMessage(error)}`);
  }

  const titleOf = (name: string) =>
    resolveDirectoryTitle(ctx, path.posix.join(dirPath, name), ctx.titles.fromName(name));
  const sorted = sortItemsByOrder(dirs, directives, entryComparator(ctx, dirPath, titleOf));
  return limitFolderEntries(ctx, dirPath, sorted, directives, () => true).names;
}

/**
 * Resolves a directory's section title: an explicit title on its entry in the
 * *parent's* `.sidebar` file wins, then its landing page's `section-title`
 * frontmatter, then (with `groupTitleFromIndex`) its landing page's title,
 * then `fallbackTitle` (normally the formatted directory name).
 */
function resolveDirectoryTitle(ctx: GenerateContext, dirPath: string, fallbackTitle: string): string {
  const fullDir = path.posix.join(ctx.rootPath, dirPath);
  const parentFullDir = path.posix.dirname(fullDir);
  const baseName = path.posix.basename(dirPath);

  const parentConfigItems = readSidebarConfigFile(parentFullDir, ctx.options.configFilenames, ctx.options.verbose);
  if (parentConfigItems.length) {
    const match = parseSidebarDirectives(parentConfigItems).find((i) => i.name === baseName);
    if (match?.title) return ctx.titles.fromText(match.title, 'config');
  }

  const indexFile = getIndexFilename(fullDir);
  if (indexFile) {
    const indexPath = path.posix.join(fullDir, indexFile);
    const sectionTitle = getSectionTitleFrontmatter(indexPath);
    if (sectionTitle) return ctx.titles.fromText(sectionTitle, 'page');
    if (ctx.options.groupTitleFromIndex) {
      const pageTitle = getMarkdownTitle(indexPath);
      if (pageTitle) return ctx.titles.fromText(pageTitle, 'page');
    }
  }

  return fallbackTitle;
}

/**
 * An entry's explicit title: its `.sidebar` title if it has one, else its
 * page's `title` frontmatter or first `# Heading`, or `null` if it has none.
 */
function explicitTitle(ctx: GenerateContext, configTitle: string | undefined, filePath: string): string | null {
  if (configTitle) return ctx.titles.fromText(configTitle, 'config');
  const pageTitle = getMarkdownTitle(filePath);
  return pageTitle ? ctx.titles.fromText(pageTitle, 'page') : null;
}

/**
 * Files/directories VitePress itself never routes to a page: dotfiles,
 * anything prefixed with `_` (VitePress's convention for partials/snippets
 * meant to be transcluded, not visited directly), and `public` (VitePress's
 * static-assets root, copied as-is and never treated as content). `-`-prefixed
 * and `assets`-prefixed entries are this generator's own additional
 * conventions for non-page content.
 */
function isSkippedEntryName(name: string): boolean {
  return (
    name.startsWith('.') ||
    name.startsWith('_') ||
    name.startsWith('-') ||
    name.startsWith('assets') ||
    name === 'public'
  );
}

function toUrlDir(fsDir: string): string {
  return `/${fsDir}/`.replace(/\/+/g, '/');
}

function toFileUrl(dirPath: string, filename: string): string {
  return `/${path.posix.join(dirPath, filename)}`.replace(/\/+/g, '/');
}
