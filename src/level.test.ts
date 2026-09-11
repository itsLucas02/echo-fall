import { describe, expect, it } from 'vitest';
import { deviceGateXs, gateClearanceViolations, GATE_CLEARANCE, levelIssues, type LevelBlueprint } from './level';
import { LEVELS } from './levels';

describe('level blueprints', () => {
  it('exposes at least four unique chapters', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(LEVELS.map(level => level.id)).size).toBe(LEVELS.length);
  });

  it('keeps elevated platforms out of every gate clearance zone in every level', () => {
    LEVELS.forEach(level => {
      expect(gateClearanceViolations(level), `${level.id}`).toEqual([]);
    });
  });

  it('keeps every gate and the goal inside the world in every level', () => {
    LEVELS.forEach(level => {
      expect(level.gateXs.every(x => x >= GATE_CLEARANCE && x <= level.worldWidth - GATE_CLEARANCE), `${level.id}`).toBe(true);
      expect(level.goalX, `${level.id}`).toBeLessThan(level.worldWidth);
    });
  });

  it('lists every device gate in gateXs and passes all static checks', () => {
    LEVELS.forEach(level => {
      const issues = levelIssues(level);
      expect(issues, `${level.id}: ${issues.join('; ')}`).toEqual([]);
      expect(deviceGateXs(level).length, `${level.id}`).toBeGreaterThan(0);
    });
  });

  it('gives every chapter a positive par time and reachable checkpoints', () => {
    LEVELS.forEach(level => {
      expect(level.parMs, `${level.id}`).toBeGreaterThan(60_000);
      level.checkpoints.forEach(x => expect(x, `${level.id}`).toBeLessThan(level.goalX));
    });
  });

  it('teaches every chapter with proximity hints', () => {
    LEVELS.forEach(level => {
      expect(level.hints?.length, `${level.id}`).toBeGreaterThanOrEqual(4);
      const texts = (level.hints ?? []).map(hint => hint.text).join('\n');
      expect(texts, `${level.id} should explain the echo`).toMatch(/echo/i);
    });
  });

  it('respawns every checkpoint onto solid ground (respawn = checkpoint x − 30)', () => {
    LEVELS.forEach(level => {
      const overFloor = (x: number) => level.floorSegments.some(([center, width]) =>
        x >= center - width / 2 + 6 && x <= center + width / 2 - 6);
      level.checkpoints.forEach(x => {
        expect(overFloor(x - 30), `${level.id} checkpoint ${x} respawns over a gap`).toBe(true);
      });
    });
  });

  it('keeps enemies clear of gate lines so puzzles stay fair', () => {
    const near = (level: LevelBlueprint, x: number) => level.gateXs.some(gateX => Math.abs(gateX - x) < 60);
    LEVELS.forEach(level => {
      level.enemies.forEach(enemy => {
        if (enemy.kind === 'warden') return; // the warden owns its arena by design
        expect(near(level, enemy.x), `${level.id} ${enemy.kind}@${enemy.x}`).toBe(false);
      });
    });
  });
});
