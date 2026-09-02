export type PlatformSpec = readonly [x: number, y: number, width: number];
export type PositionedSpec = readonly [x: number, y: number];

export const GATE_CLEARANCE = 120;

export const LEVEL_BLUEPRINT = {
  worldWidth: 7800,
  floorSegments: [
    [500, 1000], [1600, 1200], [2550, 600], [3850, 700],
    [4700, 1000], [5550, 600], [6250, 700], [7200, 1200],
  ] as const,
  platforms: [
    [520, 400, 160], [780, 335, 150], [1160, 400, 170], [1500, 335, 170], [1780, 400, 150],
    [2380, 400, 160], [2700, 335, 170], [3660, 400, 170], [3910, 335, 160],
    [5550, 400, 160], [6060, 400, 160], [6340, 335, 170],
    [7060, 400, 170], [7330, 335, 160], [7580, 400, 150],
  ] as const satisfies readonly PlatformSpec[],
  hazards: [[900, 4], [1860, 4], [4640, 3], [4930, 3], [5740, 4], [6460, 3], [7420, 4]] as const,
  enemies: [[850, 430], [1740, 430], [2420, 430], [3770, 430], [4450, 430], [5250, 430], [6150, 350], [7250, 430]] as const satisfies readonly PositionedSpec[],
  shards: [[300,420],[520,355],[780,290],[1160,355],[1500,290],[1780,355],[2330,355],[2700,290],[3140,350],[3660,355],[4070,410],[4380,355],[4690,420],[5200,410],[5550,355],[6060,355],[6340,290],[7330,290]] as const satisfies readonly PositionedSpec[],
  checkpoints: [2320, 4020, 5350, 6920] as const,
  gateXs: [2050, 4560, 4820, 5080, 6800] as const,
  goalX: 7650,
} as const;

export function gateClearanceViolations(
  platforms: readonly PlatformSpec[] = LEVEL_BLUEPRINT.platforms,
  gateXs: readonly number[] = LEVEL_BLUEPRINT.gateXs,
) {
  return platforms.flatMap(([x, _y, width]) => {
    const left = x - width / 2;
    const right = x + width / 2;
    return gateXs
      .filter(gateX => right > gateX - GATE_CLEARANCE && left < gateX + GATE_CLEARANCE)
      .map(gateX => ({ platformX: x, gateX }));
  });
}
