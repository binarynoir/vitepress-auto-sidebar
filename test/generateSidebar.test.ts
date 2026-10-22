import { afterEach, describe, expect, it } from 'vitest';
import { generateSidebar } from '../src/generateSidebar.js';
import { createFixture, removeFixture, type Tree } from './testUtils.js';

let root: string;

function build(tree: Tree, options?: Parameters<typeof generateSidebar>[1]) {
  root = createFixture(tree);
  return generateSidebar(root, options);
}

afterEach(() => {
  if (root) removeFixture(root);
});

describe('basic sidebar generation', () => {
  it('creates one section per top-level directory, keyed by URL prefix', () => {
    const sidebar = build({
      products: { 'README.md': '# Products' },
      guides: { 'README.md': '# Guides' },
    });

    expect(Object.keys(sidebar).sort()).toEqual(['/guides/', '/products/']);
  });

  it('skips dotfiles, underscore-, dash-prefixed, and assets directories at the root', () => {
    const sidebar = build({
      '.vitepress': { 'config.ts': '' },
      _partials: { 'README.md': '# Partials' },
      '-drafts': { 'README.md': '# Drafts' },
      assets: { 'logo.png': '' },
      products: { 'README.md': '# Products' },
    });

    expect(Object.keys(sidebar)).toEqual(['/products/']);
  });

  it('skips VitePress\'s public/ static-assets root, but not a "public-api" section', () => {
    const sidebar = build({
      public: { 'favicon.ico': '', 'logo.png': '' },
      'public-api': { 'README.md': '# Public API' },
      products: { 'README.md': '# Products' },
    });

    expect(Object.keys(sidebar).sort()).toEqual(['/products/', '/public-api/']);
  });

  it('excludes underscore-prefixed subdirectories and files (VitePress partials)', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        _snippets: { 'shared.md': '# Shared' },
        '_draft.md': '# Draft',
      },
    });
    const texts = collectAllTexts(sidebar['/products/']);
    expect(texts).not.toContain('Snippets');
    expect(texts).not.toContain('Shared');
    expect(texts).not.toContain('Draft');
  });

  it('links a section header to its README', () => {
    const sidebar = build({ products: { 'README.md': '# Products' } });
    expect(sidebar['/products/'][0]).toMatchObject({ text: 'Products', link: '/products/' });
  });

  it('omits the link when there is no landing page', () => {
    // Two files so the section doesn't flatten to a single link, which would
    // otherwise point at whichever one file exists instead of testing this.
    const sidebar = build({ products: { 'widgets.md': '# Widgets', 'gadgets.md': '# Gadgets' } });
    expect(sidebar['/products/'][0].link).toBeUndefined();
  });

  it('prefers index.md over README.md as the landing page', () => {
    const sidebar = build({
      products: { 'index.md': '# Index Wins', 'README.md': '# Readme Loses', 'widgets.md': '# Widgets' },
    });
    // The section header links to the landing page...
    expect(sidebar['/products/'][0].link).toBe('/products/');
    // ...and the landing page's own child entry takes its title from index.md, not README.md.
    expect(sidebar['/products/'][0].items?.[0]).toMatchObject({ text: 'Index Wins', link: '/products/' });
  });
});

