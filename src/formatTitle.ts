/**
 * Turns a filename or directory name into a human-readable sidebar title.
 *
 * - Strips a `.md` extension.
 * - Strips a leading numeric ordering prefix (`01-`, `02_`, `03.`).
 * - Replaces `-` and `_` separators with spaces.
 * - Replaces each word found in `replacements` (matched case-insensitively)
 *   with its value, as written: `{ github: 'GitHub' }` turns `github-actions` into
 *   "GitHub Actions".
 * - Title-cases each other word, except words that are already all-caps
 *   (acronyms like `CI` or `API` are left alone).
 * - Truncates to `maxLength`, appending an ellipsis if truncated.
 */
export function formatTitle(input: string, maxLength = 50, replacements: Record<string, string> = {}): string {
  const replace = new Map(Object.entries(replacements).map(([word, value]) => [word.toLowerCase(), value]));
  let title = input.replace(/\.md$/i, '');
  title = title.replace(/^\d+[-_.]\s*/, '');
  title = title.replace(/[-_]+/g, ' ').trim();
  title = title.replace(/\s+/g, ' ');

  title = title
    .split(' ')
    .map((word) => {
      if (!word) return word;
      const replacement = replace.get(word.toLowerCase());
      if (replacement !== undefined) return replacement;
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word; // preserve acronyms
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  return truncateTitle(title, maxLength);
}

/**
 * Truncates an already human-authored title (frontmatter `title`, a `.sidebar`
 * override, a page's first `# Heading`) to `maxLength`, without touching its
 * casing or punctuation — unlike {@link formatTitle}, this never mangles
 * hyphens or re-cases words, since the input is assumed to already be the
 * text an author chose to display.
 */
export function truncateTitle(title: string, maxLength = 50): string {
  const trimmed = title.trim();
  if (maxLength > 0 && trimmed.length > maxLength) {
    return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }
  return trimmed;
}
