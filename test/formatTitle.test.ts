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
    expect(formatTitle('ssrs-SSRS-reports')).toBe('Ssrs SSRS Reports');
  });

  it('truncates long titles with an ellipsis', () => {
    const result = formatTitle('a-very-long-directory-name-that-exceeds-the-limit', 20);
    expect(result.length).toBe(20);
    expect(result.endsWith('…')).toBe(true);
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