describe('title resolution', () => {
  it('prefers frontmatter title over the formatted filename', () => {
    const sidebar = build({
      guides: {
        'README.md': '# Guides',
        'getting-started.md': '---\ntitle: Getting Up and Running\n---\n# Getting Started',
      },
    });
    const item = sidebar['/guides/'][0].items?.find(
      (i) =>
        i.link === '/guides/getting-started.html' ||
        i.link === '/guides/getting-started.md' ||
        i.link?.includes('getting-started'),
    );
    expect(item?.text).toBe('Getting Up and Running');
  });

  it('falls back to the first heading when there is no frontmatter title', () => {
    const sidebar = build({
      guides: { 'README.md': '# Guides', 'setup.md': '# Environment Setup\n\nBody text.' },
    });
    const item = sidebar['/guides/'][0].items?.find((i) => i.link?.includes('setup'));
    expect(item?.text).toBe('Environment Setup');
  });

  it('falls back to the formatted filename when there is no title at all', () => {
    const sidebar = build({ guides: { 'README.md': '# Guides', 'deploy-checklist.md': 'no heading here' } });
    const item = sidebar['/guides/'][0].items?.find((i) => i.link?.includes('deploy-checklist'));
    expect(item?.text).toBe('Deploy Checklist');
  });

  it('honors section-title frontmatter on a subdirectory README', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        widgets: { 'README.md': '---\nsection-title: Widget Catalog\n---\n# Widgets' },
      },
    });
    // widgets/ has only its own README, so with flattenSinglePage's default it's
    // nested as a plain link inside the Products group rather than promoted.
    expect(collectAllTexts(sidebar['/products/'])).toContain('Widget Catalog');
  });
});

describe('.sidebar ordering', () => {
  it('orders explicitly before falling back to alphabetical for the rest', () => {
    const sidebar = build({
      guides: {
        'README.md': '# Guides',
        'zeta.md': '# Zeta',
        'alpha.md': '# Alpha',
        'beta.md': '# Beta',
        '.sidebar': 'zeta.md\n...',
      },
    });
    const links = sidebar['/guides/'][0].items?.map((i) => i.link);
    expect(links).toEqual(['/guides/', '/guides/zeta.md', '/guides/alpha.md', '/guides/beta.md']);
  });

  it('applies a custom title from a .sidebar line', () => {
    const sidebar = build({
      guides: {
        'README.md': '# Guides',
        'alpha.md': '# Alpha',
        '.sidebar': 'alpha.md:My Custom Title',
      },
    });
    const item = sidebar['/guides/'][0].items?.find((i) => i.link?.includes('alpha'));
    expect(item?.text).toBe('My Custom Title');
  });

  it('promotes a multi-page subdirectory to a sibling group per .sidebar ordering', () => {
    // Each subdirectory has more than one page, so neither flattens away —
    // both stay real groups and get promoted to their own sibling entries.
    const sidebar = build({
      products: {
        'README.md': '# Products',
        widgets: { 'README.md': '# Widgets', 'pricing.md': '# Pricing' },
        gadgets: { 'README.md': '# Gadgets', 'pricing.md': '# Pricing' },
        '.sidebar': 'gadgets\nwidgets',
      },
    });
    const order = sidebar['/products/'].map((i) => i.text);
    expect(order).toEqual(['Products', 'Gadgets', 'Widgets']);
  });
});

describe('hide directives', () => {
  it('.hide drops the directory link but keeps it (and its children) in the tree', () => {
    const sidebar = build(
      {
        products: {
          'README.md': '# Products',
          legacy: {
            'README.md': '# Legacy',
            '.sidebar': '.hide',
            v1: { 'README.md': '# V1' },
          },
        },
      },
      // Isolate this test from flattenSinglePage's default-on behavior, which is
      // covered separately below.
      { flattenSinglePage: false },
    );
    const legacyGroup = sidebar['/products/'].find((i) => i.text === 'Legacy');
    expect(legacyGroup).toBeDefined();
    expect(legacyGroup?.link).toBeUndefined();
    expect(legacyGroup?.items).toEqual([expect.objectContaining({ text: 'V1', link: '/products/legacy/v1/' })]);
  });

  it('.hideall removes the directory and everything below it', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        internal: {
          'README.md': '# Internal',
          '.sidebar': '.hideall',
          secrets: { 'README.md': '# Secrets' },
        },
      },
    });
    const texts = sidebar['/products/'].map((i) => i.text);
    expect(texts).not.toContain('Internal');
    expect(texts).not.toContain('Secrets');
  });
});

