export function formatRunTime(milliseconds: number, precise = false): string {
  const safeMilliseconds = Math.max(0, milliseconds);
  const minutes = Math.floor(safeMilliseconds / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1000);
  const fraction = precise
    ? String(Math.floor(safeMilliseconds % 1000)).padStart(3, '0')
    : String(Math.floor((safeMilliseconds % 1000) / 100));
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${fraction}`;
}

/** Ranks scale with each level's shard total and par time. */
export function completionRank(
  shards: number,
  totalShards: number,
  milliseconds: number,
  parMs: number,
): 'S' | 'A' | 'B' | 'C' {
  const needS = Math.ceil(totalShards * .75);
  const needA = Math.ceil(totalShards * .5);
  const needB = Math.ceil(totalShards * .25);
  if (shards >= needS && milliseconds <= parMs) return 'S';
  if (shards >= needA && milliseconds <= Math.round(parMs * 1.5)) return 'A';
  if (shards >= needB) return 'B';
  return 'C';
}

export interface LevelRecord {
  ms: number;
  shards: number;
}

export interface PlayerProgress {
  /** Highest level index available to play (0-based). */
  unlocked: number;
  /** Level the BEGIN button launches. */
  current: number;
  best: Record<string, LevelRecord>;
}

export const PROGRESS_KEY = 'echofall-progress-v2';

const STORAGE_FALLBACK = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
};

/** Resolves lazily so tests (Node) and private browsing modes degrade gracefully. */
const defaultStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try {
    return window.localStorage;
  } catch {
    return STORAGE_FALLBACK();
  }
};

export function loadProgress(levelIds: readonly string[], storage: Pick<Storage, 'getItem' | 'setItem'> = defaultStorage()): PlayerProgress {
  const fallback: PlayerProgress = { unlocked: 0, current: 0, best: {} };
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    const unlocked = Number.isInteger(parsed.unlocked) ? Math.max(0, Math.min(levelIds.length - 1, parsed.unlocked!)) : 0;
    const current = Number.isInteger(parsed.current) ? Math.max(0, Math.min(unlocked, parsed.current!)) : 0;
    const best: Record<string, LevelRecord> = {};
    Object.entries(parsed.best ?? {}).forEach(([id, record]) => {
      if (levelIds.includes(id) && record && Number.isFinite(record.ms) && Number.isInteger(record.shards)) {
        best[id] = { ms: record.ms, shards: record.shards };
      }
    });
    return { unlocked, current, best };
  } catch {
    return fallback;
  }
}

export function saveProgress(progress: PlayerProgress, storage: Pick<Storage, 'getItem' | 'setItem'> = defaultStorage()): void {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // A finished run still counts even when browser storage is unavailable.
  }
}

export interface CompletionOutcome {
  progress: PlayerProgress;
  isBest: boolean;
  unlockedNext: boolean;
}

/** Records a finished level: best time, unlock of the next chapter. Pure apart from storage. */
export function recordCompletion(
  progress: PlayerProgress,
  levelId: string,
  levelIndex: number,
  levelCount: number,
  milliseconds: number,
  shards: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> = defaultStorage(),
): CompletionOutcome {
  const previous = progress.best[levelId];
  const isBest = previous === undefined || milliseconds < previous.ms;
  const next: PlayerProgress = {
    unlocked: progress.unlocked,
    current: progress.current,
    best: { ...progress.best, [levelId]: isBest ? { ms: Math.round(milliseconds), shards } : previous! },
  };
  let unlockedNext = false;
  if (levelIndex + 1 < levelCount && next.unlocked < levelIndex + 1) {
    next.unlocked = levelIndex + 1;
    next.current = levelIndex + 1;
    unlockedNext = true;
  }
  saveProgress(next, storage);
  return { progress: next, isBest, unlockedNext };
}
