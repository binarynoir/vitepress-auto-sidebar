// Articles, coordinating conjunctions and short prepositions, kept lowercase
// mid-title by title case.
const MINOR_WORDS = new Set('a an the and but for nor or so yet as at by in of off on per to up via vs'.split(' '));

/**
 * Turns a filename or directory name into a human-readable sidebar title.
 *
 * - Strips a `.md` extension.
 * - Strips a leading numeric ordering prefix (`01-`, `02_`, `03.`).
 * - Replaces `-` and `_` separators with spaces.
 * - Replaces each word found in `replacements` (matched case-insensitively)
 *   with its value, as written: `{ github: 'GitHub' }` turns `github-actions` into
 *   "GitHub Actions".
 * - Capitalizes each other word, except words that are already all-caps
 *   (acronyms like `CI` or `API` are left alone).
 * - With `titleCase` (the default), keeps minor words (articles, short
 *   conjunctions and prepositions such as `a`, `and`, `of`, `to`) lowercase
 *   unless they are the first or last word: `guide-to-the-cli` becomes
 *   "Guide to the Cli".
 * - Truncates to `maxLength`, appending an ellipsis if truncated.
 */
export function formatTitle(
  input: string,
  maxLength = 50,
  replacements: Record<string, string> = {},
  titleCase = true,
): string {
  const replace = new Map(Object.entries(replacements).map(([word, value]) => [word.toLowerCase(), value]));
  let title = input.replace(/\.md$/i, '');
  title = title.replace(/^\d+[-_.]\s*/, '');
  title = title.replace(/[-_]+/g, ' ').trim();
  title = title.replace(/\s+/g, ' ');

  const words = title.split(' ');
  title = words
    .map((word, i) => {
      if (!word) return word;
      const replacement = replace.get(word.toLowerCase());
      if (replacement !== undefined) return replacement;
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word; // preserve acronyms
      }
      if (titleCase && i > 0 && i < words.length - 1 && MINOR_WORDS.has(word.toLowerCase())) {
        return word.toLowerCase();
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
