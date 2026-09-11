export type PlatformSpec = readonly [x: number, y: number, width: number];
export type PositionedSpec = readonly [x: number, y: number];
export type FloorSpec = readonly [x: number, width: number];
export type HazardSpec = readonly [x: number, count: number];

export type EnemyKind = 'crawler' | 'flyer' | 'spitter' | 'charger' | 'warden';

export interface EnemySpec {
  x: number;
  y: number;
  kind: EnemyKind;
  minX?: number;
  maxX?: number;
}

/**
 * Every puzzle device is data. The scene turns each spec into visuals,
 * physics bodies, and a runtime entry it advances every frame.
 *
 * - `hold`        gates stay open while its plate(s) are pressed (the classic echo plate).
 * - `timed`       pressing the plate opens the shutters for `openMs`.
 * - `relay`       every touch charges a plate for `holdMs`; the gate opens only while
 *                 every plate is charged at once — the echo makes it comfortable.
 * - `sequence`    plates must be touched in `order` (plate indices); lamps show 1·2·3.
 * - `echoSwitch`  crystal resonators that answer ONLY to the echo; each crossing toggles.
 * - `guard`       a gate held shut until the linked enemy (the warden) falls.
 * - `lift`        a plate-powered platform that patrols between `from` and `to`.
 */
export type DeviceSpec =
  | {
      kind: 'hold';
      plateXs: number[];
      gateXs: number[];
      requireAll?: boolean;
      latch?: boolean;
      closeDelayMs?: number;
    }
  | { kind: 'timed'; plateX: number; gateXs: number[]; openMs: number }
  | { kind: 'relay'; plateXs: number[]; gateX: number; holdMs: number }
  | { kind: 'sequence'; plateXs: number[]; gateX: number; order: number[] }
  | { kind: 'echoSwitch'; switchXs: number[]; gateX: number }
  | { kind: 'guard'; enemyIndex: number; gateX: number }
  | { kind: 'lift'; plateX: number; x: number; from: number; to: number; axis: 'x' | 'y'; speed?: number };

export interface MoverSpec {
  x: number;
  y: number;
  width: number;
  dx: number;
  speed?: number;
}

export interface CrusherSpec {
  x: number;
  hangY: number;
  slamY: number;
  period: number;
  phase?: number;
}

export interface PendulumSpec {
  x: number;
  pivotY: number;
  length: number;
  period: number;
  phase?: number;
  amplitude?: number;
}

export type BouncerSpec = readonly [x: number, y: number];

export interface WindSpec {
  x: number;
  width: number;
  fx: number;
}

export interface HintSpec {
  atX: number;
  text: string;
}

export interface LevelPalette {
  sky: number;
  tint: number;
  platform: number;
  stroke: number;
  moss: number;
  abyss: number;
}

export interface LevelBlueprint {
  id: string;
  name: string;
  subtitle: string;
  intro: string;
  parMs: number;
  worldWidth: number;
  palette: LevelPalette;
  floorSegments: readonly FloorSpec[];
  platforms: readonly PlatformSpec[];
  movers?: readonly MoverSpec[];
  crumbles?: readonly PlatformSpec[];
  bouncers?: readonly BouncerSpec[];
  windZones?: readonly WindSpec[];
  crushers?: readonly CrusherSpec[];
  pendulums?: readonly PendulumSpec[];
  hazards: readonly HazardSpec[];
  enemies: readonly EnemySpec[];
  shards: readonly PositionedSpec[];
  checkpoints: readonly number[];
  devices: readonly DeviceSpec[];
  hints?: readonly HintSpec[];
  goalX: number;
  gateXs: readonly number[];
}

export const GATE_CLEARANCE = 120;

/** Every gate x-coordinate declared by a level's devices (must all appear in `gateXs`). */
export function deviceGateXs(level: LevelBlueprint): number[] {
  const xs: number[] = [];
  level.devices.forEach(device => {
    if (device.kind === 'lift') return;
    if (device.kind === 'hold') xs.push(...device.gateXs);
    else if (device.kind === 'timed') xs.push(...device.gateXs);
    else xs.push(device.gateX);
  });
  return xs.sort((a, b) => a - b);
}

export function gateClearanceViolations(level: LevelBlueprint) {
  return level.platforms.flatMap(([x, _y, width]) => {
    const left = x - width / 2;
    const right = x + width / 2;
    return level.gateXs
      .filter(gateX => right > gateX - GATE_CLEARANCE && left < gateX + GATE_CLEARANCE)
      .map(gateX => ({ platformX: x, gateX }));
  });
}

/** Static sanity checks so broken level data fails in tests, not in a player's browser. */
export function levelIssues(level: LevelBlueprint): string[] {
  const issues: string[] = [];
  const inside = (x: number) => x >= 0 && x <= level.worldWidth;

  level.platforms.forEach(([x, y]) => {
    if (!inside(x) || y < 40 || y > 500) issues.push(`platform ${x},${y} out of bounds`);
  });
  level.shards.forEach(([x, y]) => {
    if (!inside(x) || y < 40 || y > 500) issues.push(`shard ${x},${y} out of bounds`);
  });
  level.enemies.forEach(e => {
    if (!inside(e.x)) issues.push(`enemy ${e.kind}@${e.x} out of bounds`);
  });
  level.checkpoints.forEach(x => {
    if (!inside(x)) issues.push(`checkpoint ${x} out of bounds`);
  });
  [...level.gateXs, level.goalX].forEach(x => {
    if (!inside(x)) issues.push(`gate/goal ${x} out of bounds`);
  });
  if (level.goalX >= level.worldWidth - 40) issues.push('goal too close to world edge');

  deviceGateXs(level).forEach(gateX => {
    if (!level.gateXs.includes(gateX)) issues.push(`device gate ${gateX} missing from gateXs`);
  });
  level.devices.forEach(device => {
    if (device.kind === 'relay' && device.plateXs.length < 2) issues.push('relay needs >= 2 plates');
    if (device.kind === 'sequence' && device.order.length !== device.plateXs.length) {
      issues.push('sequence order length must match plates');
    }
  });

  issues.push(...gateClearanceViolations(level).map(v => `platform ${v.platformX} too close to gate ${v.gateX}`));
  return issues;
}
