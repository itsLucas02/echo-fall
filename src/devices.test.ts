import { describe, expect, it } from 'vitest';
import {
  advanceSequence,
  echoSwitchGateOpen,
  emptyRelayState,
  flipToggle,
  holdGateOpen,
  relayCharge,
  relayGateOpen,
  sequenceLampLabel,
  timedGateOpen,
  touchRelayPlate,
} from './devices';

describe('hold gates', () => {
  it('opens on any active plate in any-mode', () => {
    expect(holdGateOpen([false, false], 'any', false)).toBe(false);
    expect(holdGateOpen([false, true], 'any', false)).toBe(true);
  });

  it('requires every plate in all-mode', () => {
    expect(holdGateOpen([true, false], 'all', false)).toBe(false);
    expect(holdGateOpen([true, true], 'all', false)).toBe(true);
  });

  it('stays open once latched', () => {
    expect(holdGateOpen([false, false], 'all', true)).toBe(true);
  });
});

describe('timed gates', () => {
  it('closes when the timer expires', () => {
    expect(timedGateOpen(5000, 4999)).toBe(true);
    expect(timedGateOpen(5000, 5000)).toBe(false);
  });
});

describe('relay chains', () => {
  it('keeps plates uncharged before the first touch', () => {
    const state = emptyRelayState(3);
    expect(relayGateOpen(state, 1000)).toBe(false);
  });

  it('opens only while every plate charge is alive', () => {
    let state = emptyRelayState(2);
    state = touchRelayPlate(state, 0, 1000, 3500);
    expect(relayGateOpen(state, 2000)).toBe(false);
    state = touchRelayPlate(state, 1, 2000, 3500);
    expect(relayGateOpen(state, 3000)).toBe(true);
    expect(relayGateOpen(state, 4600)).toBe(false); // plate 0 expired at 4500
  });

  it('refreshes a single plate without extending the others', () => {
    let state = emptyRelayState(2);
    state = touchRelayPlate(state, 0, 1000, 3500);
    state = touchRelayPlate(state, 1, 2000, 3500);
    state = touchRelayPlate(state, 0, 3000, 3500);
    expect(state[0]).toBe(6500);
    expect(state[1]).toBe(5500);
  });

  it('reports clamped charge fractions for the HUD bars', () => {
    const state = touchRelayPlate(emptyRelayState(1), 0, 0, 4000);
    expect(relayCharge(state, 0, 1000, 4000)).toBeCloseTo(.75);
    expect(relayCharge(state, 0, 9000, 4000)).toBe(0);
  });
});

describe('sequence locks', () => {
  it('advances when the expected plate is pressed', () => {
    expect(advanceSequence(0, 2, [2, 0, 1])).toBe(1);
    expect(advanceSequence(1, 0, [2, 0, 1])).toBe(2);
    expect(advanceSequence(2, 1, [2, 0, 1])).toBe(3);
  });

  it('resets on a wrong plate', () => {
    expect(advanceSequence(2, 2, [2, 0, 1])).toBe(0);
  });

  it('labels lamps by their position in the order', () => {
    expect(sequenceLampLabel([2, 0, 1], 2)).toBe(1);
    expect(sequenceLampLabel([2, 0, 1], 0)).toBe(2);
    expect(sequenceLampLabel([2, 0, 1], 1)).toBe(3);
  });
});

describe('echo switches', () => {
  it('toggles and needs every resonator on', () => {
    expect(flipToggle(false)).toBe(true);
    expect(flipToggle(true)).toBe(false);
    expect(echoSwitchGateOpen([true, true])).toBe(true);
    expect(echoSwitchGateOpen([true, false])).toBe(false);
    expect(echoSwitchGateOpen([])).toBe(false);
  });
});
