import { afterEach, describe, expect, it } from 'vitest';
import { generateSidebar } from '../src/generateSidebar.js';
import { formatTitle } from '../src/formatTitle.js';
import { stripTagSyntax } from '../src/titles.js';
import { createFixture, removeFixture, type Tree } from './testUtils.js';

let root: string | undefined;

function build(tree: Tree, options?: Parameters<typeof generateSidebar>[1]) {
  root = createFixture(tree);
  return generateSidebar(root, options);
}

afterEach(() => {
  if (root) removeFixture(root);
  root = undefined;
});

describe('formatTitle replacements', () => {
  it('replaces whole words, case-insensitively, with the value as written', () => {
    expect(formatTitle('github-actions', 50, { GITHUB: 'GitHub', cicd: 'CI/CD' })).toBe('GitHub Actions');
    expect(formatTitle('02_cicd-pipelines.md', 50, { cicd: 'CI/CD' })).toBe('CI/CD Pipelines');
    expect(formatTitle('githubs-notes', 50, { github: 'GitHub' })).toBe('Githubs Notes');
  });
});

describe('stripTagSyntax', () => {
  it.each([
    ['Design ((tag|draft))', 'Design'],
    ['((tag|new)) Design', 'Design'],
    ['A ((tag/beta/#fff/#000)) B', 'A B'],
    ['Back ((<tag|old))', 'Back'],
    ['Plain (parenthesised) title', 'Plain (parenthesised) title'],
  ])('%s → %s', (input, expected) => {
    expect(stripTagSyntax(input)).toBe(expected);
  });
});

describe('titleReplacements', () => {
  it('applies to folder- and file-derived titles only', () => {
    const sidebar = build(
      {
        'github-actions': {
          'index.md': 'no heading',
          'api-setup.md': 'no heading',
          'github-notes.md': '# github notes, as written',
        },
      },
      { titleReplacements: { github: 'GitHub', api: 'API' } },
    );
    const section = sidebar['/github-actions/'][0];
    expect(section.text).toBe('GitHub Actions');
    expect(section.items?.map((i) => i.text)).toEqual(['GitHub Actions', 'API Setup', 'github notes, as written']);
  });
});

describe('stripTags', () => {
  const tree: Tree = {
    guide: {
      'index.md': '# Guide',
      'design.md': '# Design ((tag|draft))',
      'plan.md': '---\ntitle: Plan ((tag|wip))\n---\n',
      '.sidebar': '[Drafts ((tag|new))]\ndesign.md\nplan.md',
    },
  };

  it('removes markdown-tags syntax from headings, frontmatter and .sidebar lines by default', () => {
    const sidebar = build(tree);
    expect(JSON.stringify(sidebar)).not.toContain('((');
    const group = sidebar['/guide/'].find((i) => i.text === 'Drafts');
    expect(group?.items?.map((i) => i.text)).toEqual(['Design', 'Plan']);
  });

  it('keeps it with stripTags: false', () => {
    expect(JSON.stringify(build(tree, { stripTags: false }))).toContain('Design ((tag|draft))');
  });
});

describe('transformTitle', () => {
  it('is called with every title and its source, before truncation', () => {
    const seen: string[] = [];
    const sidebar = build(
      { guide: { 'index.md': '# Guide', 'a-page.md': 'no heading', '.sidebar': 'index.md\na-page.md' } },
      {
        maxTitleLength: 8,
        transformTitle: (title, { source }) => {
          seen.push(`${source}:${title}`);
          return source === 'name' ? `${title}!!!!!!` : undefined;
        },
      },
    );
    expect(seen).toEqual(expect.arrayContaining(['name:Guide', 'page:Guide', 'name:A Page']));
    expect(sidebar['/guide/'][0].items?.map((i) => i.text)).toEqual(['Guide', 'A Page!…']);
  });
});

describe('groupTitleFromIndex', () => {
  const tree: Tree = {
    guide: {
      'index.md': '# Guide',
      'github-actions': { 'index.md': '---\ntitle: The GitHub Actions Guide\n---\n', 'a.md': '# A' },
      api: { 'README.md': '# API ((tag|beta))', 'b.md': '# B' },
      'no-title': { 'index.md': 'no heading', 'c.md': '# C' },
      named: { 'index.md': '---\nsection-title: Named Section\n---\n# Ignored', 'd.md': '# D' },
    },
  };

  it('labels a group with its landing page title when turned on', () => {
    const texts = build(tree, { groupTitleFromIndex: true })['/guide/'].map((i) => i.text);
    expect(texts).toEqual(['Guide', 'API', 'The GitHub Actions Guide', 'Named Section', 'No Title']);
  });

  it('uses the formatted folder name by default', () => {
    const texts = build(tree)['/guide/'].map((i) => i.text);
    expect(texts).toEqual(['Guide', 'Api', 'Github Actions', 'Named Section', 'No Title']);
  });
});
