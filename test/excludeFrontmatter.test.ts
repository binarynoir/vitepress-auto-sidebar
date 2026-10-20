import { afterEach, describe, expect, it } from 'vitest';
import { generateSidebar } from '../src/generateSidebar.js';
import type { SidebarItem } from '../src/types.js';
import { createFixture, removeFixture, type Tree } from './testUtils.js';

let root: string;

function build(tree: Tree, options?: Parameters<typeof generateSidebar>[1]) {
  root = createFixture(tree);
  return generateSidebar(root, options);
}

afterEach(() => {
  if (root) removeFixture(root);
});

/** Every link in the sidebar, at any depth. */
function links(items: SidebarItem[]): string[] {
  return items.flatMap((item) => [...(item.link ? [item.link] : []), ...links(item.items ?? [])]);
}

const page = (frontmatter: string, title: string) => `---\n${frontmatter}\n---\n\n# ${title}\n`;

const tree: Tree = {
  guide: {
    'index.md': '# Guide',
    'ready.md': page('title: Ready', 'Ready'),
    'draft.md': page('draft: true', 'Draft'),
    'kept.md': page('draft: false', 'Kept'),
    'post.md': page('blog:\n  draft: true', 'Blog draft'),
    upcoming: { 'index.md': page('draft: true', 'Upcoming'), 'notes.md': '# Notes' },
  },
};

describe('excludeFrontmatter', () => {
  it('shows every page without the option', () => {
    const all = links(build(tree)['/guide/']);
    expect(all).toContain('/guide/draft.md');
    expect(all).toContain('/guide/post.md');
  });

  it('hides pages whose frontmatter sets a listed key to true, nested keys included', () => {
    const all = links(build(tree, { excludeFrontmatter: ['draft', 'blog.draft'] })['/guide/']);
    expect(all).not.toContain('/guide/draft.md');
    expect(all).not.toContain('/guide/post.md');
    expect(all).toContain('/guide/ready.md');
    expect(all).toContain('/guide/kept.md');
  });

  it('only hides the keys it is given', () => {
    const all = links(build(tree, { excludeFrontmatter: ['draft'] })['/guide/']);
    expect(all).not.toContain('/guide/draft.md');
    expect(all).toContain('/guide/post.md');
  });

  it("drops a folder's link when its landing page is hidden, keeping its other pages", () => {
    const all = links(build(tree, { excludeFrontmatter: ['draft'] })['/guide/']);
    expect(all).not.toContain('/guide/upcoming/');
    expect(all).toContain('/guide/upcoming/notes.md');
  });
});
