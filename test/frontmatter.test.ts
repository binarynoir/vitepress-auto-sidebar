import { describe, expect, it } from 'vitest';
import { readFrontmatter } from '../src/frontmatter.js';

describe('readFrontmatter', () => {
  it('splits frontmatter from content', () => {
    expect(readFrontmatter('---\ntitle: Hello\nsection-title: Guide\n---\n# Body\n')).toEqual({
      data: { title: 'Hello', 'section-title': 'Guide' },
      content: '# Body\n',
    });
  });

  it('returns the whole file when there is no frontmatter', () => {
    expect(readFrontmatter('# Just a heading\n')).toEqual({ data: {}, content: '# Just a heading\n' });
  });

  it('handles empty frontmatter', () => {
    expect(readFrontmatter('---\n---\n# Body')).toEqual({ data: {}, content: '# Body' });
    expect(readFrontmatter('---\n\n---\n# Body')).toEqual({ data: {}, content: '# Body' });
  });

  it('handles Windows line endings and a byte order mark', () => {
    expect(readFrontmatter('﻿---\r\ntitle: Hello\r\n---\r\n# Body')).toEqual({
      data: { title: 'Hello' },
      content: '# Body',
    });
  });

  it('handles a file that is only frontmatter', () => {
    expect(readFrontmatter('---\ntitle: Hello\n---')).toEqual({ data: { title: 'Hello' }, content: '' });
  });

  it('only reads frontmatter at the very start of the file', () => {
    const raw = '# Title\n\n---\ntitle: Nope\n---\n';
    expect(readFrontmatter(raw)).toEqual({ data: {}, content: raw });
  });

  it('ignores frontmatter that is not a mapping', () => {
    expect(readFrontmatter('---\n- a\n- b\n---\nBody').data).toEqual({});
  });

  it('reads YAML 1.2: yes/no stay strings', () => {
    expect(readFrontmatter('---\ntitle: yes\n---\n').data).toEqual({ title: 'yes' });
  });

  it('throws on invalid YAML', () => {
    expect(() => readFrontmatter('---\ntitle: [unclosed\n---\n')).toThrow();
  });
});
