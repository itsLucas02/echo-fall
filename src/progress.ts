export function formatRunTime(milliseconds: number, precise = false): string {
  const safeMilliseconds = Math.max(0, milliseconds);
  const minutes = Math.floor(safeMilliseconds / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1000);
  const fraction = precise
    ? String(Math.floor(safeMilliseconds % 1000)).padStart(3, '0')
    : String(Math.floor((safeMilliseconds % 1000) / 100));
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${fraction}`;
}

export function completionRank(shards: number, milliseconds: number): 'S' | 'A' | 'B' | 'C' {
  if (shards >= 12 && milliseconds <= 120_000) return 'S';
  if (shards >= 9 && milliseconds <= 180_000) return 'A';
  if (shards >= 6) return 'B';
  return 'C';
}
