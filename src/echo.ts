export type EchoFrame = { t: number; x: number; y: number; flipX: boolean };

export function sampleEchoFrame(frames: EchoFrame[], elapsed: number): EchoFrame | undefined {
  if (frames.length === 0) return undefined;
  if (frames.length === 1 || elapsed <= frames[0].t) return frames[0];
  const last = frames[frames.length - 1];
  if (elapsed >= last.t) return last;

  const nextIndex = frames.findIndex(frame => frame.t >= elapsed);
  const next = frames[nextIndex];
  const previous = frames[nextIndex - 1];
  const progress = Math.min(1, Math.max(0, (elapsed - previous.t) / Math.max(1, next.t - previous.t)));

  return {
    t: elapsed,
    x: previous.x + (next.x - previous.x) * progress,
    y: previous.y + (next.y - previous.y) * progress,
    flipX: next.flipX,
  };
}
