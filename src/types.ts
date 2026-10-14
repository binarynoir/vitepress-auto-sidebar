/**
 * A single VitePress sidebar entry. Mirrors `DefaultTheme.SidebarItem` from
 * VitePress itself, redeclared here so this package has no hard type
 * dependency on the (still-alpha) VitePress 2 type exports.
 */
export interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}

/** The shape VitePress expects for `themeConfig.sidebar` in multi-sidebar mode. */
export type SidebarMulti = Record<string, SidebarItem[]>;

export interface GenerateSidebarOptions {
  /** How many directory levels deep to recurse. Default: 3. */
  maxDepth?: number;
  /** Truncate generated titles beyond this length. Default: 50. */
  maxTitleLength?: number;
  /** Filenames checked for per-directory sidebar config. Default: ['.sidebar']. */
  configFilenames?: string[];
  /** Filenames checked for per-directory exclusion rules. Default: ['.exclude']. */
  excludeFilenames?: string[];
  /** Initial `collapsed` state applied to generated section headers. Default: false. */
  collapsed?: boolean;
  /**
   * Collapse a subdirectory into a single plain link inside its parent group,
   * instead of promoting it to its own sibling group, whenever that
   * subdirectory has exactly one visible entry (typically just its landing
   * page). Default: true. Set to `false` to always give every subdirectory
   * its own group, even single-page ones.
   */
  flattenSinglePage?: boolean;
  /**
   * Words to replace in titles derived from file and directory names, matched
   * case-insensitively against each word, e.g. `{ github: 'GitHub', cicd: 'CI/CD' }`
   * turns `github-actions` into "GitHub Actions". Titles an author wrote (headings,
   * frontmatter, `.sidebar` lines) are left alone. Default: `{}`.
   */
  titleReplacements?: Record<string, string>;
  /**
   * Remove markdown-tags syntax (`((tag|draft))`, from
   * `@binarynoir/vitepress-markdown-tags`) from every title. Default: true.
   */
  stripTags?: boolean;
  /**
   * Called with every title before it is truncated, after `titleReplacements`
   * and `stripTags`. Return the title to use, or `undefined` to keep it.
   */
  transformTitle?: TransformTitle;
  /**
   * Label a directory's group with its landing page's title (its `title`
   * frontmatter, else its first `# Heading`) when neither its parent's
   * `.sidebar` nor a `section-title` names it, before falling back to the
   * formatted directory name. Default: false.
   */
  groupTitleFromIndex?: boolean;
  /** Log what the generator is doing as it walks the docs tree. Default: false. */
  verbose?: boolean;
}

/**
 * Where a title came from: `name` is derived from a file or directory name,
 * `page` from a page's `title`/`section-title` frontmatter or first `# Heading`,
 * and `config` from a `.sidebar` line.
 */
export type TitleSource = 'name' | 'page' | 'config';

/** See {@link GenerateSidebarOptions.transformTitle}. */
export type TransformTitle = (title: string, context: { source: TitleSource }) => string | undefined;

/** Fully-resolved options, after defaults have been applied. */
export interface ResolvedSidebarOptions {
  maxDepth: number;
  maxTitleLength: number;
  configFilenames: string[];
  excludeFilenames: string[];
  collapsed: boolean;
  flattenSinglePage: boolean;
  titleReplacements: Record<string, string>;
  stripTags: boolean;
  transformTitle?: TransformTitle;
  groupTitleFromIndex: boolean;
  verbose: boolean;
}

/** Frontmatter fields this generator looks at when resolving titles. */
export interface SidebarFrontmatter {
  title?: string;
  'section-title'?: string;
}
