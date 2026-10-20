import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSidebar } from '../src/generateSidebar.js';
import { directiveProblem, parseSidebarDirectives, parseSidebarSettings } from '../src/sidebarConfig.js';
import { parseSort } from '../src/sorting.js';
import type { SidebarItem } from '../src/types.js';
import { createFixture, removeFixture, type Tree } from './testUtils.js';

let root: string;

function build(tree: Tree, options?: Parameters<typeof generateSidebar>[1]) {
  root = createFixture(tree);
  return generateSidebar(root, options);
}

afterEach(() => {
  if (root) removeFixture(root);
  vi.restoreAllMocks();
});

const texts = (items: SidebarItem[]) => items.map((item) => item.text);

function post(title: string, date?: string, extra = ''): string {
  return `---\ntitle: ${title}\n${date ? `date: ${date}\n` : ''}${extra}---\n`;
}

// Alphabetical by file name: a-old, b-new, c-mid, d-undated.
const posts: Tree = {
  'index.md': '# Blog',
  'a-old.md': post('Old', '2024-01-01'),
  'b-new.md': post('New', '2026-03-01'),
  'c-mid.md': post('Mid', '2025-06-15'),
  'd-undated.md': post('Undated'),
};

describe('parseSort', () => {
  it('reads a key and an optional direction', () => {
    expect(parseSort('date desc')).toEqual([{ key: 'date', direction: 'desc' }]);
    expect(parseSort('title')).toEqual([{ key: 'title', direction: 'asc' }]);
    expect(parseSort('  blog.date   ASC ')).toEqual([{ key: 'blog.date', direction: 'asc' }]);
  });

  it('reads several keys, separated by commas', () => {
    expect(parseSort('blog.sticky desc, date desc')).toEqual([
      { key: 'blog.sticky', direction: 'desc' },
      { key: 'date', direction: 'desc' },
    ]);
    expect(parseSort('date desc,')).toMatch(/needs a key/);
  });

  it('explains what is wrong with a bad value', () => {
    expect(parseSort('')).toMatch(/needs a key/);
    expect(parseSort('date newest')).toMatch(/not a direction/);
    expect(parseSort('date desc please')).toMatch(/key and an optional direction/);
  });
});

describe('.sidebar settings', () => {
  it('reads settings, and keeps them out of the entries', () => {
    const lines = ['index.md:Overview', '.sort: date desc', '.hide', '...'];
    expect(parseSidebarSettings(lines)).toEqual({
      hide: true,
      skip: false,
      sort: [{ key: 'date', direction: 'desc' }],
    });
    expect(parseSidebarDirectives(lines).map((directive) => directive.name)).toEqual(['index.md', '...']);
  });

  it('accepts both spellings of hideall', () => {
    expect(parseSidebarSettings(['.hideall']).skip).toBe(true);
    expect(parseSidebarSettings(['.hide-all']).skip).toBe(true);
  });

  it.each([
    ['.sort: date desc', null],
    ['.sort:title', null],
    ['.hide', null],
    ['.sort', 'needs a key'],
    ['.sort: date sideways', 'not a direction'],
    ['.hide: yes', 'takes no value'],
    ['.colapsed', 'not a setting'],
    // Auto Navbar's settings, which a shared .sidebar file may carry.
    ['.link', null],
    ['.inherit', null],
  ])('checks %s', (line, problem) => {
    const result = directiveProblem(line);
    if (problem === null) expect(result).toBeNull();
    else expect(result).toContain(problem);
  });

  it('warns about a bad setting once, naming the file and line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    build({ blog: { ...posts, '.sidebar': 'index.md\n.sort: date newest\n' } });
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"\.sort: date newest" at .*\.sidebar:2: .*not a direction/),
    );
  });
});

