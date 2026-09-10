# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
