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
    const sidebar = build({ products: { 'widgets.md': '# Widgets' } });
    expect(sidebar['/products/'][0].link).toBeUndefined();
  });

  it('prefers index.md over README.md as the landing page', () => {
    const sidebar = build({
      products: { 'index.md': '# Index Wins', 'README.md': '# Readme Loses' },
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
    const sub = sidebar['/products/'].find((i) => i.text === 'Widget Catalog');
    expect(sub).toBeDefined();
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

  it('promotes a subdirectory to a sibling group per .sidebar ordering', () => {
    const sidebar = build({
      products: {
        'README.md': '# Products',
        widgets: { 'README.md': '# Widgets' },
        gadgets: { 'README.md': '# Gadgets' },
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
  it('is on by default, collapsing a single-page subdirectory into a plain link', () => {
    const sidebar = build({
      products: { 'README.md': '# Products', widgets: { 'README.md': '# Widgets' } },
    });
    const widgets = sidebar['/products/'].find((i) => i.text === 'Widgets');
    expect(widgets).toEqual({ text: 'Widgets', link: '/products/widgets/' });
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
