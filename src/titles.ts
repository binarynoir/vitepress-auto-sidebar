import { formatTitle, truncateTitle } from './formatTitle.js';
import type { TitleSource, TransformTitle } from './types.js';

// `((tag|label))`, `((tag/label/background/foreground))` and their `((<tag…))`
// form, as `@binarynoir/vitepress-markdown-tags` writes them.
const TAG_RE = /\(\(<?tag([|/])[^|/)\r\n]*(?:\1[^|/)\r\n]*){0,2}\)\)/g;

/** `title` without markdown-tags syntax (`((tag|draft))`), its spacing tidied. */
export function stripTagSyntax(title: string): string {
  return title.replace(TAG_RE, ' ').replace(/\s+/g, ' ').trim();
}

export interface TitleOptions {
  maxTitleLength: number;
  titleReplacements: Record<string, string>;
  titleCase: boolean;
  stripTags: boolean;
  transformTitle?: TransformTitle;
}

/** Turns names and authored text into finished titles, the same way everywhere. */
export interface Titles {
  /** A title derived from a file or directory name (`github-actions` → "GitHub Actions"). */
  fromName(name: string): string;
  /** A title an author wrote: a heading, frontmatter, or a config file line. */
  fromText(text: string, source: Exclude<TitleSource, 'name'>): string;
}

export function createTitles(options: TitleOptions): Titles {
  const finish = (title: string, source: TitleSource) => {
    let result = options.stripTags ? stripTagSyntax(title) : title;
    if (options.transformTitle) result = options.transformTitle(result, { source }) ?? result;
    return truncateTitle(result, options.maxTitleLength);
  };
  return {
    // Formatted without truncation; `finish` truncates once, after the transform.
    fromName: (name) => finish(formatTitle(name, 0, options.titleReplacements, options.titleCase), 'name'),
    fromText: (text, source) => finish(text, source),
  };
}
