import type { LevelBlueprint } from './level';

/**
 * Four chapters of the Clockwork Run, all echoing the same Malaysian thread:
 * the arrival wards, the Batu caverns, the Cameron tea terraces, and the
 * Merdeka ascent to the towers.
 *
 * World geometry: design height 540, ground centre y=486 (top edge 468).
 * Platforms are centre-based; a single jump clears ~100px of height and
 * ~230px of flat gap, so keep deliberate gaps within those limits unless a
 * device (mover, lift, bouncer) is the intended way across.
 */
export const LEVELS: readonly LevelBlueprint[] = [
  // ──────────────────────────────────────────────────────────────
  // 1 · ARRIVAL GATE — the classic run, now with collapsing planks,
  // slam pillars, a bounce mushroom and four kinds of clockwork fauna.
  // ──────────────────────────────────────────────────────────────
  {
    id: 'arrival',
    name: 'Arrival Gate',
    subtitle: 'The wards still remember your footsteps',
    intro: 'Carry the core through the arrival wards. Your echo is the key.',
    parMs: 180_000,
    worldWidth: 7800,
    palette: { sky: 0x7ca99c, skyTop: 0xb9d6c5, skyBottom: 0x6fa294, tint: 0xffffff, platform: 0x344b44, stroke: 0x688078, moss: 0x77956c, abyss: 0x10201e },
    floorSegments: [
      [500, 1000], [1765, 870], [2550, 600], [3850, 700],
      [4700, 1000], [5550, 600], [6250, 700], [7200, 1200],
    ],
    platforms: [
      [520, 400, 160], [780, 335, 150], [1450, 400, 150], [1500, 335, 170], [1780, 400, 150],
      [2380, 400, 160], [2700, 335, 170], [3660, 400, 170], [3910, 335, 160],
      [5550, 400, 160], [6060, 400, 160], [6340, 335, 170],
      [7060, 400, 170], [7330, 335, 160], [7580, 400, 150],
    ],
    crumbles: [[1075, 445, 120], [1255, 445, 120]],
    bouncers: [[6200, 468]],
    crushers: [
      { x: 4380, hangY: 240, slamY: 450, period: 2600, phase: 0 },
      { x: 4480, hangY: 240, slamY: 450, period: 2600, phase: 1300 },
    ],
    pendulums: [{ x: 7040, pivotY: -40, length: 480, period: 2800, phase: 400, amplitude: 0.55 }],
    hazards: [[900, 4], [1860, 4], [4640, 3], [4930, 3], [5740, 4], [6540, 3], [7420, 4]],
    enemies: [
      { x: 850, y: 430, kind: 'crawler' },
      { x: 1750, y: 330, kind: 'flyer' },
      { x: 2420, y: 430, kind: 'crawler' },
      { x: 3800, y: 430, kind: 'spitter' },
      { x: 5300, y: 430, kind: 'charger', minX: 5280, maxX: 5490 },
      { x: 6150, y: 430, kind: 'crawler' },
      { x: 7150, y: 320, kind: 'flyer' },
    ],
    shards: [
      [300, 420], [520, 355], [780, 290], [1075, 395], [1255, 395], [1500, 290],
      [1780, 355], [2330, 355], [2700, 290], [3140, 350], [3660, 355], [4070, 410],
      [4430, 320], [4690, 420], [5200, 410], [5550, 355], [6060, 355], [6200, 285],
      [6340, 290], [7330, 290],
    ],
    checkpoints: [2320, 4020, 5350, 6800],
    devices: [
      { kind: 'hold', plateXs: [1400], gateXs: [2050] },
      { kind: 'lift', plateX: 2700, x: 3020, from: 3020, to: 3370, axis: 'x', speed: 140 },
      { kind: 'hold', plateXs: [4280], gateXs: [4560, 4820, 5080] },
      { kind: 'hold', plateXs: [5520, 6460], gateXs: [6800], requireAll: true, latch: true, closeDelayMs: 3000 },
    ],
    hints: [
      { atX: 210, text: 'F or the STAR button throws a shuriken. Kites, creepers, boars — one star each.' },
      { atX: 620, text: 'Press E to RECORD your run. Press E again to release the echo — a copy that repeats your path.' },
      { atX: 1160, text: 'The brass PLATE opens the gate while it is held down. Record an echo standing on it, then run on.' },
      { atX: 940, text: 'Collapsing planks — keep moving, they only hold a moment.' },
      { atX: 2620, text: 'The PLATE powers this lift. Stand on it — or leave an echo standing on it.' },
      { atX: 4160, text: 'Slam pillars CRUSH what is beneath them. Cross while the head is raised.' },
      { atX: 4300, text: 'Record an echo standing on the plate — it holds the shutters open while you sprint.' },
      { atX: 5460, text: 'The boar charges when it spots you — including your echo. Use that.' },
      { atX: 5600, text: 'DUAL-LOCK: both brass plates must be down at once. One echo, one you.' },
      { atX: 6120, text: 'Bounce mushroom! Land on it to launch sky-high.' },
      { atX: 6900, text: 'A spiked pendulum sweeps the floor. The high road is safer.' },
    ],
    goalX: 7650,
    gateXs: [2050, 4560, 4820, 5080, 6800],
  },

  // ──────────────────────────────────────────────────────────────
  // 2 · BATU CAVERNS — echo-only resonator switches, a decaying relay
  // chain, drift platforms over the dark, crushers and cave fauna.
  // ──────────────────────────────────────────────────────────────
  {
    id: 'caverns',
    name: 'Batu Caverns',
    subtitle: 'The mountain remembers in the dark',
    intro: 'The caverns hum with old echoes. Some crystals answer only to them.',
    parMs: 200_000,
    worldWidth: 7200,
    palette: { sky: 0x2c3f4a, skyTop: 0x141e2a, skyBottom: 0x2c3f4a, tint: 0x9db4c8, platform: 0x2f4148, stroke: 0x6f8a96, moss: 0x5f7d86, abyss: 0x050c10 },
    floorSegments: [
      [450, 900], [1510, 780], [2595, 910], [3855, 890],
      [4980, 840], [5980, 640], [6830, 740],
    ],
    platforms: [
      [600, 390, 140], [1250, 395, 140], [1700, 395, 150], [2020, 455, 110],
      [2300, 395, 150], [2890, 400, 110], [3040, 340, 130], [3700, 395, 150], [4000, 330, 140],
      [4700, 400, 150], [5400, 390, 150], [5510, 415, 110], [5750, 395, 150],
      [6600, 400, 150], [6790, 390, 110], [6950, 345, 150],
    ],
    movers: [
      { x: 955, y: 440, width: 150, dx: 110, speed: 60 },
      { x: 4360, y: 430, width: 130, dx: 140, speed: 80 },
    ],
    crumbles: [[3135, 445, 120], [3310, 445, 120]],
    bouncers: [[6480, 468]],
    crushers: [
      { x: 3600, hangY: 240, slamY: 450, period: 2800, phase: 0 },
      { x: 3820, hangY: 240, slamY: 450, period: 2800, phase: 1400 },
    ],
    hazards: [[700, 3], [1580, 4], [4750, 3], [6120, 3], [6560, 3]],
    enemies: [
      { x: 600, y: 430, kind: 'crawler' },
      { x: 1350, y: 300, kind: 'flyer' },
      { x: 2250, y: 290, kind: 'flyer' },
      { x: 2620, y: 430, kind: 'spitter' },
      { x: 4100, y: 430, kind: 'crawler' },
      { x: 4400, y: 300, kind: 'flyer' },
      { x: 4930, y: 430, kind: 'spitter' },
      { x: 6950, y: 430, kind: 'charger', minX: 6820, maxX: 7080 },
      { x: 6700, y: 310, kind: 'flyer' },
    ],
    shards: [
      [300, 420], [600, 345], [1250, 340], [1700, 350], [2020, 410], [2560, 330],
      [3040, 295], [3600, 330], [4000, 285], [4400, 360], [5510, 370], [5750, 350],
      [6180, 340], [6480, 270], [6480, 200], [6950, 285],
    ],
    checkpoints: [2200, 4600, 5700],
    devices: [
      { kind: 'echoSwitch', switchXs: [2560], gateX: 2700 },
      { kind: 'relay', plateXs: [4620, 4830, 5040], gateX: 5180, holdMs: 3500 },
      { kind: 'echoSwitch', switchXs: [5860, 6050], gateX: 6180 },
    ],
    hints: [
      { atX: 210, text: 'F or the STAR button clips kites out of the dark. Watch your cooldown.' },
      { atX: 2280, text: 'RESONATOR CRYSTAL: the living pass through untouched — only your ECHO wakes it. Record a path straight through the gem.' },
      { atX: 4420, text: 'RELAY CHAIN: touching a plate charges it, and the charge DRAINS. Light all three green at once to open the gate.' },
      { atX: 4980, text: 'The relay plates are close together. Charge them in a sprint, top up, then run for the gate.' },
      { atX: 3540, text: 'Slam pillars ahead — cross while the heads are raised.' },
      { atX: 5720, text: 'Two crystals, one recording: plan a route that crosses both, then release the echo.' },
    ],
    goalX: 7050,
    gateXs: [2700, 5180, 6180],
  },

  // ──────────────────────────────────────────────────────────────
  // 3 · TEA TERRACES — highland winds, a sequence-lock tea press,
  // a plate-powered terrace lift and charger boars on the slopes.
  // ──────────────────────────────────────────────────────────────
  {
    id: 'terraces',
    name: 'Tea Terraces',
    subtitle: 'Highland winds carry borrowed time',
    intro: 'The highlands are windy. Read the gusts, mind the lamps.',
    parMs: 220_000,
    worldWidth: 7400,
    palette: { sky: 0x9fc3a8, skyTop: 0xdcecc9, skyBottom: 0x93bd9e, tint: 0xdcead0, platform: 0x3d5a44, stroke: 0x7fae7f, moss: 0x86b06c, abyss: 0x0d1810 },
    floorSegments: [
      [400, 800], [1500, 1000], [2750, 980], [3860, 880], [6270, 860], [7130, 540],
    ],
    platforms: [
      [650, 390, 140], [1250, 395, 150], [1650, 400, 150], [2660, 345, 120],
      [2830, 410, 100], [3600, 390, 150], [3930, 395, 140], [4900, 300, 150],
      [5050, 400, 900], [6100, 390, 150], [6600, 390, 140], [7050, 400, 150],
    ],
    movers: [
      { x: 2045, y: 420, width: 150, dx: 170, speed: 80 },
      { x: 5545, y: 380, width: 160, dx: 230, speed: 90 },
    ],
    bouncers: [[5350, 386], [7200, 468]],
    windZones: [
      { x: 2020, width: 220, fx: 130 },
      { x: 3240, width: 180, fx: -110 },
      { x: 6250, width: 170, fx: -150 },
    ],
    hazards: [[1900, 3], [2560, 3], [4050, 3], [6900, 3]],
    enemies: [
      { x: 500, y: 430, kind: 'crawler' },
      { x: 1300, y: 430, kind: 'charger', minX: 1200, maxX: 1450 },
      { x: 2100, y: 320, kind: 'flyer' },
      { x: 3050, y: 430, kind: 'spitter' },
      { x: 3700, y: 430, kind: 'charger', minX: 3520, maxX: 3960 },
      { x: 4450, y: 300, kind: 'flyer' },
      { x: 5250, y: 360, kind: 'spitter' },
      { x: 6550, y: 430, kind: 'charger', minX: 6470, maxX: 6690 },
      { x: 6900, y: 310, kind: 'flyer' },
    ],
    shards: [
      [300, 420], [650, 345], [1250, 350], [1650, 355], [2100, 270], [2700, 295],
      [2950, 410], [3300, 360], [3930, 285], [4450, 270], [4900, 255], [5350, 170],
      [5700, 330], [6100, 345], [6340, 365], [7200, 220],
    ],
    checkpoints: [2320, 3480, 5900],
    devices: [
      { kind: 'sequence', plateXs: [2450, 2700, 2950], gateX: 3120, order: [2, 0, 1] },
      { kind: 'lift', plateX: 4150, x: 4420, from: 460, to: 300, axis: 'y', speed: 120 },
      { kind: 'timed', plateX: 6000, gateXs: [6400], openMs: 4500 },
    ],
    hints: [
      { atX: 210, text: 'Highlands ahead: wind shoves your jumps. Watch the drifting leaves.' },
      { atX: 2260, text: 'TEA-PRESS LOCK: step on the numbered plates in order — 1, then 2, then 3. A wrong plate resets them all.' },
      { atX: 2780, text: 'The plates show their number. The lamp above lights when that step is accepted.' },
      { atX: 4100, text: 'Press the plate to power the TERRACE LIFT — or leave your echo standing on it.' },
      { atX: 5300, text: 'Spring mushrooms launch you to the upper terraces.' },
      { atX: 5900, text: 'SHUTTER PLATE: press it and the gate opens for five seconds. Press, turn, SPRINT.' },
      { atX: 6350, text: 'Headwinds inside — jump from the very edge.' },
    ],
    goalX: 7200,
    gateXs: [3120, 6400],
  },

  // ──────────────────────────────────────────────────────────────
  // 4 · MERDEKA ASCENT — the finale: a warden arena, the dual-lock
  // vault, timed shutters and every trick in one dusk-lit climb.
  // ──────────────────────────────────────────────────────────────
  {
    id: 'ascent',
    name: 'Merdeka Ascent',
    subtitle: 'Where the towers touch the sky',
    intro: 'Every trick you know — the city demands it all at once.',
    parMs: 260_000,
    worldWidth: 8000,
    palette: { sky: 0x8a7a9c, skyTop: 0x3a2f52, skyBottom: 0x8a7a9c, tint: 0xd8c8ec, platform: 0x46405c, stroke: 0x9a8cc0, moss: 0x8a7ab0, abyss: 0x0c0916 },
    floorSegments: [
      [450, 900], [1580, 840], [2650, 900], [3750, 900],
      [4870, 860], [7025, 850], [7800, 400],
    ],
    platforms: [
      [700, 390, 140], [1400, 395, 140], [2540, 340, 120], [2790, 340, 120],
      [3500, 395, 150], [3850, 340, 130], [4700, 400, 150], [5950, 390, 900],
      [5750, 300, 140], [6150, 300, 140], [6650, 395, 150], [7350, 385, 140],
      [7750, 395, 150],
    ],
    movers: [
      { x: 965, y: 430, width: 150, dx: 130, speed: 75 },
      { x: 4255, y: 420, width: 160, dx: 130, speed: 85 },
    ],
    bouncers: [[6350, 376]],
    crushers: [
      { x: 2420, hangY: 240, slamY: 450, period: 2700, phase: 0 },
      { x: 2660, hangY: 240, slamY: 450, period: 2700, phase: 900 },
      { x: 2900, hangY: 240, slamY: 450, period: 2700, phase: 1800 },
    ],
    pendulums: [{ x: 7525, pivotY: -40, length: 480, period: 3000, phase: 800, amplitude: 0.32 }],
    hazards: [[1350, 3], [2260, 3], [7050, 3], [7700, 3]],
    enemies: [
      { x: 400, y: 430, kind: 'crawler' },
      { x: 1050, y: 320, kind: 'flyer' },
      { x: 3050, y: 430, kind: 'spitter' },
      { x: 3750, y: 430, kind: 'warden', minX: 3340, maxX: 4060 },
      { x: 4450, y: 300, kind: 'flyer' },
      { x: 4950, y: 330, kind: 'flyer' },
      { x: 5900, y: 300, kind: 'flyer' },
      { x: 6250, y: 350, kind: 'spitter' },
      { x: 6800, y: 430, kind: 'charger', minX: 6650, maxX: 6880 },
      { x: 7280, y: 430, kind: 'crawler' },
      { x: 7550, y: 300, kind: 'flyer' },
    ],
    shards: [
      [300, 420], [700, 345], [1050, 270], [1400, 350], [2540, 295], [2790, 295],
      [3050, 420], [3500, 350], [4550, 280], [5400, 250], [5750, 255], [6150, 255],
      [6650, 350], [6350, 150], [7350, 340], [7550, 290], [7850, 290],
    ],
    checkpoints: [1200, 3340, 4480, 6640],
    devices: [
      { kind: 'echoSwitch', switchXs: [1600], gateX: 1800 },
      { kind: 'guard', enemyIndex: 3, gateX: 4100 },
      { kind: 'hold', plateXs: [4550, 4900], gateXs: [5100], requireAll: true, latch: true, closeDelayMs: 3000 },
      { kind: 'lift', plateX: 5250, x: 5400, from: 460, to: 300, axis: 'y', speed: 130 },
      { kind: 'timed', plateX: 6700, gateXs: [6950, 7150], openMs: 5000 },
    ],
    hints: [
      { atX: 210, text: 'The final ward. Everything you have learned — all at once.' },
      { atX: 1400, text: 'RESONATOR: only your ECHO wakes the crystal. Record a path through it.' },
      { atX: 3450, text: 'WARDEN: armoured. Three shurikens — or stomp its head three times.' },
      { atX: 4640, text: 'DUAL-LOCK: both plates at once. One echo, one you.' },
      { atX: 5250, text: 'The plate powers the lift. An echo holds it while you ride.' },
      { atX: 6640, text: 'TIMED SHUTTERS: plate first, then sprint the gauntlet.' },
    ],
    goalX: 7850,
    gateXs: [1800, 4100, 5100, 6950, 7150],
  },
];

export const TOTAL_LEVELS = LEVELS.length;
