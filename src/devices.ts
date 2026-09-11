/**
 * Pure rules for the puzzle devices. The Phaser scene keeps the runtime
 * state and calls into these helpers every frame; keeping the maths here
 * means the puzzle rules are unit-testable without a browser.
 */

export type HoldMode = 'any' | 'all';

/** A `hold` gate is open while the required plates are pressed (or once latched). */
export function holdGateOpen(actives: boolean[], mode: HoldMode, latched: boolean): boolean {
  if (latched) return true;
  return mode === 'all' ? actives.length > 0 && actives.every(Boolean) : actives.some(Boolean);
}

/** A timed gate is open until its expiry timestamp passes. */
export function timedGateOpen(expiry: number, now: number): boolean {
  return now < expiry;
}

export type RelayState = readonly number[];

/** Touching relay plate `index` refreshes its charge to `now + holdMs`. */
export function touchRelayPlate(state: RelayState, index: number, now: number, holdMs: number): RelayState {
  return state.map((expiry, i) => (i === index ? now + holdMs : expiry));
}

export function emptyRelayState(plates: number, now = 0): RelayState {
  return Array.from({ length: plates }, () => now);
}

/** The relay gate is open only while every plate is still charged. */
export function relayGateOpen(state: RelayState, now: number): boolean {
  return state.length > 0 && state.every(expiry => expiry > now);
}

/** Fraction of charge left on one relay plate, clamped to 0..1 (for the HUD bars). */
export function relayCharge(state: RelayState, index: number, now: number, holdMs: number): number {
  const remaining = state[index] - now;
  return Math.min(1, Math.max(0, remaining / holdMs));
}

/**
 * Sequence locks: `progress` plates of `order` have been pressed in sequence.
 * Pressing the expected plate advances; pressing any other plate resets.
 * Returns the new progress; completion is `progress === order.length`.
 */
export function advanceSequence(progress: number, pressedIndex: number, order: readonly number[]): number {
  return order[progress] === pressedIndex ? progress + 1 : 0;
}

/** Lamp number (1-based) shown above plate `plateIndex`, or 0 when the plate is not in the order. */
export function sequenceLampLabel(order: readonly number[], plateIndex: number): number {
  return order.indexOf(plateIndex) + 1;
}

/** Echo resonators toggle each time a body enters their field (edge-triggered). */
export function flipToggle(on: boolean): boolean {
  return !on;
}

/** An echo-switch gate is open only while every of its resonators is on. */
export function echoSwitchGateOpen(states: readonly boolean[]): boolean {
  return states.length > 0 && states.every(Boolean);
}

/** Shurikens (and other cooldown actions) fire only when the cooldown has elapsed. */
export function cooldownReady(lastUsedAt: number, now: number, cooldownMs: number): boolean {
  return now - lastUsedAt >= cooldownMs;
}
