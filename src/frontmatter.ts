import { parse } from 'yaml';

// An opening `---` line, an optional YAML body, and a closing `---` line.
const FRONTMATTER_RE = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a Markdown file into its YAML frontmatter and the content after
 * it. A file without frontmatter returns `{}` and the whole file. Invalid
 * YAML throws, so callers can report it.
 */
export function readFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const source = raw.replace(/^﻿/, '');
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return { data: {}, content: source };

  const data: unknown = match[1] ? parse(match[1]) : null;
  return {
    data: data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
    content: source.slice(match[0].length),
  };
}
