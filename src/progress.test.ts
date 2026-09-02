import { describe, expect, it } from 'vitest';
import { completionRank, formatRunTime } from './progress';

describe('run progress', () => {
  it('formats compact and precise run times', () => {
    expect(formatRunTime(65_432)).toBe('01:05.4');
    expect(formatRunTime(65_432, true)).toBe('01:05.432');
  });

  it('awards ranks from collection and completion time', () => {
    expect(completionRank(12, 119_999)).toBe('S');
    expect(completionRank(10, 160_000)).toBe('A');
    expect(completionRank(7, 250_000)).toBe('B');
    expect(completionRank(3, 80_000)).toBe('C');
  });
});
