import fs from 'node:fs';
import path from 'node:path';
import { getErrorMessage } from './util.js';

/** Per-generation cache of parsed `.exclude` files, keyed by directory. */
export interface ExclusionContext {
  rootPath: string;
  excludeFilenames: string[];
  cache: Map<string, DirectoryExcludeRules | null>;
}

interface DirectoryExcludeRules {
  excludesSelf: boolean;
  rules: CompiledExcludeRule[];
}

interface CompiledExcludeRule {
  regex: RegExp;
}

export function createExclusionContext(rootPath: string, excludeFilenames: string[]): ExclusionContext {
  return { rootPath, excludeFilenames, cache: new Map() };
}

/** Whether a path (relative to the docs root) is covered by any `.exclude` rule. */
export function isExcluded(relativePath: string, ctx: ExclusionContext): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return !!getDirectoryExcludeRules('', ctx)?.excludesSelf;
  }

  for (const { ancestor, remainder } of getAncestorRemainders(normalizedPath)) {
    const rules = getDirectoryExcludeRules(ancestor, ctx);
    if (!rules) continue;
    if (rules.excludesSelf) return true;
    if (remainder && rules.rules.some((rule) => rule.regex.test(remainder))) return true;
  }

  return false;
}

function getDirectoryExcludeRules(relativeDir: string, ctx: ExclusionContext): DirectoryExcludeRules | null {
  const normalizedDir = normalizeRelativePath(relativeDir);
  if (ctx.cache.has(normalizedDir)) {
    return ctx.cache.get(normalizedDir) ?? null;
  }

  for (const filename of ctx.excludeFilenames) {
    const configPath = normalizedDir
      ? path.posix.join(ctx.rootPath, normalizedDir, filename)
      : path.posix.join(ctx.rootPath, filename);

    if (fs.existsSync(configPath)) {
      const rules = parseExcludeFile(configPath);
      ctx.cache.set(normalizedDir, rules);
      return rules;
    }
  }

  ctx.cache.set(normalizedDir, null);
  return null;
}

function parseExcludeFile(filePath: string): DirectoryExcludeRules | null {
  try {
    const lines = fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    let excludesSelf = false;
    const rules: CompiledExcludeRule[] = [];

    for (const line of lines) {
      if (line === '.') {
        excludesSelf = true;
        continue;
      }
      if (line.startsWith('../')) {
        console.warn(`[vitepress-auto-sidebar] relative exclusions are not supported: "${line}" in ${filePath}`);
        continue;
      }
      const compiled = compileExcludeRule(line);
      if (compiled) rules.push(compiled);
    }

    return { excludesSelf, rules };
  } catch (error) {
    console.error(`[vitepress-auto-sidebar] failed to read exclusion file ${filePath}: ${getErrorMessage(error)}`);
    return null;
  }
}

function compileExcludeRule(rule: string): CompiledExcludeRule | null {
  const isDirectoryPattern = rule.endsWith('/');
  const normalizedRule = isDirectoryPattern ? rule.slice(0, -1) : rule;
  if (!normalizedRule) return null;

  const body = globPatternToRegexBody(normalizedRule);
  const regex = isDirectoryPattern ? new RegExp(`^${body}(?:/.*)?$`) : new RegExp(`^${body}$`);
  return { regex };
}

function globPatternToRegexBody(pattern: string): string {
  let body = '';
  for (const char of pattern) {
    if (char === '*') body += '[^/]*';
    else if (char === '?') body += '[^/]';
    else body += char.replace(/[|\\{}()[\]^$+*.]/g, '\\$&');
  }
  return body;
}

function normalizeRelativePath(input: string): string {
  if (!input) return '';
  const normalized = path.posix.normalize(input.replace(/\\/g, '/')).replace(/^\/+/, '');
  return normalized === '.' ? '' : normalized;
}

function getAncestorRemainders(normalizedPath: string): { ancestor: string; remainder: string }[] {
  const segments = normalizedPath.split('/');
  const results: { ancestor: string; remainder: string }[] = [];
  for (let depth = 0; depth <= segments.length; depth++) {
    results.push({
      ancestor: segments.slice(0, depth).join('/'),
      remainder: segments.slice(depth).join('/'),
    });
  }
  return results;
}
