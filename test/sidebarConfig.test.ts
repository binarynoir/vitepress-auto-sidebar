import { afterEach, describe, expect, it, vi } from 'vitest';
import { directiveProblem, parseSidebarDirectives } from '../src/sidebarConfig.js';
import { generateSidebar } from '../src/generateSidebar.js';
import { createFixture, removeFixture } from './testUtils.js';

function parse(line: string) {
  return parseSidebarDirectives([line])[0];
}

describe('parseSidebarDirectives: web links', () => {
  it.each([
    ['https://example.com:Title'],
    ['https://example.com: Title'],
    ['https://example.com:"Title"'],
    ['https://example.com: "Title"'],
    ["https://example.com:'Title'"],
    ["https://example.com: 'Title'"],
    ['"https://example.com":"Title"'],
    ['"https://example.com": "Title"'],
    ["'https://example.com': 'Title'"],
  ])('parses %s', (line) => {
    expect(parse(line)).toMatchObject({ url: 'https://example.com', title: 'Title', isWebLink: true });
  });

  it('parses a ROOT link with a quoted title after a space', () => {
    expect(parse(`ROOT='https://example.com/x': "Portal"`)).toMatchObject({
      url: 'https://example.com/x',
      title: 'Portal',
      isWebLink: true,
      isRootLevel: true,
    });
  });

  it('keeps a port, query and fragment in a bare URL', () => {
    expect(parse('https://example.com:8080/a?b=1#c: Docs')).toMatchObject({
      url: 'https://example.com:8080/a?b=1#c',
      title: 'Docs',
    });
  });

  it('keeps a colon inside an unquoted title after a space', () => {
    expect(parse('https://example.com: Status: Live')).toMatchObject({
      url: 'https://example.com',
      title: 'Status: Live',
    });
  });
});

describe('parseSidebarDirectives: file titles', () => {
  it.each([['name.md:Title'], ['name.md: Title'], ['name.md:"Title"'], ['name.md: "Title"'], ["name.md: 'Title'"]])(
    'parses %s',
    (line) => {
      expect(parse(line)).toMatchObject({ name: 'name.md', title: 'Title' });
    },
  );
});

describe('directiveProblem', () => {
  it.each([['name.md'], ['name.md: "Title"'], ['https://example.com: "Title"'], ['[Group]'], ['...'], ['-old.md']])(
    'accepts %s',
    (line) => {
      expect(directiveProblem(line)).toBeNull();
    },
  );

  it.each([['https://example.com'], ['"https://example.com"'], ['name.md: "Title'], ["https://example.com: 'Title"]])(
    'rejects %s',
    (line) => {
      expect(directiveProblem(line)).not.toBeNull();
    },
  );
});

describe('.sidebar files', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) removeFixture(root);
    root = undefined;
    vi.restoreAllMocks();
  });

  it('keeps links whose quoted title follows a space', () => {
    root = createFixture({
      guides: {
        'index.md': '# Guides',
        'a.md': '# A',
        '.sidebar': 'a.md\nhttps://example.com/one: "One"\n"https://example.com/two": \'Two\'\n',
      },
    });
    const items = generateSidebar(root)['/guides/'][0].items ?? [];
    expect(items.map((i) => [i.text, i.link])).toEqual([
      ['Guides', '/guides/'],
      ['A', '/guides/a.md'],
      ['One', 'https://example.com/one'],
      ['Two', 'https://example.com/two'],
    ]);
  });

  it('warns about a line it cannot parse, naming the file and line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    root = createFixture({
      guides: { 'index.md': '# Guides', 'a.md': '# A', '.sidebar': '# links\na.md\nhttps://example.com/no-title\n' },
    });
    generateSidebar(root);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    const matching = messages.filter((m) => m.includes('https://example.com/no-title'));
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatch(/guides\/\.sidebar:3/);
  });
});
