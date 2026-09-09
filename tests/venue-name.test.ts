import { describe, it, expect } from 'vitest';
import { tidyVenueName, formatDateRange } from '../src/lib/data';

describe('tidyVenueName', () => {
  it('collapses an exact repeat', () => {
    expect(tidyVenueName('entry55 [성수] (entry55 [성수] )')).toBe('entry55 [성수]');
  });

  it('collapses a repeat that differs only in spacing', () => {
    // Real KOPIS value: the hall repeats the venue with different spacing.
    expect(tidyVenueName('오아스페이스 (구, 스페이스 홍) (오아스페이스(구, 스페이스 홍))'))
      .toBe('오아스페이스 (구, 스페이스 홍)');
  });

  it('keeps a genuinely different hall', () => {
    expect(tidyVenueName('올림픽공원 (올림픽홀)')).toBe('올림픽공원 (올림픽홀)');
  });

  it('keeps a nested hall name that is not a repeat', () => {
    const v = '라이언슈퍼클럽 (LION SUPER CLUB) (라이언슈퍼클럽(1F))';
    expect(tidyVenueName(v)).toBe(v);
  });

  it('leaves a name without parentheses alone', () => {
    expect(tidyVenueName('세종문화회관')).toBe('세종문화회관');
  });

  it('does not strip a name that is only a parenthesised group', () => {
    expect(tidyVenueName('(구, 스페이스 홍)')).toBe('(구, 스페이스 홍)');
  });

  it('handles unbalanced parentheses without throwing', () => {
    expect(tidyVenueName('공연장 ((이상함)')).toBe('공연장 ((이상함)');
    expect(tidyVenueName('공연장 (이상함')).toBe('공연장 (이상함');
  });

  it('trims surrounding whitespace', () => {
    expect(tidyVenueName('  세종문화회관  ')).toBe('세종문화회관');
  });
});

describe('formatDateRange', () => {
  it('renders a single day', () => {
    expect(formatDateRange('2026-09-19', '2026-09-19')).toBe('19 Sep 2026');
  });

  it('collapses a range inside one month', () => {
    expect(formatDateRange('2026-09-19', '2026-09-20')).toBe('19–20 Sep 2026');
  });

  it('spans months within a year', () => {
    expect(formatDateRange('2026-09-30', '2026-10-02')).toBe('30 Sep – 2 Oct 2026');
  });

  it('spans years', () => {
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
  });

  it('says so when there is no date rather than inventing one', () => {
    expect(formatDateRange(null, null)).toBe('Date to be announced');
  });

  it('treats a missing end date as a single day', () => {
    expect(formatDateRange('2026-09-19', null)).toBe('19 Sep 2026');
  });
});
