# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
