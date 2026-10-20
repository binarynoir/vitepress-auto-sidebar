# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-10-20

### Added

- `.sort: key [asc|desc], …` setting in `.sidebar` files: order the entries a folder doesn't list by name, title, date or any frontmatter field (dotted for nested fields), with pages that have no value last. Several comma-separated keys break ties in turn, so `.sort: blog.sticky desc, date desc` keeps sticky posts on top
- `sort` option: the same order for every folder, which a folder's `.sort` overrides
- `.limit: n` and `.more: Text` settings, and `limit` and `more` options: show at most `n` of the entries a folder's config doesn't list, after sorting, and optionally end with a link to its landing page when some were left out
- `.sidebar` settings follow one rule: a line starting with a dot is a setting, `.name` or `.name: value`. Unknown settings and bad values log a warning naming the file and line

## [0.8.1] - 2026-10-16

### Changed

- Update dev dependencies: tsup 9, ESLint, typescript-eslint, Prettier, Vite, Vitest and `@types/node`. No change to the published package

## [0.8.0] - 2026-10-16

### Changed

- Frontmatter is now read with the maintained [`yaml`](https://github.com/eemeli/yaml) package instead of `gray-matter`, which has had no release since 2023 and pulled in `js-yaml` 3 and a `sprintf-js` advisory. Frontmatter is parsed as YAML 1.2, so an unquoted `yes` or `no` in a title is kept as text

## [0.7.2] - 2026-10-15

### Changed

- README: add Sidebar Accordion to the list of BinaryNoir plugins

## [0.7.1] - 2026-10-15

### Added

- `titleReplacements` keys can be phrases: `{ 'vs code': 'VS Code' }` turns `vs-code-setup` into "VS Code Setup". The longest matching phrase wins
- Titles made from file and folder names drop matching surrounding quotes (`"draft-notes"` → "Draft Notes")
- README documents the exported title helpers (`formatTitle`, `truncateTitle`, `stripTagSyntax`) and where they can run

### Changed

- Title case also keeps `from`, `into`, `near`, `onto` and `with` lowercase mid-title

## [0.7.0] - 2026-10-14

### Added

- `titleCase` option (default `true`): titles made from file and folder names are title-cased, so articles, short conjunctions and prepositions stay lowercase unless they are the first or last word (`guide-to-the-cli` → "Guide to the Cli"). Set it to `false` to capitalise every word, as before
- `formatTitle` takes an optional fourth argument, `titleCase`

### Changed

- Titles made from file and folder names keep minor words such as "a", "and", "of", "the" and "to" lowercase mid-title; titles an author wrote are unchanged

## [0.6.1] - 2026-10-14

Replaces 0.6.0, which was withdrawn from npm. The changes are the same; only example names in the documentation differ.

### Added

- `titleReplacements` option: words to replace in titles made from file and folder names, e.g. `{ github: "GitHub" }` turns `github-actions` into "GitHub Actions"
- `stripTags` option (default `true`): remove markdown-tags syntax (`((tag|draft))`) from titles
- `transformTitle` option: a hook that gets every title, and where it came from, before truncation
- `groupTitleFromIndex` option: label a folder's group with its landing page's `title` or first `# Heading` before falling back to the formatted folder name
- `formatTitle` takes an optional third argument, the word replacements; `stripTagSyntax` is exported

### Fixed

- `.sidebar` link lines with whitespace after the colon and a quoted title (`https://example.com: "Title"`, `"https://example.com": 'Title'`) were silently dropped; they are now parsed, as are URLs with a port (`https://host:8080/path:Title`)
- `name.md: "Title"` keeps no stray quotes in its title
- A `.sidebar` line that can't be parsed (a link with no title, or a title with unmatched quotes) logs a warning naming the file and line, instead of being dropped silently
- README: `README.md` landing pages need README Index to be served at the directory URL; VitePress serves them at `README.html` on its own

## [0.5.0] - 2026-10-14

### Added

- `[Group Title]` lines in `.sidebar` files: heading groups that gather the entries listed after them, so pages can be grouped by topic without moving them into subfolders

### Changed

- README: list the Exclude, README Index and Broken Links plugins, and point documentation links to binarynoir.tech

## [0.4.12] - 2026-10-13

### Changed

- README: remove the binarynoir.github.io badge; the binarynoir.tech website badge remains

## [0.4.11] - 2026-10-13

### Changed

- README: add a Feedback and support section with links to report a bug, request a feature, or browse open issues
- README: add a More from BinaryNoir section with the BinaryNoir logo and links to the other plugins and command-line tools on [binarynoir.github.io](https://binarynoir.github.io)
- README: add a binarynoir.github.io badge

## [0.4.10] - 2026-10-08

### Changed

- Add a link to the documentation site in README

## [0.4.9] - 2026-10-06

### Changed

- Add support and website badges to README
- Add support, author, and acknowledgments sections to README

## [0.4.8] - 2026-10-05

### Changed

- Updated README.md to add references to vitepress-auto-navbar

## [0.4.7] - 2026-09-21

### Fixed

- Updated README.md to clarify sidebar file entries require .md extension

## [0.4.6] - 2026-09-21

### Changed

- Replace example references with API reference examples.

## [0.4.5] - 2026-09-21

### Changed

- Rewrote the README's introduction and feature summary for clarity.

## [0.4.4] - 2026-09-21

### Changed

- Updated dev dependencies to their latest compatible versions.

## [0.4.3] - 2026-09-21

### Changed

- **Breaking:** raised the minimum supported Node.js version from `>=18` to `>=22`. CI now tests against Node 22, 24, and 26 (dropping the 18/20 matrix entries), and releases publish on Node 26.

## [0.4.2] - 2026-09-10

### Fixed

- `flattenSinglePage` now also applies to a top-level section itself, not just its subdirectories. A section with nothing but its own landing page (e.g. a `tools-resources/` with only a `README.md`) was still forced into a group whose only child repeated the section's own label; it's now a single plain link, consistent with how a single-page subdirectory has always been handled.

## [0.4.1] - 2026-09-10

### Fixed

- Removed unused variable from README.md usage code example.

## [0.4.0] - 2026-09-10

### Changed

- `flattenSinglePage` now **nests** a single-page subdirectory as a plain link inside its parent's own group, instead of collapsing it to a leaf but still promoting it to a sibling group next to its parent. A subdirectory is only promoted to its own sibling group when it actually has more than one visible entry. This changes the generated sidebar's shape again for anyone relying on `0.3.1`'s flatten-but-still-sibling behavior.

## [0.3.2] - 2026-09-10

### Fixed

- README `[!NOTE]` GitHub-only alert syntax replaced with a plain blockquote — npmjs.com's README renderer doesn't support it and was showing the literal marker text instead of a styled callout.

## [0.3.1] - 2026-09-10

### Changed

- `flattenSinglePage` now defaults to `true` (was `false` in 0.3.0). Any subdirectory with only one visible entry (typically just its landing page) is now collapsed into a plain link by default, instead of becoming its own sibling group. **This changes the shape of the generated sidebar for existing callers** who weren't passing the option explicitly — set `flattenSinglePage: false` to keep the previous behavior.

## [0.3.0] - 2026-09-10

### Added

- `flattenSinglePage` option: collapses a subdirectory that has only one visible entry (typically just its own landing page) into a plain link in its parent group, instead of always promoting it to its own sibling group.

### Fixed

- `generateSidebar` no longer emits a spurious `/public/` section from VitePress's static-assets root directory (`docs/public/`), which was being treated as an ordinary content directory.

## [0.2.1] - 2026-09-10

### Fixed

- README.md LICENSE badge

## [0.2.0] - 2026-09-10

### Added

- `generateSidebar(rootPath, options)`: scans a docs folder and builds a VitePress 2 multi-sidebar config, one entry per top-level directory.
- `.sidebar` files for per-directory ordering, custom titles, hiding entries, and inserting external links (including `ROOT=`-anchored root-level links).
- `.exclude` files for glob-based exclusion of files/directories from the generated sidebar.
- `sidebar.json` escape hatch for hand-authoring a section's sidebar verbatim.
- Title resolution: `.sidebar` override → frontmatter `title` → first `# Heading` → formatted filename.
- `section-title` frontmatter support for directory group titles.
- Options: `maxDepth`, `maxTitleLength`, `configFilenames`, `excludeFilenames`, `collapsed`, `verbose`.
- `formatTitle` and `truncateTitle` exported as standalone utilities.
