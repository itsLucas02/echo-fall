import { describe, expect, it } from 'vitest';
import { gateClearanceViolations, GATE_CLEARANCE, LEVEL_BLUEPRINT } from './level';

describe('level blueprint', () => {
  it('keeps elevated platforms out of every gate clearance zone', () => {
    expect(gateClearanceViolations()).toEqual([]);
  });

  it('keeps every gate and the goal inside the world', () => {
    expect(LEVEL_BLUEPRINT.gateXs.every(x => x >= GATE_CLEARANCE && x <= LEVEL_BLUEPRINT.worldWidth - GATE_CLEARANCE)).toBe(true);
    expect(LEVEL_BLUEPRINT.goalX).toBeLessThan(LEVEL_BLUEPRINT.worldWidth);
  });
});
