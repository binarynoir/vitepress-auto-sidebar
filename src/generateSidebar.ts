import fs from 'node:fs';
import path from 'node:path';
import { formatTitle, truncateTitle } from './formatTitle.js';
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
  sortItemsByOrder,
  type SidebarDirective,
} from './sidebarConfig.js';
import { getErrorMessage } from './util.js';
import type { GenerateSidebarOptions, ResolvedSidebarOptions, SidebarItem, SidebarMulti } from './types.js';

interface GenerateContext {
  rootPath: string;
  options: ResolvedSidebarOptions;
  exclusions: ExclusionContext;
}

/**
 * Scans `rootPath` and builds a VitePress `themeConfig.sidebar` multi-sidebar
 * config: one top-level directory becomes one URL-prefixed section, whose
 * subdirectories become sibling groups within that section.
 *
 * See the README for the `.sidebar` / `.exclude` config file syntax.
 */
export function generateSidebar(rootPath: string, options: GenerateSidebarOptions = {}): SidebarMulti {
  const resolved: ResolvedSidebarOptions = {
    maxDepth: (options.maxDepth ?? 3) + 1,
    maxTitleLength: options.maxTitleLength ?? 50,
    configFilenames: options.configFilenames ?? ['.sidebar'],
    excludeFilenames: options.excludeFilenames ?? ['.exclude'],
    collapsed: options.collapsed ?? false,
    verbose: options.verbose ?? false,
  };

  const ctx: GenerateContext = {
    rootPath,
    options: resolved,
    exclusions: createExclusionContext(rootPath, resolved.excludeFilenames),
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

  const rootTitle = resolveDirectoryTitle(
    ctx,
    fsDir,
    formatTitle(path.posix.basename(fsDir), ctx.options.maxTitleLength),
  );

  const indexFile = getIndexFilename(fullDir);
  const indexRelPath = indexFile ? path.posix.join(fsDir, indexFile) : null;
  const hasIndex = !!(indexFile && indexRelPath && !isExcluded(indexRelPath, ctx.exclusions));
  const indexConfig = indexFile ? directives.find((p) => p.name.toLowerCase() === indexFile.toLowerCase()) : undefined;
  const indexHidden = !!indexConfig?.hidden;

  const rootChildren: SidebarItem[] = [];
  if (hasIndex && indexFile && !indexHidden) {
    const explicitTitle = indexConfig?.title ?? getMarkdownTitle(path.posix.join(fullDir, indexFile));
    rootChildren.push({
      text: explicitTitle ? truncateTitle(explicitTitle, ctx.options.maxTitleLength) : rootTitle,
      link: urlDir,
    });
  }
  rootChildren.push(...collectChildEntries(ctx, fsDir, false, currentDepth, directives));

  const rootItem: SidebarItem = {
    text: rootTitle,
    ...(hasIndex && !indexHidden ? { link: urlDir } : {}),
    ...(rootChildren.length ? { items: rootChildren, collapsed: ctx.options.collapsed } : {}),
  };

  // ROOT=-prefixed web links, positioned by their line index relative to `...`.
  const rootLevelLinks = new Map<number, SidebarItem>();
  directives.forEach((item, index) => {
    if (item.hidden || item.name === '...') return;
    if (item.isRootLevel && item.isWebLink && item.url && item.title) {
      rootLevelLinks.set(index, { text: truncateTitle(item.title, ctx.options.maxTitleLength), link: item.url });
    }
  });

  const specifiedOrder = new Map<string, number>();
  directives.forEach((item, index) => {
    if (item.hidden || item.name === '...' || item.isWebLink) return;
    specifiedOrder.set(item.name, index);
  });

  const hiddenDirNames = new Set(
    directives.filter((i) => i.hidden && !i.isWebLink && i.name !== '...').map((i) => i.name.toLowerCase()),
  );
  const allDirectories =
    currentDepth < ctx.options.maxDepth
      ? listChildDirectories(ctx, fsDir, directives).filter((dir) => !hiddenDirNames.has(dir.toLowerCase()))
      : [];

  const buildChildSection = (dir: string): SidebarItem | null =>
    buildDirectorySidebarItem(
      ctx,
      path.posix.join(fsDir, dir),
      formatTitle(dir, ctx.options.maxTitleLength),
      currentDepth + 1,
    );

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
        formatTitle(sub, ctx.options.maxTitleLength),
        currentDepth + 1,
      );
      if (child) items.push(child);
    }
    return items.length ? { text: defaultTitle, collapsed: ctx.options.collapsed, items } : null;
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
      const explicitTitle = indexConfig?.title ?? getMarkdownTitle(path.posix.join(fullDir, indexFile));
      items.push({ text: explicitTitle ? truncateTitle(explicitTitle, ctx.options.maxTitleLength) : title, link });
    }
  }
  items.push(...collectChildEntries(ctx, dirPath, true, currentDepth, directives));

  if (!items.length) return null;

  return {
    text: title,
    ...(link ? { link } : {}),
    items,
    collapsed: ctx.options.collapsed,
  };
}