describe('.sort', () => {
  it('sorts by date, newest first, with undated pages last', () => {
    const sidebar = build({ blog: { ...posts, '.sidebar': 'index.md:All posts\n.sort: date desc\n' } });
    expect(texts(sidebar['/blog/'][0].items!)).toEqual(['All posts', 'New', 'Mid', 'Old', 'Undated']);
  });

  it('sorts by date, oldest first, still with undated pages last', () => {
    const sidebar = build({ blog: { ...posts, '.sidebar': 'index.md\n.sort: date asc\n' } });
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['Old', 'Mid', 'New', 'Undated']);
  });

  it('reads the blog plugin date when a page has no date of its own', () => {
    const sidebar = build({
      blog: {
        'index.md': '# Blog',
        'one.md': post('One', undefined, 'blog:\n  date: 2026-01-01\n'),
        'two.md': post('Two', undefined, 'blog:\n  date: 2026-02-01\n'),
        '.sidebar': '.sort: date desc\n',
      },
    });
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['Two', 'One']);
  });

  it('sorts by any frontmatter field, with dots for nested ones, numbers as numbers', () => {
    const sidebar = build({
      steps: {
        'index.md': '# Steps',
        'x.md': post('Ten', undefined, 'meta:\n  order: 10\n'),
        'y.md': post('Two', undefined, 'meta:\n  order: 2\n'),
        'z.md': post('One', undefined, 'meta:\n  order: 1\n'),
        '.sidebar': '.sort: meta.order\n',
      },
    });
    expect(texts(sidebar['/steps/'][0].items!).slice(1)).toEqual(['One', 'Two', 'Ten']);
  });

  it('sorts by the title shown, including titles set in .sidebar', () => {
    const sidebar = build({
      docs: { ...posts, '.sidebar': 'd-undated.md:Aardvark\n...\n.sort: title\n' },
    });
    // Aardvark is listed explicitly, so it keeps its place; the rest sort by title.
    expect(texts(sidebar['/docs/'][0].items!).slice(1)).toEqual(['Aardvark', 'Mid', 'New', 'Old']);
  });

  it('keeps sticky posts on top, then sorts the rest by date, with several keys', () => {
    const sidebar = build({
      blog: {
        'index.md': '# Blog',
        'a.md': post('Pinned old', undefined, 'blog:\n  date: 2024-01-01\n  sticky: true\n'),
        'b.md': post('Newest', undefined, 'blog:\n  date: 2026-01-01\n'),
        'c.md': post('Unpinned', undefined, 'blog:\n  date: 2025-01-01\n  sticky: false\n'),
        '.sidebar': 'index.md\n.sort: blog.sticky desc, date desc\n',
      },
    });
    // `sticky: false` counts as no value, so it ties with posts that don't say and falls to the date.
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['Pinned old', 'Newest', 'Unpinned']);
  });

  it('sorts by name in reverse', () => {
    const sidebar = build({ blog: { ...posts, '.sidebar': '.sort: name desc\n' } });
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['Undated', 'Mid', 'New', 'Old']);
  });

  it('keeps entries listed before and after ... in place', () => {
    const sidebar = build({
      blog: { ...posts, '.sidebar': 'index.md:All posts\na-old.md:Pinned\n...\nd-undated.md\n.sort: date desc\n' },
    });
    expect(texts(sidebar['/blog/'][0].items!)).toEqual(['All posts', 'Pinned', 'New', 'Mid', 'Undated']);
  });

  it('sorts a subfolder by its landing page', () => {
    const sidebar = build({
      blog: {
        'index.md': '# Blog',
        'old.md': post('Old post', '2025-01-01'),
        // A single-page folder is flattened into a link among the pages.
        series: { 'index.md': post('Series', '2026-01-01') },
        '.sidebar': '.sort: date desc\n',
      },
    });
    expect(texts(sidebar['/blog/'][0].items!)).toEqual(['Blog', 'Series', 'Old post']);
  });

  it('applies the sort option to every folder, and a folder .sort wins', () => {
    const sidebar = build(
      {
        blog: { ...posts },
        notes: { ...posts, '.sidebar': '.sort: name\n' },
      },
      { sort: 'date desc' },
    );
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['New', 'Mid', 'Old', 'Undated']);
    expect(texts(sidebar['/notes/'][0].items!).slice(1)).toEqual(['Old', 'New', 'Mid', 'Undated']);
  });

  it('does not pass a folder .sort down to its subfolders', () => {
    const sidebar = build({
      blog: {
        'index.md': '# Blog',
        '.sidebar': '.sort: date desc\n',
        archive: { ...posts },
      },
    });
    const archive = sidebar['/blog/'].find((item) => item.text === 'Archive')!;
    expect(texts(archive.items!).slice(1)).toEqual(['Old', 'New', 'Mid', 'Undated']);
  });

  it('warns about a bad sort option and keeps alphabetical order', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sidebar = build({ blog: { ...posts } }, { sort: 'date sideways' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring the sort option "date sideways"'));
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['Old', 'New', 'Mid', 'Undated']);
  });
});

describe('.limit and .more', () => {
  const many: Tree = {
    'index.md': '# Blog',
    'a-old.md': post('Old', '2024-01-01'),
    'b-new.md': post('New', '2026-03-01'),
    'c-mid.md': post('Mid', '2025-06-15'),
    'd-undated.md': post('Undated'),
  };

  it('shows only the first entries after sorting, keeping listed ones', () => {
    const sidebar = build({ blog: { ...many, '.sidebar': 'index.md:All posts\n.sort: date desc\n.limit: 2\n' } });
    expect(texts(sidebar['/blog/'][0].items!)).toEqual(['All posts', 'New', 'Mid']);
  });

  it('does not count entries the file lists by name', () => {
    const sidebar = build({ blog: { ...many, '.sidebar': 'a-old.md:Pinned\n...\n.sort: date desc\n.limit: 1\n' } });
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['Pinned', 'New']);
  });

  it('ends with a link to the landing page when entries were left out and .more is set', () => {
    const sidebar = build({
      blog: { ...many, '.sidebar': '.sort: date desc\n.limit: 2\n.more: "Older posts"\n' },
    });
    const items = sidebar['/blog/'][0].items!;
    expect(texts(items).slice(1)).toEqual(['New', 'Mid', 'Older posts']);
    expect(items.at(-1)).toEqual({ text: 'Older posts', link: '/blog/' });
  });

  it('adds no link when nothing was left out', () => {
    const sidebar = build({ blog: { ...many, '.sidebar': '.limit: 10\n.more: Older posts\n' } });
    expect(texts(sidebar['/blog/'][0].items!)).not.toContain('Older posts');
  });

  it('takes the limit and link text from the options, and a folder setting wins', () => {
    const sidebar = build(
      { blog: { ...many }, notes: { ...many, '.sidebar': '.limit: 0\n' } },
      { sort: 'date desc', limit: 1, more: 'More' },
    );
    expect(texts(sidebar['/blog/'][0].items!).slice(1)).toEqual(['New', 'More']);
    expect(texts(sidebar['/notes/'][0].items!).slice(1)).toEqual(['New', 'Mid', 'Old', 'Undated']);
  });

  it.each([
    ['.limit: 5', null],
    ['.limit: 0', null],
    ['.limit: ten', 'whole number'],
    ['.limit: -1', 'whole number'],
    ['.more: Older posts', null],
    ['.more:', 'link text'],
  ])('checks %s', (line, problem) => {
    const result = directiveProblem(line);
    if (problem === null) expect(result).toBeNull();
    else expect(result).toContain(problem);
  });
});