describe('web links', () => {
  it('inserts an inline web link among a directory’s children', () => {
    const sidebar = build({
      guides: {
        'README.md': '# Guides',
        '.sidebar': '"https://example.com/status":Status Page',
      },
    });
    const link = sidebar['/guides/'][0].items?.find((i) => i.link === 'https://example.com/status');
    expect(link?.text).toBe('Status Page');
  });

  it('places a ROOT= web link at the section level, not nested under the group', () => {
    const sidebar = build({
      guides: {
        'README.md': '# Guides',
        '.sidebar': 'ROOT="https://example.com/portal":Portal',
      },
    });
    const rootLink = sidebar['/guides/'].find((i) => i.link === 'https://example.com/portal');
    expect(rootLink).toBeDefined();
    expect(rootLink?.text).toBe('Portal');
  });
});

describe('exclusions', () => {
  it('drops a directory matched by .exclude', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        draft: { 'README.md': '# Draft' },
        '.exclude': 'draft/',
      },
    });
    const texts = sidebar['/products/'].map((i) => i.text);
    expect(texts).not.toContain('Draft');
  });

  it('supports glob patterns', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        'internal-notes.md': '# Notes',
        '.exclude': 'internal-*.md',
      },
    });
    const links = sidebar['/products/'][0].items?.map((i) => i.link) ?? [];
    expect(links.some((l) => l?.includes('internal-notes'))).toBe(false);
  });
});

describe('maxDepth', () => {
  it('stops recursing past the configured depth', () => {
    const sidebar = build(
      {
        products: {
          'README.md': '# Products',
          level1: {
            'README.md': '# L1',
            level2: { 'README.md': '# L2' },
          },
        },
      },
      // flattenSinglePage is off here so this test can check for the page's own
      // title ("L1") rather than the directory-derived label a flattened link
      // would show instead; that behavior has its own tests above.
      { maxDepth: 1, flattenSinglePage: false },
    );
    const texts = collectAllTexts(sidebar['/products/']);
    expect(texts).toContain('L1');
    expect(texts).not.toContain('L2');
  });
});

describe('collapsed option', () => {
  // flattenSinglePage defaults to true, which would collapse this single-page
  // "widgets" fixture into a plain link with no `collapsed` key at all — turn
  // it off so these tests isolate the `collapsed` default/override instead.

  it('defaults generated groups to expanded (collapsed: false)', () => {
    const sidebar = build(
      { products: { 'README.md': '# Products', widgets: { 'README.md': '# Widgets' } } },
      { flattenSinglePage: false },
    );
    const group = sidebar['/products/'].find((i) => i.text === 'Widgets');
    expect(group?.collapsed).toBe(false);
  });

  it('honors collapsed: true', () => {
    const sidebar = build(
      { products: { 'README.md': '# Products', widgets: { 'README.md': '# Widgets' } } },
      { collapsed: true, flattenSinglePage: false },
    );
    const group = sidebar['/products/'].find((i) => i.text === 'Widgets');
    expect(group?.collapsed).toBe(true);
  });
});