/**
 * Gathers a directory's markdown files (as leaf items), its inline web links,
 * and — when `recursive` — its subdirectories (as nested groups), all sorted
 * per `directives`.
 */
function collectChildEntries(
  ctx: GenerateContext,
  dirPath: string,
  recursive: boolean,
  currentDepth: number,
  directives: SidebarDirective[],
): SidebarItem[] {
  const { maxDepth, maxTitleLength } = ctx.options;
  const fullDir = path.posix.join(ctx.rootPath, dirPath);

  const hiddenNames = new Set(
    directives.filter((i) => i.hidden && !i.isWebLink && i.name !== '...').map((i) => i.name.toLowerCase()),
  );
  const titleOverrides = new Map<string, string>();
  for (const item of directives) {
    if (!item.hidden && item.title) {
      titleOverrides.set(item.isWebLink && item.url ? item.url : item.name, item.title);
    }
  }

  const itemTypes = new Map<string, 'file' | 'directory' | 'weblink'>();
  const allNames: string[] = [];

  let dirEntries: string[] = [];
  try {
    dirEntries = fs.readdirSync(fullDir);
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read ${fullDir}: ${getErrorMessage(error)}`);
    return [];
  }

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
      if (!recursive) continue;
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

  const sortedNames = sortItemsByOrder(allNames, directives);

  const results: SidebarItem[] = [];
  for (const name of sortedNames) {
    const type = itemTypes.get(name);

    if (type === 'file') {
      const explicitTitle = titleOverrides.get(name) ?? getMarkdownTitle(path.posix.join(fullDir, name));
      results.push({
        text: explicitTitle ? truncateTitle(explicitTitle, maxTitleLength) : formatTitle(name, maxTitleLength),
        link: toFileUrl(dirPath, name),
      });
    } else if (type === 'weblink') {
      results.push({ text: truncateTitle(titleOverrides.get(name) ?? name, maxTitleLength), link: name });
    } else if (type === 'directory' && currentDepth < maxDepth) {
      const child = buildDirectorySidebarItem(
        ctx,
        path.posix.join(dirPath, name),
        formatTitle(name, maxTitleLength),
        currentDepth + 1,
      );
      if (child) results.push(child);
    }
  }

  return results;
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

  return sortItemsByOrder(dirs, directives);
}

/**
 * Resolves a directory's section title: an explicit title on its entry in the
 * *parent's* `.sidebar` file wins, then its README's `section-title`
 * frontmatter, then `fallbackTitle` (normally `formatTitle(dirname)`).
 */
function resolveDirectoryTitle(ctx: GenerateContext, dirPath: string, fallbackTitle: string): string {
  const fullDir = path.posix.join(ctx.rootPath, dirPath);
  const parentFullDir = path.posix.dirname(fullDir);
  const baseName = path.posix.basename(dirPath);

  const parentConfigItems = readSidebarConfigFile(parentFullDir, ctx.options.configFilenames, ctx.options.verbose);
  if (parentConfigItems.length) {
    const match = parseSidebarDirectives(parentConfigItems).find((i) => i.name === baseName);
    if (match?.title) return truncateTitle(match.title, ctx.options.maxTitleLength);
  }

  const indexFile = getIndexFilename(fullDir);
  if (indexFile) {
    const sectionTitle = getSectionTitleFrontmatter(path.posix.join(fullDir, indexFile));
    if (sectionTitle) return truncateTitle(sectionTitle, ctx.options.maxTitleLength);
  }

  return fallbackTitle;
}

/**
 * Files/directories VitePress itself never routes to a page: dotfiles, and
 * anything prefixed with `_` (VitePress's convention for partials/snippets
 * meant to be transcluded, not visited directly). `-`-prefixed and `assets`
 * entries are this generator's own additional conventions for non-page content.
 */
function isSkippedEntryName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_') || name.startsWith('-') || name.startsWith('assets');
}

function toUrlDir(fsDir: string): string {
  return `/${fsDir}/`.replace(/\/+/g, '/');
}

function toFileUrl(dirPath: string, filename: string): string {
  return `/${path.posix.join(dirPath, filename)}`.replace(/\/+/g, '/');
}
