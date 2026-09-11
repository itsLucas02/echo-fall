import { describe, expect, it } from 'vitest';
import { completionRank, formatRunTime, loadProgress, PROGRESS_KEY, recordCompletion } from './progress';

const storageStub = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
};

describe('run progress', () => {
  it('formats compact and precise run times', () => {
    expect(formatRunTime(65_432)).toBe('01:05.4');
    expect(formatRunTime(65_432, true)).toBe('01:05.432');
  });

  it('awards ranks from collection and completion time relative to par', () => {
    expect(completionRank(12, 16, 119_999, 180_000)).toBe('S');
    expect(completionRank(8, 16, 200_000, 180_000)).toBe('A');
    expect(completionRank(4, 16, 250_000, 180_000)).toBe('B');
    expect(completionRank(1, 16, 80_000, 180_000)).toBe('C');
  });
});

describe('chapter persistence', () => {
  it('loads a safe default when storage is empty', () => {
    const progress = loadProgress(['a', 'b'], storageStub());
    expect(progress).toEqual({ unlocked: 0, current: 0, best: {} });
  });

  it('unlocks the next chapter and stores the best time on completion', () => {
    const storage = storageStub();
    let progress = loadProgress(['a', 'b', 'c'], storage);
    const first = recordCompletion(progress, 'a', 0, 3, 90_000, 10, storage);
    expect(first.unlockedNext).toBe(true);
    expect(first.isBest).toBe(true);
    progress = first.progress;
    expect(progress.unlocked).toBe(1);
    expect(progress.current).toBe(1);

    const second = recordCompletion(progress, 'a', 0, 3, 120_000, 12, storage);
    expect(second.isBest).toBe(false);
    expect(second.progress.best.a.ms).toBe(90_000);
    expect(second.progress.unlocked).toBe(1);

    expect(JSON.parse(storage.getItem(PROGRESS_KEY)!).best.a).toEqual({ ms: 90_000, shards: 10 });
    expect(loadProgress(['a', 'b', 'c'], storage).unlocked).toBe(1);
  });

  it('never unlocks beyond the final chapter', () => {
    const progress = loadProgress(['a', 'b'], storageStub());
    const outcome = recordCompletion(progress, 'b', 1, 2, 50_000, 5, storageStub());
    expect(outcome.unlockedNext).toBe(false);
    expect(outcome.progress.unlocked).toBe(0);
  });
});
