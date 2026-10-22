# vitepress-auto-sidebar

[![npm version](https://img.shields.io/npm/v/@binarynoir/vitepress-auto-sidebar.svg)](https://www.npmjs.com/package/@binarynoir/vitepress-auto-sidebar)
[![CI](https://github.com/binarynoir/vitepress-auto-sidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/binarynoir/vitepress-auto-sidebar/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@binarynoir/vitepress-auto-sidebar.svg)](LICENSE)

A [VitePress 2](https://vitepress.dev) plugin that builds your sidebar
config for you by scanning your docs folder, so you stop hand-maintaining
`themeConfig.sidebar`.

[Documentation and live demo](https://binarynoir.tech/plugins/auto-sidebar)

[![Support me on Buy Me a Coffee](https://img.shields.io/badge/Support%20me-Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/binarynoir)
[![Support me on Ko-fi](https://img.shields.io/badge/Support%20me-Ko--fi-blue?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/binarynoir)
[![More tools](https://img.shields.io/badge/Website-binarynoir.tech-8c8c8c?style=for-the-badge)](https://binarynoir.tech)

## What this does

VitePress needs to be told what pages exist and how to group them in the
sidebar. Normally that means writing and updating a `themeConfig.sidebar`
list by hand in your config file, and remembering to touch it every time you
add, move, or rename a page.

This plugin builds that list for you instead, by reading your actual docs
folder structure. Add a new Markdown file and it shows up in the sidebar on
its own, titled from its heading. When you do want a specific order, a
custom title, or to hide something, you control that with a small
plain-text `.sidebar` file dropped into that folder, not a change to your
config code.

## Install

```sh
npm install @binarynoir/vitepress-auto-sidebar
```

## Usage

```ts
// .vitepress/config.mts
import { defineConfig } from 'vitepress';
import { generateSidebar } from '@binarynoir/vitepress-auto-sidebar';
import path from 'node:path';

export default defineConfig({
  themeConfig: {
    sidebar: generateSidebar(path.resolve(import.meta.dirname, '../docs'), {
      maxDepth: 3,
      maxTitleLength: 50,
      verbose: false,
    }),
  },
});
```

> **Note:** Use `import.meta.dirname`, not `__dirname` — VitePress config
> files are ESM, and `__dirname` isn't defined there under VitePress's newer
> native config loader. If your project uses a plain (non-`.mts`) `config.ts`
> with `__dirname` already working via bundling, either form works, but
> `import.meta.dirname` is the forward-compatible choice.

`generateSidebar(rootPath, options?)` walks `rootPath`. Each top-level
subdirectory becomes one entry in the returned sidebar, keyed by its URL
prefix (e.g. `/guides/`); its own subdirectories become sibling groups nested
under that same key, matching VitePress's [multi-sidebar](https://vitepress.dev/reference/default-theme-sidebar#multiple-sidebars)
format. See [Grouping subdirectories](#grouping-subdirectories) below for how
that grouping is controlled.

A directory's landing page — `index.md` if present, otherwise `README.md`
(both matched case-insensitively) — becomes that section/group's landing
link; every other `*.md` file becomes a child entry. VitePress itself only
serves `index.md` at the directory URL: a `README.md` is served at
`README.html`. For `README.md` landing pages, add
[README Index](https://binarynoir.tech/plugins/readme-index/)
(`readmeRewrites` and `readmeLinks`), which serves them at the directory URL
and points links to them there. A file's title is resolved, in order:

1. An explicit title from a `.sidebar` line (see below).
2. The `title` frontmatter field.
3. The file's first `# Heading`.
4. The filename, formatted (`getting-started.md` → "Getting Started").

Directories/files VitePress itself never turns into pages are skipped
automatically: anything starting with `.` or `_` (VitePress's own convention
for partials/snippets meant to be transcluded, not visited directly), and
`public/` (VitePress's static-assets root). Anything starting with `-` or
named `assets*` is skipped too, as this generator's own convention for
non-page content.

## Options

| Option                | Default        | Description                                                                                                                                                                                                                    |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxDepth`            | `3`            | How many directory levels deep to recurse.                                                                                                                                                                                     |
| `maxTitleLength`      | `50`           | Truncate generated titles beyond this length.                                                                                                                                                                                  |
| `configFilenames`     | `['.sidebar']` | Filenames checked for per-directory ordering config.                                                                                                                                                                           |
| `excludeFilenames`    | `['.exclude']` | Filenames checked for per-directory exclusion rules.                                                                                                                                                                           |
| `excludeFrontmatter`  | `[]`           | Frontmatter keys that hide a page when `true`, such as `['draft', 'blog.draft']`. See [Drafts in frontmatter](#drafts-in-frontmatter).                                                                                         |
| `collapsed`           | `false`        | Initial `collapsed` state applied to generated section headers (the ones that still have `items` after flattening, see below).                                                                                                 |
| `flattenSinglePage`   | `true`         | Collapse a subdirectory into a plain link in its parent group instead of its own sibling group, when it has only one visible entry (typically just its landing page). See [Grouping subdirectories](#grouping-subdirectories). |
| `titleReplacements`   | `{}`           | Words to replace in titles made from file and folder names, e.g. `{ github: "GitHub" }`. See [Titles](#titles).                                                                                                                |
| `titleCase`           | `true`         | Title-case titles made from file and folder names, keeping minor words like "to" and "the" lowercase. See [Titles](#titles).                                                                                                   |
| `stripTags`           | `true`         | Remove markdown-tags syntax (`((tag\|draft))`) from titles. See [Titles](#titles).                                                                                                                                             |
| `transformTitle`      | none           | A function that gets every title, and its source, before truncation. See [Titles](#titles).                                                                                                                                    |
| `sort`                | `'name'`       | How every folder orders the entries its `.sidebar` doesn't list, e.g. `'date desc'`. A folder's `.sort` setting wins. See [Settings](#settings).                                                                               |
| `limit`               | `0`            | Most entries every folder shows of those its `.sidebar` doesn't list, after sorting. `0` for no limit. A folder's `.limit` wins. See [Limiting](#limiting).                                                                    |
| `more`                | none           | When a limit leaves entries out, end with a link to the folder's landing page, titled with this text. A folder's `.more` wins.                                                                                                 |
| `groupTitleFromIndex` | `false`        | Label a folder's group with its landing page's title before falling back to the folder name. See [Titles](#titles).                                                                                                            |
| `verbose`             | `false`        | Log each directory as it's processed.                                                                                                                                                                                          |

## Titles

A title made from a file or folder name is formatted: `getting-started.md`
becomes "Getting Started". It is title-cased: articles, short conjunctions
and prepositions (`a`, `the`, `and`, `of`, `to`, …) stay lowercase unless they
are the first or last word, so `guide-to-the-cli` becomes "Guide to the Cli".
Set `titleCase: false` to capitalise every word instead. Surrounding quotes
are dropped, so `"draft-notes"` becomes "Draft Notes".

Casing only changes first letters, so use `titleReplacements` for words with
other casing. Keys match whole words or phrases, ignoring case (the longest
phrase wins), and the values are used as written:

```ts
generateSidebar(docsRoot, {
  titleReplacements: { github: 'GitHub', api: 'API', cicd: 'CI/CD', 'vs code': 'VS Code' },
});
// github-actions/ → "GitHub Actions", cicd-setup.md → "CI/CD Setup",
// vs-code-tips.md → "VS Code Tips"
```

Titles an author wrote (a heading, `title` frontmatter, a `.sidebar` line) are
never changed by `titleReplacements`.

Every title has [markdown-tags](https://binarynoir.tech/plugins/markdown-tags/)
syntax removed, so `# Design ((tag|draft))` is listed as "Design". Set
`stripTags: false` to keep it.

For anything else, `transformTitle` gets every title before it is truncated,
along with where it came from: `"name"` (a file or folder name), `"page"` (a
page's frontmatter or first heading) or `"config"` (a `.sidebar` line). Return
the title to use, or `undefined` to keep it:

```ts
generateSidebar(docsRoot, {
  transformTitle: (title, { source }) => (source === 'page' ? title.replace(/^Guide: /, '') : undefined),
});
```

With `groupTitleFromIndex: true`, a folder whose group isn't named by its
parent's `.sidebar` or a `section-title` is labelled with its landing page's
`title` frontmatter or first `# Heading`, before falling back to the
formatted folder name.

### Using the title helpers in your own code

The functions that format titles are exported, so your `config.mts`, a build
script or another plugin can make titles that match the sidebar:

```ts
import { formatTitle, truncateTitle, stripTagSyntax } from '@binarynoir/vitepress-auto-sidebar';

formatTitle('02-setting-up-vs-code.md', 50, { 'vs code': 'VS Code' }); // "Setting up VS Code"
formatTitle('guide-to-the-cli', 50, {}, false); // "Guide To The Cli"
truncateTitle('A fairly long human-written title', 15); // "A fairly long…"
stripTagSyntax('Design ((tag|draft))'); // "Design"
```

| Function                                                   | What it does                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `formatTitle(name, maxLength?, replacements?, titleCase?)` | Turns a file or folder name into a title, following every rule above. `maxLength` defaults to `50` (`0` for no limit), `replacements` to `{}` and `titleCase` to `true`. |
| `truncateTitle(title, maxLength?)`                         | Shortens a title someone wrote to `maxLength` (default `50`), adding `…`, without changing its casing or punctuation.                                                    |
| `stripTagSyntax(title)`                                    | Removes markdown-tags syntax (`((tag\|draft))`) and tidies the spacing.                                                                                                  |

Pass `formatTitle` a single file or folder name, not a path: it doesn't split
on `/`. To match your sidebar, pass the same `titleReplacements` and `titleCase`
you gave `generateSidebar`.

These run in Node: in `.vitepress/config.mts`, build scripts, and Vite or
markdown-it plugins. The package entry also loads the sidebar generator, which
uses `fs`, so don't import it into code that runs in the browser (a Vue
component or the theme's `enhanceApp`). Format titles at build time instead,
and pass them to the page through frontmatter, a data loader or `themeConfig`.

## Grouping subdirectories

Each top-level docs directory (`engineering/`, `guides/`, ...) becomes its
own group with its own URL prefix. By default (`flattenSinglePage: true`), a
_subdirectory_ of that top-level directory only gets promoted to its own
sibling group if it actually has more than one visible entry (more pages, or
a subdirectory of its own). A subdirectory that has nothing in it besides its
own landing page is nested as a plain link inside its parent's group instead
— there's nothing to expand, so a whole separate collapsible group next to
its parent would just be visual noise.

Given:

```text
docs/
  engineering/
    README.md
    architecture/
      README.md              # only page in this subdirectory
    api-reference/
      README.md
      authentication.md
      endpoints.md             # multiple pages
```

the generated `/engineering/` sidebar has one top-level group, not two:

```text
Engineering
  ├─ Engineering
  └─ Architecture            ← nested plain link (architecture/ has only its own README)
API Reference                 ← still promoted to its own sibling group (has 3 pages)
  ├─ API Reference
  ├─ Authentication
  └─ Endpoints
```

A nested link's label comes from the _directory's_ resolved title — the same
title a group header would have used (an explicit `.sidebar` override, then
`section-title` frontmatter, then the formatted directory name) — not the
landing page's own frontmatter/heading title, so it stays consistent with
any sibling group headers next to it. Its position among its parent's other
entries (files, web links) follows the same `.sidebar` ordering rules as
everything else in that directory.

Set `flattenSinglePage: false` to always promote every subdirectory to its
own sibling group, even single-page ones — this matches the behavior of
`0.3.0` and earlier, before this option existed:

```ts
generateSidebar(docsRoot, { flattenSinglePage: false });
```

## `.sidebar` files

Drop a `.sidebar` file into any docs directory to control the order and
titles of its contents (files, subdirectories, and web links) without
touching config code. Lines starting with `#` are comments.

```txt
# docs/guides/.sidebar

introduction.md:Intro
getting-started.md:"Getting Started"
ROOT="https://status.example.com":Status
advanced-topics
...
migrations.md:Migrations
"https://example.com/faq":FAQ
```

| Syntax                      | Meaning                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `name`                      | Order this file/subdirectory.                                             |
| `name:Custom Title`         | Order it and override its display title.                                  |
| `"https://…":Title`         | Insert an external link into this section, in place.                      |
| `ROOT="https://…":Title`    | Insert an external link at the top level of the enclosing section.        |
| `...`                       | Everything not listed explicitly goes here, alphabetically or by `.sort`. |
| `-name`                     | Hide this entry entirely (it's still on disk, just not in the sidebar).   |
| `.sort: key [asc\|desc], …` | A setting: how unlisted entries are ordered. See [Settings](#settings).   |
| `.limit: n`                 | A setting: show at most `n` unlisted entries. See [Limiting](#limiting).  |
| `.more: Text`               | A setting: a link to the landing page when entries were left out.         |
| `.hide`                     | A setting: hide _this_ directory's own link, but keep its children.       |
| `.hideall` (or `.hide-all`) | A setting: skip this directory and everything under it.                   |
| `[Group Title]`             | Start a heading group. See [Heading groups](#heading-groups).             |

Titles may be bare, `"double-quoted"` or `'single-quoted'`, with optional
whitespace after the colon, so `name.md: "Title"` and
`https://example.com: 'Title'` both work. The quotes around a URL are
optional too. A line that can't be parsed as written, such as a link with no
title or a title with unmatched quotes, logs a warning naming the file and
line.

`name` is matched against the exact on-disk entry: a **file** entry needs its
`.md` extension (`introduction.md`, not `introduction`). A file line missing
its extension won't match anything — it's silently dropped into the
alphabetical `...` bucket instead of being ordered/retitled.

Ordering: items listed before `...` come first, in the order listed; items
listed after `...` come last, in the order listed; everything else is
inserted at the `...` marker (or appended, if there's no `...` at all),
alphabetically unless a [`.sort` setting](#settings) says otherwise.

A directory's own section/group title is resolved, in order: an explicit
`name:Title` for it in its _parent's_ `.sidebar`, then a `section-title`
frontmatter field on its own landing page, then (with `groupTitleFromIndex`)
its landing page's title, then its formatted directory name.

### Settings

A line that starts with a dot is a setting for the folder, not an entry.
Every setting is written the same way: `.name` turns it on, and
`.name: value` gives it a value. They can go anywhere in the file.

| Setting                     | What it does                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `.sort: key [asc\|desc], …` | Order the entries this file doesn't list by `key`. Default: `name`.                      |
| `.limit: n`                 | Show at most `n` of the entries this file doesn't list, after sorting. `0` for no limit. |
| `.more: Text`               | When `.limit` left entries out, end with a link to the landing page titled `Text`.       |
| `.hide`                     | Hide this folder's own link, but keep showing its children.                              |
| `.hideall` (or `.hide-all`) | Leave this folder and everything under it out of the sidebar.                            |

An unknown setting, or one with a value it can't use, logs a warning naming
the file and line, and is ignored.
[Auto Navbar](https://binarynoir.tech/plugins/auto-navbar)'s own settings,
`.link` and `.inherit`, are left to it, so one `.sidebar` file can serve
both plugins. Auto Navbar reads `.sort` too, so one line orders the sidebar and
the navbar dropdown alike.

#### Sorting

```txt
# docs/blog/.sidebar

index.md:All posts
.sort: date desc
```

The landing page stays first, because it is listed. Every other post is
sorted by date, newest first.

| Key           | Sorts by                                                                              |
| ------------- | ------------------------------------------------------------------------------------- |
| `name`        | The file or folder name. This is the default.                                         |
| `title`       | The title shown in the sidebar, wherever it came from.                                |
| `date`        | The page's `date` frontmatter, or `blog.date` for `@binarynoir/vitepress-blog` posts. |
| anything else | That frontmatter field. Use dots for nested fields: `.sort: meta.order`.              |

- The direction is `asc` (A to Z, oldest first, smallest first) unless you write `desc`.
- Dates and numbers compare as dates and numbers, so `2` sorts before `10`.
- Dates can carry a time: `2026-10-20`, `2026-10-20 14:30`, `2026-10-20T14:30:00`, or either with an offset (`-04:00`, `Z`). Pages from the same day sort by their times, and a date alone counts as the start of its day. A time without an offset is read as UTC, so the order is the same on every build machine; write offsets if your pages mix time zones.
- Several keys, separated by commas, sort by the first and break ties with the
  next: `.sort: blog.sticky desc, date desc` puts sticky blog posts on top,
  each group newest first.
- Pages without a value go last for that key, in either direction, and are
  ordered by the next key. A `false` value counts as no value, so pages with
  `sticky: false` sort with those that don't say. Final ties go by name.
- A subfolder sorts by its landing page's frontmatter.
- Only entries the file doesn't list are sorted. Listed entries keep their
  place, so you can pin a page above or below the sorted ones with `...`.
- A setting covers its own folder, not the folders below it. To sort every
  folder the same way, pass the [`sort` option](#options); a folder's own
  `.sort` still wins.

#### Limiting

A folder with hundreds of pages makes a sidebar too long to use, and
VitePress sends the whole sidebar to every page. `.limit` keeps the first
entries after sorting:

```txt
# docs/blog/.sidebar

index.md:All posts
.sort: blog.sticky desc, date desc
.limit: 10
.more: Older posts
```

- Only entries the file doesn't list count toward the limit, and listed
  entries always show. Above, "All posts" plus the 10 first in sort order.
- `.more: Text` ends the list with a link to the folder's landing page, but
  only when entries were left out. Leave it out for no link: the blog above
  already links its landing page as "All posts".
- `.limit: 0` means no limit. The [`limit` and `more` options](#options) set
  both for every folder; a folder's own lines win.

### Heading groups

A line in square brackets starts a group heading that is not a page. Every
entry listed after it, up to the next heading, is shown inside that group, so
you can group pages by topic without moving them into subfolders and changing
their URLs:

```txt
# docs/plugins/.sidebar

index.md:Overview
[Navigation]
auto-sidebar.md:Auto Sidebar
auto-navbar.md:Auto Navbar
[Content]
downloads.md:Downloads
html-escape
...
```

```txt
Plugins                       ← Overview, the only entry before the first heading
▾ Navigation
    Auto Sidebar
    Auto Navbar
▾ Content
    Downloads
  ▸ HTML Escape               ← a multi-page subdirectory, nested in its group
    (everything unlisted, at the ... marker)
```

- Entries before the first heading are placed as they would be without any headings.
- A multi-page subdirectory under a heading is nested inside the heading's group, instead of becoming its own top-level group.
- `...` places unlisted entries under the heading above it. Without `...`, unlisted entries go at the end, so they fall under the last heading.
- A heading with nothing under it is left out. The `collapsed` option applies to heading groups too.

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

### Drafts in frontmatter

A page can hide itself, too. List frontmatter keys with `excludeFrontmatter`,
and any page that sets one of them to `true` is left out of the sidebar:

```ts
generateSidebar(docsRoot, { excludeFrontmatter: ['draft', 'blog.draft'] });
```

Only `true` counts, dotted keys read nested values (`blog.draft` for
[`@binarynoir/vitepress-blog`](https://binarynoir.tech/plugins/blog/) posts),
and a folder whose landing page is hidden loses its link. Pass the same list to
[`@binarynoir/vitepress-exclude`](https://binarynoir.tech/plugins/exclude/) to
keep those pages out of the build, so the sidebar never links to a page that
isn't there. Turn it on for builds only to keep previewing drafts in
`vitepress dev`:

```ts
const excludeFrontmatter = process.env.NODE_ENV === 'production' ? ['draft'] : [];
```

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

## Companion plugin: `vitepress-auto-navbar`

[`vitepress-auto-navbar`](https://github.com/binarynoir/vitepress-auto-navbar)
does for the top navigation bar (`themeConfig.nav`) what this plugin does for
the sidebar: same folder scan, same `.exclude` and ordering syntax, with its
own `.nav` files. Use both and one folder structure drives the whole site. It
can fall back to your existing `.sidebar` files, or borrow titles from them
with `.inherit`, so nothing has to be written twice.

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

---

## Feedback and support

Bug reports, feature requests and questions are all welcome. Please open them on this project's [GitHub issue tracker](https://github.com/binarynoir/vitepress-auto-sidebar/issues):

- **Found a bug?** [Report it](https://github.com/binarynoir/vitepress-auto-sidebar/issues/new?labels=bug&title=Bug%3A%20). Include your version and the steps to reproduce it.
- **Have an idea?** [Request a feature](https://github.com/binarynoir/vitepress-auto-sidebar/issues/new?labels=enhancement&title=Feature%20request%3A%20). Tell us what you are trying to do.
- **Something else?** [Browse open issues](https://github.com/binarynoir/vitepress-auto-sidebar/issues) to see if it has already been raised.

Pull requests are welcome too.

<!-- binarynoir:more:start (generated from binarynoir.github.io/products.json) -->

## More from BinaryNoir

<p align="center">
  <a href="https://binarynoir.tech">
    <img alt="BinaryNoir" src="https://binarynoir.tech/logo-horizontal.svg" width="320">
  </a>
</p>

Auto Sidebar is one of a family of open-source tools from BinaryNoir.

**Pairs well with Auto Sidebar**

- [Auto Navbar](https://binarynoir.tech/plugins/auto-navbar): navbar built from your folders
- [Sidebar Accordion](https://binarynoir.tech/plugins/sidebar-accordion): one open sidebar group at a time, and a sidebar filter
- [README Index](https://binarynoir.tech/plugins/readme-index/): `README.md` index pages for VuePress migrations

**New:** [Blog](https://binarynoir.tech/plugins/blog/): posts anywhere, a main blog and section blogs, with RSS feeds

**See them all:** VitePress plugins, Vite plugins, editor extensions and command-line tools, with documentation and live demos, at **[binarynoir.tech](https://binarynoir.tech)**.

<!-- binarynoir:more:end -->

## Author

John Smith III, [BinaryNoir](https://binarynoir.tech). Thanks to all contributors and users for their support and feedback.