describe('flattenSinglePage option', () => {
  it('applies to a top-level section too: a single-page section is one plain link, not a group repeating its own label', () => {
    const sidebar = build({ 'tools-resources': { 'README.md': '# Tools & Resources' } });
    // "Tools Resources" is the formatted directory name — the same label a
    // group header would have used, per the resolution order tested above.
    expect(sidebar['/tools-resources/']).toEqual([{ text: 'Tools Resources', link: '/tools-resources/' }]);
  });

  it('leaves a single-page top-level section as a group when explicitly disabled', () => {
    const sidebar = build({ 'tools-resources': { 'README.md': '# Tools & Resources' } }, { flattenSinglePage: false });
    expect(sidebar['/tools-resources/'][0]).toMatchObject({
      link: '/tools-resources/',
      items: [{ text: 'Tools & Resources', link: '/tools-resources/' }],
    });
  });

  it('is on by default, nesting a single-page subdirectory as a plain link in its parent group', () => {
    const sidebar = build({
      products: { 'README.md': '# Products', widgets: { 'README.md': '# Widgets' } },
    });
    // Only one top-level entry — widgets/ was nested into Products' own group,
    // not promoted to a sibling of it.
    expect(sidebar['/products/']).toHaveLength(1);
    expect(sidebar['/products/'][0].items).toContainEqual({ text: 'Widgets', link: '/products/widgets/' });
  });

  it('keeps a single-page subdirectory as its own group when explicitly disabled', () => {
    const sidebar = build(
      { products: { 'README.md': '# Products', widgets: { 'README.md': '# Widgets' } } },
      { flattenSinglePage: false },
    );
    const widgets = sidebar['/products/'].find((i) => i.text === 'Widgets');
    expect(widgets).toMatchObject({
      link: '/products/widgets/',
      items: [{ text: 'Widgets', link: '/products/widgets/' }],
    });
  });

  it('does not flatten a subdirectory that has more than one visible entry', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        widgets: { 'README.md': '# Widgets', 'pricing.md': '# Pricing' },
      },
    });
    const widgets = sidebar['/products/'].find((i) => i.text === 'Widgets');
    expect(widgets?.items).toHaveLength(2);
  });

  it('does not flatten a subdirectory whose only child is itself a multi-page group', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        widgets: {
          gadgets: { 'README.md': '# Gadgets', 'one.md': '# One', 'two.md': '# Two' },
        },
      },
    });
    // widgets/ has no landing page of its own and exactly one child (the gadgets/ group),
    // but that child is itself a multi-item group and must stay a nested group, not be
    // flattened away.
    const widgets = sidebar['/products/'].find((i) => i.text === 'Widgets');
    expect(widgets?.items).toEqual([expect.objectContaining({ text: 'Gadgets', items: expect.any(Array) })]);
  });

  it('orders a nested flattened subdirectory among root-level files per .sidebar', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        'zeta.md': '# Zeta',
        widgets: { 'README.md': '# Widgets' },
        '.sidebar': 'widgets\nzeta.md',
      },
    });
    const texts = sidebar['/products/'][0].items?.map((i) => i.text);
    expect(texts).toEqual(['Products', 'Widgets', 'Zeta']);
  });
});

