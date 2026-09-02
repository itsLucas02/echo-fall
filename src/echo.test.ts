import { describe, expect, it } from 'vitest';
import { sampleEchoFrame, type EchoFrame } from './echo';

const frames: EchoFrame[] = [
  { t: 0, x: 10, y: 20, flipX: false },
  { t: 100, x: 30, y: 40, flipX: true },
  { t: 200, x: 50, y: 20, flipX: false },
];

describe('sampleEchoFrame', () => {
  it('interpolates position between recorded frames', () => {
    expect(sampleEchoFrame(frames, 50)).toEqual({ t: 50, x: 20, y: 30, flipX: true });
  });

  it('clamps playback to the first and last samples', () => {
    expect(sampleEchoFrame(frames, -20)).toBe(frames[0]);
    expect(sampleEchoFrame(frames, 900)).toBe(frames[2]);
  });

  it('handles an empty recording', () => {
    expect(sampleEchoFrame([], 50)).toBeUndefined();
  });
});
