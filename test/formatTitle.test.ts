import { describe, expect, it } from 'vitest';
import { formatTitle, truncateTitle } from '../src/formatTitle.js';

describe('formatTitle', () => {
  it('strips a .md extension', () => {
    expect(formatTitle('getting-started.md')).toBe('Getting Started');
  });

  it('strips a leading numeric ordering prefix', () => {
    expect(formatTitle('01-introduction.md')).toBe('Introduction');
    expect(formatTitle('02_setup')).toBe('Setup');
  });

  it('replaces separators with spaces and title-cases words', () => {
    expect(formatTitle('sql-server-patterns')).toBe('Sql Server Patterns');
  });

  it('preserves existing all-caps acronyms', () => {
    expect(formatTitle('api-API-docs')).toBe('Api API Docs');
  });

  it('keeps minor words lowercase unless first or last', () => {
    expect(formatTitle('guide-to-the-cli')).toBe('Guide to the Cli');
    expect(formatTitle('the-state-of-the-art')).toBe('The State of the Art');
    expect(formatTitle('what-to-log-in')).toBe('What to Log In');
    expect(formatTitle('Tips-And-Tricks')).toBe('Tips and Tricks');
  });

  it('capitalises every word when titleCase is off', () => {
    expect(formatTitle('guide-to-the-cli', 50, {}, false)).toBe('Guide To The Cli');
  });

  it('truncates long titles with an ellipsis', () => {
    const result = formatTitle('a-very-long-directory-name-that-exceeds-the-limit', 20);
    expect(result.length).toBe(20);
    expect(result.endsWith('…')).toBe(true);
  });

  it('strips matching surrounding quotes', () => {
    expect(formatTitle('"quoted-name"')).toBe('Quoted Name');
    expect(formatTitle("'single'")).toBe('Single');
    expect(formatTitle('"unbalanced')).toBe('"unbalanced');
  });

  it('keeps from, into, near, onto and with lowercase mid-title', () => {
    expect(formatTitle('working-with-data-from-apis-into-sql')).toBe('Working with Data from Apis into Sql');
    expect(formatTitle('near-the-edge-onto-it')).toBe('Near the Edge onto It');
  });

  it('applies word and multi-word replacements as written', () => {
    const replacements = {
      github: 'GitHub',
      'vs code': 'VS Code',
      'visual-studio-code': 'Visual Studio Code',
      ios: 'iOS',
    };
    expect(formatTitle('github-actions', 50, replacements)).toBe('GitHub Actions');
    expect(formatTitle('setup-vs-code-and-github', 50, replacements)).toBe('Setup VS Code and GitHub');
    expect(formatTitle('Visual_Studio_Code-tips', 50, replacements)).toBe('Visual Studio Code Tips');
    expect(formatTitle('ios-apps', 50, replacements)).toBe('iOS Apps');
    expect(formatTitle('vs-other', 50, replacements)).toBe('Vs Other');
  });
});

describe('truncateTitle', () => {
  it('leaves short titles untouched, including hyphens and casing', () => {
    expect(truncateTitle('Step-by-step Guide')).toBe('Step-by-step Guide');
  });

  it('truncates without mangling the remaining text', () => {
    const result = truncateTitle('A fairly long human-written title here', 15);
    expect(result).toBe('A fairly long…');
  });

  it('trims surrounding whitespace', () => {
    expect(truncateTitle('  Spaced  ')).toBe('Spaced');
  });
});