describe('[Heading] groups', () => {
  /** Strips each item down to text, link and children, for readable comparisons. */
  const shape = (items: { text: string; link?: string; items?: unknown[] }[] | undefined): unknown =>
    items?.map((i) =>
      i.items ? { text: i.text, items: shape(i.items as never) } : i.link ? `${i.text} ${i.link}` : i.text,
    );

  it('groups the entries listed after a heading under it, in a top-level section', () => {
    const sidebar = build({
      plugins: {
        'index.md': '# Plugins',
        'a.md': '# A',
        'b.md': '# B',
        'c.md': '# C',
        multi: { 'index.md': '# Multi', 'one.md': '# One' },
        '.sidebar': 'index.md:Overview\n[First group]\na.md\nmulti:Multi\n[Second: group]\nb.md\nc.md\n',
      },
    });

    expect(shape(sidebar['/plugins/'])).toEqual([
      'Plugins /plugins/',
      {
        text: 'First group',
        items: ['A /plugins/a.md', { text: 'Multi', items: ['Multi /plugins/multi/', 'One /plugins/multi/one.md'] }],
      },
      { text: 'Second: group', items: ['B /plugins/b.md', 'C /plugins/c.md'] },
    ]);
  });

  it('keeps entries before the first heading where they were', () => {
    const sidebar = build({
      guide: {
        'index.md': '# Guide',
        'intro.md': '# Intro',
        'a.md': '# A',
        '.sidebar': 'intro.md\n[Group]\na.md\n',
      },
    });

    expect(shape(sidebar['/guide/'])).toEqual([
      { text: 'Guide', items: ['Guide /guide/', 'Intro /guide/intro.md'] },
      { text: 'Group', items: ['A /guide/a.md'] },
    ]);
  });

  it('places unlisted entries at `...`, under the heading above it', () => {
    const sidebar = build({
      guide: {
        'index.md': '# Guide',
        'a.md': '# A',
        'z.md': '# Z',
        'm.md': '# M',
        '.sidebar': '[Listed]\na.md\n[Everything else]\n...\n',
      },
    });

    expect(shape(sidebar['/guide/'])).toEqual([
      'Guide /guide/',
      { text: 'Listed', items: ['A /guide/a.md'] },
      { text: 'Everything else', items: ['M /guide/m.md', 'Z /guide/z.md'] },
    ]);
  });

  it('works in nested directories, and drops headings with nothing under them', () => {
    const sidebar = build({
      guide: {
        'index.md': '# Guide',
        deep: {
          'index.md': '# Deep',
          'a.md': '# A',
          'b.md': '# B',
          '.sidebar': '[Empty]\n[Group]\na.md\nb.md\n',
        },
        'other.md': '# Other',
      },
    });

    const deep = sidebar['/guide/'].find((i) => i.text === 'Deep');
    expect(shape(deep?.items)).toEqual([
      'Deep /guide/deep/',
      { text: 'Group', items: ['A /guide/deep/a.md', 'B /guide/deep/b.md'] },
    ]);
    expect(collectAllTexts(sidebar['/guide/'])).not.toContain('Empty');
  });

  it('applies the collapsed option to heading groups', () => {
    const sidebar = build(
      { guide: { 'index.md': '# Guide', 'a.md': '# A', '.sidebar': '[Group]\na.md\n' } },
      { collapsed: true },
    );
    expect(sidebar['/guide/'].find((i) => i.text === 'Group')?.collapsed).toBe(true);
  });
});

