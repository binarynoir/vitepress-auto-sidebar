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
  /** Log what the generator is doing as it walks the docs tree. Default: false. */
  verbose?: boolean;
}

/** Fully-resolved options, after defaults have been applied. */
export interface ResolvedSidebarOptions {
  maxDepth: number;
  maxTitleLength: number;
  configFilenames: string[];
  excludeFilenames: string[];
  collapsed: boolean;
  verbose: boolean;
}

/** Frontmatter fields this generator looks at when resolving titles. */
export interface SidebarFrontmatter {
  title?: string;
  'section-title'?: string;
}
