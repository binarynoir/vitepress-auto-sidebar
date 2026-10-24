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
  /**
   * Frontmatter keys that hide a page when they are `true`, such as
   * `['draft']`, or `['draft', 'blog.draft']` to include
   * `@binarynoir/vitepress-blog` drafts. Dotted keys read nested values. A
   * folder whose landing page is hidden loses its link. Pass the same list to
   * `@binarynoir/vitepress-exclude` to keep those pages out of the build. Default: `[]`.
   */
  excludeFrontmatter?: string[];
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
   * Title-case titles derived from file and directory names: minor words
   * (`a`, `the`, `and`, `of`, `to`, …) stay lowercase unless first or last, so
   * `guide-to-the-cli` becomes "Guide to the Cli". Set to `false` to capitalise
   * every word. Titles an author wrote are left alone. Default: true.
   */
  titleCase?: boolean;
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
  /**
   * How every folder orders the entries its `.sidebar` doesn't list: a key
   * and an optional direction, written like the `.sort` setting, e.g.
   * `'date desc'` or `'title'`. A folder's own `.sort` line wins.
   * Default: `'name'` (alphabetical by file name).
   */
  sort?: string;
  /**
   * Most entries every folder shows of those its `.sidebar` doesn't list,
   * after sorting, so a folder of 1,000 posts shows only the newest few. A
   * folder's own `.limit` wins. Default: `0` (no limit).
   */
  limit?: number;
  /**
   * When a limit leaves entries out, end the folder's list with a link to its
   * landing page, titled with this text, e.g. `'Older posts'`. A folder's own
   * `.more` wins. Default: none (no link).
   */
  more?: string;
  /**
   * Follow `@binarynoir/vitepress-blog` scopes. A folder whose landing page
   * is a blog (`blog-index`) and has no `.sort` lists its posts pinned first,
   * then newest first, as the blog page does; and a main blog's folder
   * (`blog-index: { scope: site }`) also lists the `scope: site` posts from
   * the folders it covers, so a site-wide post shows in its own folder and in
   * the main blog's. Default: false.
   */
  blog?: boolean;
  /** Log what the generator is doing as it walks the docs tree. Default: false. */
  verbose?: boolean;
}

/**
 * One key of a sort order, from a `.sort: key [asc|desc], …` setting or the `sort` option.
 * `name` is the file or folder name, `title` the title shown in the sidebar,
 * `date` the page's `date` (or `blog.date`), and anything else a frontmatter
 * field, with dots for nested fields.
 */
export interface SidebarSortKey {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * How a folder groups the entries its `.sidebar` doesn't list, from a
 * `.group` setting: by the year or month of their date, or (`blog`) by the
 * section blog a main blog's site-wide post came from.
 */
export type SidebarGroupBy = 'year' | 'month' | 'blog';

/** One or more sort keys, in order: each later key breaks ties in the ones before it. */
export type SidebarSort = SidebarSortKey[];

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
  excludeFrontmatter: string[];
  collapsed: boolean;
  flattenSinglePage: boolean;
  titleReplacements: Record<string, string>;
  titleCase: boolean;
  stripTags: boolean;
  transformTitle?: TransformTitle;
  groupTitleFromIndex: boolean;
  sort?: SidebarSort;
  limit: number;
  more?: string;
  blog: boolean;
  verbose: boolean;
}

/** Frontmatter fields this generator looks at when resolving titles. */
export interface SidebarFrontmatter {
  title?: unknown;
  'section-title'?: string;
  /** A `@binarynoir/vitepress-blog` post's settings; its `title` wins over the page's. */
  blog?: { title?: unknown };
  /** Marks a `@binarynoir/vitepress-blog` blog page, whose `blog.title` doesn't apply. */
  'blog-index'?: unknown;
}
