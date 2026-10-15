// Articles, coordinating conjunctions and short prepositions, kept lowercase
// mid-title by title case.
const MINOR_WORDS = new Set(
  'a an the and but for nor or so yet as at by from in into near of off on onto per to up via vs with'.split(' '),
);

/** `text` with `-`/`_` separators turned into single spaces, trimmed. */
function spaceWords(text: string): string {
  return text.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Turns a filename or directory name into a human-readable sidebar title.
 *
 * - Strips a `.md` extension.
 * - Strips a leading numeric ordering prefix (`01-`, `02_`, `03.`).
 * - Replaces `-` and `_` separators with spaces.
 * - Strips matching surrounding quotes (`"name"` or `'name'`).
 * - Replaces each word or phrase found in `replacements` (matched
 *   case-insensitively, longest phrase first) with its value, as written:
 *   `{ github: 'GitHub', 'vs code': 'VS Code' }` turns `github-actions` into
 *   "GitHub Actions" and `vs-code-setup` into "VS Code Setup".
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
  // Keys are split into words the same way as titles, so `vs-code` and `vs code` match alike.
  const phrases = Object.entries(replacements)
    .map(([key, value]) => ({ words: spaceWords(key).toLowerCase().split(' '), value }))
    .filter(({ words }) => words[0] !== '')
    .sort((a, b) => b.words.length - a.words.length);

  let title = input.replace(/\.md$/i, '');
  title = title.replace(/^\d+[-_.]\s*/, '');
  title = spaceWords(title);
  title = title.replace(/^(['"])(.*)\1$/, '$2').trim();

  // Each part is a word to case, or a replacement to keep exactly as written.
  const words = title.split(' ');
  const parts: { text: string; fixed: boolean }[] = [];
  for (let i = 0; i < words.length;) {
    const lower = words.slice(i).map((word) => word.toLowerCase());
    const match = phrases.find((phrase) => phrase.words.every((word, j) => lower[j] === word));
    if (match) {
      parts.push({ text: match.value, fixed: true });
      i += match.words.length;
    } else {
      parts.push({ text: words[i], fixed: false });
      i += 1;
    }
  }

  title = parts
    .map(({ text: word, fixed }, i) => {
      if (!word || fixed) return word;
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word; // preserve acronyms
      }
      if (titleCase && i > 0 && i < parts.length - 1 && MINOR_WORDS.has(word.toLowerCase())) {
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
