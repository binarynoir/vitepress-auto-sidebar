# vitepress-auto-sidebar

[![npm version](https://img.shields.io/npm/v/vitepress-auto-sidebar.svg)](https://www.npmjs.com/package/vitepress-auto-sidebar)
[![CI](https://github.com/BinaryNoir/vitepress-auto-sidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/BinaryNoir/vitepress-auto-sidebar/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vitepress-auto-sidebar.svg)](LICENSE)

Generate a [VitePress 2](https://vitepress.dev) multi-sidebar config by scanning
your docs folder, instead of hand-maintaining `themeConfig.sidebar`. Ordering,
custom titles, hidden sections, and external links are all controlled with a
tiny plain-text `.sidebar` file dropped into any directory — no code changes
needed to reorder your docs.

## Install

```sh
npm install vitepress-auto-sidebar
```

## Usage

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress';
import { generateSidebar } from 'vitepress-auto-sidebar';
import path from 'node:path';

export default defineConfig({
  themeConfig: {
    sidebar: generateSidebar(path.resolve(__dirname, '../docs'), {
      maxDepth: 3,
      maxTitleLength: 50,
      verbose: false,
    }),
  },
});
```

`generateSidebar(rootPath, options?)` walks `rootPath`. Each top-level
subdirectory becomes one entry in the returned sidebar, keyed by its URL
prefix (e.g. `/guides/`); its own subdirectories become sibling groups nested
under that same key, matching VitePress's [multi-sidebar](https://vitepress.dev/reference/default-theme-sidebar#multiple-sidebars)
format.

A directory's landing page — `index.md` if present, otherwise `README.md`
(both matched case-insensitively; VitePress auto-rewrites either to
`index.html`) — becomes that section/group's landing link; every other
`*.md` file becomes a child entry. A file's title is resolved, in order:

1. An explicit title from a `.sidebar` line (see below).
2. The `title` frontmatter field.
3. The file's first `# Heading`.
4. The filename, formatted (`getting-started.md` → "Getting Started").

## Options

| Option             | Default        | Description                                                     |
| ------------------ | -------------- | --------------------------------------------------------------- |
| `maxDepth`         | `3`            | How many directory levels deep to recurse.                      |
| `maxTitleLength`   | `50`           | Truncate generated titles beyond this length.                   |
| `configFilenames`  | `['.sidebar']` | Filenames checked for per-directory ordering config.            |
| `excludeFilenames` | `['.exclude']` | Filenames checked for per-directory exclusion rules.            |
| `collapsed`        | `false`        | Initial `collapsed` state applied to generated section headers. |
| `verbose`          | `false`        | Log each directory as it's processed.                           |

## `.sidebar` files

Drop a `.sidebar` file into any docs directory to control the order and
titles of its contents (files, subdirectories, and web links) without
touching config code. Lines starting with `#` are comments.

```txt
# docs/guides/.sidebar

introduction:Intro
getting-started:"Getting Started"
ROOT="https://status.example.com":Status
advanced-topics
...
migrations:Migrations
"https://example.com/faq":FAQ
```

| Syntax                      | Meaning                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `name`                      | Order this file/subdirectory.                                           |
| `name:Custom Title`         | Order it and override its display title.                                |
| `"https://…":Title`         | Insert an external link into this section, in place.                    |
| `ROOT="https://…":Title`    | Insert an external link at the top level of the enclosing section.      |
| `...`                       | Everything not listed explicitly goes here, alphabetically.             |
| `-name`                     | Hide this entry entirely (it's still on disk, just not in the sidebar). |
| `.hide`                     | Hide _this_ directory's own link, but keep showing its children.        |
| `.hideall` (or `.hide-all`) | Skip this directory and everything under it.                            |

Ordering: items listed before `...` come first, in the order listed; items
listed after `...` come last, in the order listed; everything else is
inserted alphabetically at the `...` marker (or appended alphabetically, if
there's no `...` at all).

A directory's own section/group title is resolved, in order: an explicit
`name:Title` for it in its _parent's_ `.sidebar`, then a `section-title`
frontmatter field on its own `README.md`, then its formatted directory name.

## `.exclude` files

Drop a `.exclude` file into a directory to remove files/subdirectories from
the generated sidebar (e.g. drafts, or content excluded from the VitePress
build itself) without deleting them:

```txt
# docs/products/.exclude

draft/
internal-*.md
```

- A trailing `/` marks a directory-only pattern (matches the directory and
  everything under it).
- `*` and `?` are supported as glob wildcards.
- A lone `.` excludes the directory the `.exclude` file itself lives in.

## `sidebar.json` escape hatch

For a directory whose sidebar you'd rather hand-author outright, drop a
`sidebar.json` next to it containing the exact object VitePress expects for
that URL prefix — it's used verbatim, and generation for that directory stops
there:

```json
{
  "/products/": [{ "text": "Custom Group", "link": "/products/", "items": [] }]
}
```

## Why not VitePress's built-in `getSidebar`?

VitePress can build a _flat_ sidebar from a directory automatically, but it
doesn't support nested multi-level sections, per-directory ordering, hiding,
or external links without writing that logic yourself. This package covers
that gap while staying data-driven — reordering docs is a `.sidebar` file
edit, not a `config.ts` change.

## Releasing

Releases are tag-triggered. To ship a new version, from a clean `main` that's
in sync with `origin/main`:

```sh
npm run release:patch   # or release:minor / release:major
```

This runs typecheck/lint/test/build locally, then `npm version <bump>`
(bumps `package.json`, commits, and creates a matching `vX.Y.Z` tag) and
`git push --follow-tags`. Pushing that tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which
re-runs the checks, publishes to npm (with
[provenance](https://docs.npmjs.com/generating-provenance-statements)), and
creates a GitHub release with auto-generated notes.

For a prerelease or an explicit version, use `npm run release -- <arg>`
(e.g. `npm run release -- 1.2.3` or `npm run release -- prerelease`) — see
[`npm version`](https://docs.npmjs.com/cli/v10/commands/npm-version) for the
full list of accepted values.

This requires an `NPM_TOKEN` repository secret (an npm
[automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens)
with publish access) — set it under Settings → Secrets and variables →
Actions.

## License

MIT