describe('blog option', () => {
  /** A blog post page, with `blog` frontmatter. */
  const post = (title: string, fields: string) =>
    `---\ntitle: ${title}\nblog:\n  ${fields.split('\n').join('\n  ')}\n---\n`;
  const blogPage = (title: string, settings: string) =>
    `---\ntitle: ${title}\nblog-index:\n  ${settings.split('\n').join('\n  ')}\n---\n`;

  const tree: Tree = {
    blog: {
      'index.md': blogPage('Blog', 'scope: site\nfolders: ./'),
      'old.md': post('Old', 'date: 2026-01-01'),
      'new.md': post('New', 'date: 2026-03-01'),
      team: {
        'index.md': blogPage('Team', 'layout: list'),
        'site.md': post('Site', 'date: 2026-02-01\nscope: site'),
        'global.md': post('Global', 'date: 2026-04-01\nscope: global'),
        'local.md': post('Local', 'date: 2026-05-01'),
        'pinned.md': post('Pinned', 'date: 2025-01-01\npinned: true'),
      },
    },
  };

  const texts = (items: { text: string }[] | undefined) => (items ?? []).map((item) => item.text);

  it('lists site-wide posts in the main blog and in their own section, newest first', () => {
    const sidebar = build(tree, { blog: true, groupTitleFromIndex: true });
    const [main, team] = sidebar['/blog/'];
    expect(texts(main.items)).toEqual(['Blog', 'Global', 'New', 'Site', 'Old']);
    expect(main.items?.find((item) => item.text === 'Global')?.link).toBe('/blog/team/global.md');
    expect(texts(team.items)).toEqual(['Team', 'Pinned', 'Local', 'Global', 'Site']);
  });

  it('does the same for blogs nested inside a group', () => {
    const sidebar = build(
      { plugins: { 'index.md': '# Plugins', demo: tree.blog } },
      { blog: true, groupTitleFromIndex: true },
    );
    const demo = sidebar['/plugins/'].find((item) => item.text === 'Blog');
    expect(texts(demo?.items)).toEqual(['Blog', 'Global', 'New', 'Site', 'Old', 'Team']);
    const team = demo?.items?.find((item) => item.text === 'Team');
    expect(texts(team?.items)).toEqual(['Team', 'Pinned', 'Local', 'Global', 'Site']);
  });

  it('leaves blogs alone without the option', () => {
    const sidebar = build(tree, { groupTitleFromIndex: true });
    const [main, team] = sidebar['/blog/'];
    expect(texts(main.items)).toEqual(['Blog', 'New', 'Old']);
    expect(texts(team.items)).toEqual(['Team', 'Global', 'Local', 'Pinned', 'Site']);
  });

  it("keeps a folder's .sort and .limit", () => {
    const sidebar = build(
      { blog: { ...(tree.blog as Tree), '.sidebar': 'index.md\n.sort: title\n.limit: 2' } },
      { blog: true, groupTitleFromIndex: true },
    );
    expect(texts(sidebar['/blog/'][0].items)).toEqual(['Blog', 'Global', 'New']);
  });

  it('leaves out excluded and draft posts', () => {
    const sidebar = build(
      {
        blog: {
          ...(tree.blog as Tree),
          '.exclude': 'team/site.md',
          team: {
            ...((tree.blog as Tree).team as Tree),
            'draft.md': post('Draft', 'date: 2026-06-01\nscope: site\ndraft: true'),
          },
        },
      },
      { blog: true, groupTitleFromIndex: true, excludeFrontmatter: ['blog.draft'] },
    );
    expect(texts(sidebar['/blog/'][0].items)).toEqual(['Blog', 'Global', 'New', 'Old']);
  });

  it('pulls posts only into a main blog, from the folders it covers', () => {
    const sidebar = build(
      {
        blog: { 'index.md': blogPage('Blog', 'scope: site'), 'here.md': post('Here', 'date: 2026-01-01') },
        news: {
          'index.md': blogPage('News', 'layout: list'),
          'local.md': post('Local', 'date: 2026-01-01'),
          sub: { 'index.md': '# Sub', 'a.md': post('Away', 'date: 2026-02-01\nscope: site'), 'b.md': '# B' },
        },
        guide: { 'index.md': '# Guide', 'page.md': '---\nblog:\n  scope: site\n---\n# Page' },
      },
      { blog: true },
    );
    // A main blog with no folders covers the whole site.
    expect(texts(sidebar['/blog/'][0].items)).toEqual(['Blog', 'Away', 'Here', 'Page']);
    expect(sidebar['/blog/'][0].items?.[1].link).toBe('/news/sub/a.md');
    // A section blog doesn't pull posts up from its subfolders.
    expect(texts(sidebar['/news/'][0].items)).toEqual(['News', 'Local']);
  });

  const withSidebar = (folder: string, lines: string): Tree => {
    const blog = { ...(tree.blog as Tree) };
    if (folder === 'blog') return { blog: { ...blog, '.sidebar': lines } };
    return { blog: { ...blog, [folder]: { ...(blog[folder] as Tree), '.sidebar': lines } } };
  };

  it('groups posts by month with .group: month, newest first', () => {
    const sidebar = build(withSidebar('team', 'index.md\n.group: month'), { blog: true, groupTitleFromIndex: true });
    const team = sidebar['/blog/'][1];
    expect(texts(team.items)).toEqual(['Team', 'January 2025', 'May 2026', 'April 2026', 'February 2026']);
    expect(texts(team.items?.[2].items)).toEqual(['Local']);
  });

  it('groups posts by year with .group: year, including site-wide ones', () => {
    const sidebar = build(withSidebar('blog', 'index.md\n.group: year'), { blog: true, groupTitleFromIndex: true });
    const [main] = sidebar['/blog/'];
    expect(texts(main.items)).toEqual(['Blog', '2026']);
    expect(texts(main.items?.[1].items)).toEqual(['Global', 'New', 'Site', 'Old']);
  });

  it('keeps a month as written, whatever the offset, and leaves undated and listed pages ungrouped', () => {
    const sidebar = build(
      {
        notes: {
          'index.md': '# Notes',
          '.sidebar': 'index.md\nkept.md\n.sort: date desc\n.group: month',
          'late.md': '---\ndate: 2026-10-31T23:30:00-04:00\n---\n# Late',
          'early.md': '---\ndate: 2026-11-01\n---\n# Early',
          'kept.md': '---\ndate: 2026-11-02\n---\n# Kept',
          'undated.md': '# Undated',
        },
      },
      {},
    );
    const [notes] = sidebar['/notes/'];
    // Late is newer than Early (03:30 on Nov 1 UTC), yet stays in October, the month it was written in.
    expect(texts(notes.items)).toEqual(['Notes', 'Kept', 'October 2026', 'November 2026', 'Undated']);
    expect(texts(notes.items?.[2].items)).toEqual(['Late']);
  });

  it('groups site-wide posts by the section blog they came from with .group: blog', () => {
    const sidebar = build(
      {
        blog: {
          'index.md': blogPage('Blog', 'scope: site'),
          '.sidebar': 'index.md\n.group: blog',
          'here.md': post('Here', 'date: 2026-01-01'),
        },
        news: {
          'index.md': blogPage('News', 'layout: list'),
          'a.md': post('A', 'date: 2026-03-01\nscope: site'),
          'b.md': post('B', 'date: 2026-02-01\nscope: site'),
        },
        guide: { 'index.md': '# Guide', 'page.md': '---\nblog:\n  scope: site\n---\n# Page' },
      },
      { blog: true, groupTitleFromIndex: true },
    );
    const [main] = sidebar['/blog/'];
    expect(texts(main.items)).toEqual(['Blog', 'News', 'Here', 'Page']);
    expect(main.items?.[1].link).toBe('/news/');
    expect(texts(main.items?.[1].items)).toEqual(['A', 'B']);
  });

  it("doesn't repeat posts from a section blog that is a subfolder, with .group: blog", () => {
    const sidebar = build(withSidebar('blog', 'index.md\n.group: blog'), { blog: true, groupTitleFromIndex: true });
    const [main, team] = sidebar['/blog/'];
    expect(texts(main.items)).toEqual(['Blog', 'New', 'Old']);
    expect(texts(team.items)).toEqual(['Team', 'Pinned', 'Local', 'Global', 'Site']);
  });

  it('links a post that is a folder landing page to its folder', () => {
    const sidebar = build(
      {
        blog: {
          'index.md': blogPage('Blog', 'scope: site\nfolders: ./'),
          team: { 'index.md': blogPage('Team', 'layout: list'), launch: { 'index.md': post('Launch', 'scope: site') } },
        },
      },
      { blog: true },
    );
    expect(sidebar['/blog/'][0].items?.find((item) => item.text === 'Launch')?.link).toBe('/blog/team/launch/');
  });
});

describe('sidebar.json overrides', () => {
  it('uses a hand-authored sidebar.json verbatim for that section', () => {
    const custom = { '/products/': [{ text: 'Hand Rolled', link: '/products/' }] };
    const sidebar = build({
      products: { 'README.md': '# Products', 'sidebar.json': JSON.stringify(custom) },
    });
    expect(sidebar).toEqual(custom);
  });
});

describe('error handling', () => {
  it('returns an empty object for a missing root directory instead of throwing', () => {
    expect(() => generateSidebar('/path/does/not/exist-vitepress-auto-sidebar-test')).not.toThrow();
    expect(generateSidebar('/path/does/not/exist-vitepress-auto-sidebar-test')).toEqual({});
  });
});

function collectAllTexts(items: { text: string; items?: unknown[] }[] | undefined): string[] {
  if (!items) return [];
  const texts: string[] = [];
  for (const item of items as { text: string; items?: typeof items }[]) {
    texts.push(item.text);
    texts.push(...collectAllTexts(item.items));
  }
  return texts;
}
