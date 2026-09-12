import Phaser from 'phaser';
import './style.css';
import { sampleEchoFrame, type EchoFrame } from './echo';
import { completionRank, formatRunTime, loadProgress, recordCompletion, saveProgress, type PlayerProgress } from './progress';
import {
  advanceSequence,
  cooldownReady,
  echoSwitchGateOpen,
  emptyRelayState,
  holdGateOpen,
  relayCharge,
  relayGateOpen,
  sequenceLampLabel,
  touchRelayPlate,
  type HoldMode,
} from './devices';
import { AudioDirector } from './audio';
import { LEVELS } from './levels';

const WIDTH = 960;
const HEIGHT = 540;
const GROUND_Y = 486;
const ECHO_DURATION_MS = 7000;
/**
 * Responsive zoom policy: render at 1:1 and never upscale, downscaling only
 * when the viewport is shorter than the design height. Zoom snaps down to these
 * steps so `pixelArt` stays even (no shimmer).
 */
const ZOOM_STEPS = [1, 0.8, 2 / 3, 0.5] as const;
const MIN_ZOOM = 0.5;
const audio = new AudioDirector();

type BarrierBody = { rect: Phaser.GameObjects.Rectangle; closedY: number; openY: number };
interface GateCore { bodies: BarrierBody[]; open: boolean }
interface HoldGate extends GateCore {
  plates: Phaser.GameObjects.Rectangle[];
  requireAll: boolean;
  latch: boolean;
  closeDelayMs?: number;
  closeTimer?: Phaser.Time.TimerEvent;
}
interface TimedGate extends GateCore { plate: Phaser.GameObjects.Rectangle; openMs: number; expiry: number }
interface RelayGate extends GateCore {
  plates: Phaser.GameObjects.Rectangle[];
  bars: Phaser.GameObjects.Rectangle[];
  holdMs: number;
  state: number[];
}
interface SequenceGate extends GateCore {
  plates: Phaser.GameObjects.Rectangle[];
  lamps: Phaser.GameObjects.Rectangle[];
  labels: Phaser.GameObjects.Text[];
  order: number[];
  progress: number;
  prev: boolean[];
  flashUntil: number;
}
interface EchoGate extends GateCore {
  pads: Phaser.GameObjects.Rectangle[];
  crystals: Phaser.GameObjects.Image[];
  states: boolean[];
  prev: boolean[];
}
interface GuardGate extends GateCore { enemyIndex: number }
interface LiftDevice {
  platform: Phaser.GameObjects.Rectangle;
  plate: Phaser.GameObjects.Rectangle;
  axis: 'x' | 'y';
  baseX: number;
  baseY: number;
  from: number;
  to: number;
  speed: number;
  dir: number;
  powered: boolean;
}
interface MoverDevice { platform: Phaser.GameObjects.Rectangle; x0: number; span: number; speed: number; dir: number }
interface CrumbleDevice { rect: Phaser.GameObjects.Rectangle; state: 'idle' | 'shake' | 'gone'; until: number; baseX: number }
interface CrusherDevice {
  head: Phaser.GameObjects.Rectangle;
  column: Phaser.GameObjects.Rectangle;
  teeth: Phaser.GameObjects.Rectangle;
  x: number; hangY: number; slamY: number; period: number; phase: number;
}
interface PendulumDevice {
  bob: Phaser.GameObjects.Image; chain: Phaser.GameObjects.Graphics;
  x: number; pivotY: number; length: number; period: number; phase: number; amplitude: number;
}
interface WindDevice { zone: Phaser.Geom.Rectangle; fx: number }
interface ParallaxLayer {
  texture: string;
  images: Phaser.GameObjects.Image[];
  /** World-space width of a single tile (before camera zoom). */
  width: number;
  /** World-space image scale (art height spans the 540px play band). */
  scale: number;
  rate: number;
  depth: number;
  alpha: number;
  tint: number;
  /** Alternate-flip tiles so edges meet even when the source isn't seamless. */
  mirror: boolean;
}

const ui = {
  start: document.querySelector<HTMLElement>('#start-screen')!,
  pause: document.querySelector<HTMLElement>('#pause-screen')!,
  result: document.querySelector<HTMLElement>('#result-screen')!,
  resultTitle: document.querySelector<HTMLElement>('#result-title')!,
  resultCopy: document.querySelector<HTMLElement>('#result-copy')!,
  resultEyebrow: document.querySelector<HTMLElement>('#result-eyebrow')!,
  message: document.querySelector<HTMLElement>('#message')!,
  shard: document.querySelector<HTMLElement>('#shard-count')!,
  timer: document.querySelector<HTMLElement>('#run-time')!,
  echo: document.querySelector<HTMLElement>('#echo-state')!,
  checkpoint: document.querySelector<HTMLElement>('#checkpoint-state')!,
  level: document.querySelector<HTMLElement>('#level-label')!,
  banner: document.querySelector<HTMLElement>('#level-banner')!,
  bannerName: document.querySelector<HTMLElement>('#level-banner-name')!,
  bannerSub: document.querySelector<HTMLElement>('#level-banner-sub')!,
  sound: document.querySelector<HTMLButtonElement>('#sound-toggle')!,
  chips: document.querySelector<HTMLElement>('#level-chips')!,
  begin: document.querySelector<HTMLButtonElement>('#start-button')!,
  next: document.querySelector<HTMLButtonElement>('#next-button')!,
};

/** Shared touch state; the scene reads it alongside the keyboard every frame. */
const touch = { left: false, right: false, jumpHeld: false };

/**
 * Debug convenience: in dev builds every chapter is selectable from the menu so
 * a level can be tested without replaying the run. Never applied in production.
 */
const withDevUnlocks = (progress: PlayerProgress): PlayerProgress =>
  import.meta.env.DEV ? { ...progress, unlocked: LEVELS.length - 1 } : progress;

class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private progress: PlayerProgress = withDevUnlocks(loadProgress(LEVELS.map(l => l.id)));
  private parallaxLayers: ParallaxLayer[] = [];
  /** World-space vertical margin above the 540px play band (band sits low). */
  private bandOffset = 0;
  private skyGfx!: Phaser.GameObjects.Graphics;
  private fadeGfx!: Phaser.GameObjects.Graphics;
  private resizeTimer?: number;
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private groundEnemies!: Phaser.Physics.Arcade.Group;
  private airEnemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private shards!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private holdGates: HoldGate[] = [];
  private timedGates: TimedGate[] = [];
  private relayGates: RelayGate[] = [];
  private sequenceGates: SequenceGate[] = [];
  private echoGates: EchoGate[] = [];
  private guardGates: GuardGate[] = [];
  private lifts: LiftDevice[] = [];
  private movers: MoverDevice[] = [];
  private crumbles: CrumbleDevice[] = [];
  private crushers: CrusherDevice[] = [];
  private pendulums: PendulumDevice[] = [];
  private winds: WindDevice[] = [];
  private hints: { atX: number; text: string }[] = [];

  private echo?: Phaser.GameObjects.Sprite;
  private echoFrames: EchoFrame[] = [];
  private recording = false;
  private recordStarted = 0;
  private playbackStarted = 0;
  private playingEcho = false;
  private echoGfx!: Phaser.GameObjects.Graphics;

  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkle!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shurikenGroup!: Phaser.Physics.Arcade.Group;
  private shurikens: Phaser.Physics.Arcade.Image[] = [];
  private lastThrowAt = Number.NEGATIVE_INFINITY;

  private totalShards = 0;
  private shardsFound = 0;
  private checkpointX = 140;
  private invulnerableUntil = 0;
  private gameStarted = false;
  private gameEnded = false;
  private paused = false;
  private hasEverStarted = false;
  private messageTimer?: Phaser.Time.TimerEvent;
  private runElapsedMs = 0;
  private lastTimerTick = -1;
  private lastGroundedAt = Number.NEGATIVE_INFINITY;
  private jumpQueuedAt = Number.NEGATIVE_INFINITY;
  private jumpActive = false;
  private wasGrounded = false;
  private lastStepAt = 0;

  constructor() { super('game'); }

  private get level() { return LEVELS[this.levelIndex]; }

  preload() {
    this.load.image('courier-source', 'assets/kite-sprite-source.png');
    this.load.image('malaysia-skyline', 'assets/malaysia-skyline.png');
    this.load.image('malaysia-midground', 'assets/malaysia-midground.png');
    this.load.image('malaysia-foreground', 'assets/malaysia-foreground.png');
    this.load.image('caverns-bg', 'assets/caverns-bg.png');
    this.load.image('caverns-far', 'assets/caverns-far.png');
    this.load.image('caverns-mid', 'assets/caverns-mid.png');
    this.load.image('caverns-near', 'assets/caverns-near.png');
    this.load.image('terraces-bg', 'assets/terraces-bg.png');
    this.load.image('terraces-far', 'assets/terraces-far.png');
    this.load.image('terraces-mid', 'assets/terraces-mid.png');
    this.load.image('terraces-near', 'assets/terraces-near.png');
    this.load.image('ascent-bg', 'assets/ascent-bg.png');
    this.load.image('ascent-far', 'assets/ascent-far.png');
    this.load.image('ascent-mid', 'assets/ascent-mid.png');
    this.load.image('ascent-near', 'assets/ascent-near.png');
  }

  create() {
    this.holdGates = [];
    this.timedGates = [];
    this.relayGates = [];
    this.sequenceGates = [];
    this.echoGates = [];
    this.guardGates = [];
    this.lifts = [];
    this.movers = [];
    this.crumbles = [];
    this.crushers = [];
    this.pendulums = [];
    this.winds = [];
    this.hints = [...(this.level.hints ?? [])];
    this.echo = undefined;
    this.echoFrames = [];
    this.recording = false;
    this.playingEcho = false;
    this.lastThrowAt = Number.NEGATIVE_INFINITY;
    this.shurikens = [];
    this.totalShards = this.level.shards.length;
    this.shardsFound = 0;
    this.checkpointX = 140;
    this.invulnerableUntil = 0;
    this.gameEnded = false;
    this.paused = false;
    this.lastHint = '';
    this.gameStarted = this.hasEverStarted;
    this.runElapsedMs = 0;
    this.lastTimerTick = -1;
    this.lastGroundedAt = Number.NEGATIVE_INFINITY;
    this.jumpQueuedAt = Number.NEGATIVE_INFINITY;
    this.jumpActive = false;
    this.wasGrounded = false;
    this.lastStepAt = 0;
    this.physics.world.isPaused = false;
    audio.setAmbience(
      this.level.id === 'caverns' ? 'cave' : this.level.id === 'terraces' ? 'highland' : this.level.id === 'ascent' ? 'dusk' : 'city',
    );
    this.physics.world.setBoundsCollision(true, true, true, false);
    this.physics.world.setBounds(0, 0, this.level.worldWidth, HEIGHT);
    ui.message.classList.remove('visible');
    ui.shard.textContent = `0 / ${this.totalShards}`;
    ui.timer.textContent = '00:00.0';
    ui.echo.textContent = 'READY';
    ui.checkpoint.textContent = 'OFFLINE';
    ui.level.textContent = `${this.levelIndex + 1} · ${this.level.name.toUpperCase()}`;
    touch.left = false;
    touch.right = false;
    touch.jumpHeld = false;
    this.makeTextures();
    this.buildCourierAtlas();
    this.createPlayer();
    this.drawWorld();
    this.buildLevel();
    this.createEnemies();
    this.createShards();
    this.createCheckpointAndGoal();
    this.createParticles();
    this.bindInput();
    this.bindPhysics();
    this.echoGfx = this.add.graphics().setDepth(9);
    this.cameras.main.startFollow(this.player, true, 0.085, 0.085, -120, 50);
    this.cameras.main.setDeadzone(210, 90);
    this.applyResponsiveLayout();
    this.scale.off('resize', this.onResize, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.onResize, this));
    this.showLevelBanner();
    if (!this.hasEverStarted) this.scene.pause();
  }

  private lastHint = '';

  // ─────────────────────────────────────────────────────────────
  // Textures
  // ─────────────────────────────────────────────────────────────

  private makeTextures() {
    if (this.textures.exists('crawler')) return;
    const g = this.add.graphics();

    // crawler — the classic patroller
    g.fillStyle(0x263632).fillRoundedRect(1, 4, 30, 22, 5);
    g.fillStyle(0xbc6655).fillRect(4, 0, 24, 8);
    g.fillStyle(0xe6d7b7).fillRect(7, 11, 5, 4).fillRect(20, 11, 5, 4);
    g.fillStyle(0x17211f).fillRect(6, 26, 7, 5).fillRect(20, 26, 7, 5);
    g.generateTexture('crawler', 32, 31).clear();

    // flyer — paper-kite drone
    g.fillStyle(0x7c9a90).fillTriangle(15, 8, 0, 2, 4, 12);
    g.fillStyle(0x7c9a90).fillTriangle(15, 8, 30, 2, 26, 12);
    g.fillStyle(0x44564f).fillEllipse(15, 12, 10, 14);
    g.fillStyle(0xe0a85a).fillCircle(15, 9, 2);
    g.fillStyle(0x2c3a36).fillTriangle(15, 19, 11, 23, 19, 23);
    g.generateTexture('flyer', 30, 24).clear();

    // spitter — pitcher-plant turret
    g.fillStyle(0x5d4433).fillRoundedRect(6, 12, 18, 20, 4);
    g.fillStyle(0x8a6a4a).fillEllipse(15, 12, 22, 10);
    g.fillStyle(0x9fd08a).fillEllipse(15, 11, 14, 5);
    g.fillStyle(0x2f241c).fillRect(13, 0, 4, 8);
    g.fillStyle(0xc9a06a).fillCircle(15, 2, 3);
    g.generateTexture('spitter', 30, 34).clear();

    // charger — boiler boar
    g.fillStyle(0x6a4a3c).fillRoundedRect(2, 6, 36, 16, 6);
    g.fillStyle(0x8a5f4a).fillRect(28, 8, 10, 10);
    g.fillStyle(0xe6d7b7).fillTriangle(34, 16, 39, 12, 36, 20);
    g.fillStyle(0xe0a85a).fillRect(30, 10, 4, 3);
    g.fillStyle(0x17211f).fillCircle(10, 24, 4).fillCircle(24, 24, 4);
    g.fillStyle(0x4a352b).fillRect(6, 4, 20, 4);
    g.generateTexture('charger', 40, 28).clear();

    // warden — armoured mini-boss
    g.fillStyle(0x3c4a46).fillRoundedRect(2, 6, 44, 24, 6);
    g.fillStyle(0x586a64).fillRect(6, 9, 12, 18).fillRect(20, 9, 12, 18).fillRect(34, 9, 8, 18);
    g.fillStyle(0xbc6655).fillTriangle(2, 8, -0, 0, 10, 6);
    g.fillStyle(0xe0a85a).fillRect(38, 12, 6, 4);
    g.fillStyle(0x17211f).fillRect(6, 30, 10, 5).fillRect(30, 30, 10, 5);
    g.lineStyle(2, 0x9fb4a8, .8).strokeRoundedRect(2, 6, 44, 24, 6);
    g.generateTexture('warden', 48, 36).clear();

    g.lineStyle(3, 0xe0a85a).strokeCircle(10, 10, 7);
    g.fillStyle(0xf1d7a9).fillCircle(10, 10, 3);
    g.generateTexture('shard', 20, 20).clear();

    g.fillStyle(0xd16151).fillTriangle(0, 18, 10, 0, 20, 18);
    g.generateTexture('spike', 20, 18).clear();

    // bouncer — spring mushroom
    g.fillStyle(0x8a6a4a).fillRect(24, 12, 8, 13);
    g.fillStyle(0xc7503e).fillRoundedRect(3, 1, 50, 15, 8);
    g.fillStyle(0xf1d7a9).fillCircle(16, 8, 3).fillCircle(36, 7, 2.5).fillCircle(27, 11, 2);
    g.generateTexture('bouncer', 56, 26).clear();

    // resonator — echo crystal
    g.fillStyle(0x7fd8c8).fillPoints([{ x: 13, y: 0 }, { x: 26, y: 20 }, { x: 13, y: 40 }, { x: 0, y: 20 }], true);
    g.fillStyle(0xd8fff4).fillPoints([{ x: 13, y: 8 }, { x: 19, y: 20 }, { x: 13, y: 32 }, { x: 7, y: 20 }], true);
    g.generateTexture('resonator', 26, 40).clear();

    // spitter projectile
    g.fillStyle(0x6f9a4a).fillCircle(5, 5, 5);
    g.fillStyle(0xb8e08a).fillCircle(5, 5, 2.5);
    g.generateTexture('orb', 10, 10).clear();

    // courier shuriken — four-point star
    g.fillStyle(0xc9d4cf).fillPoints([
      { x: 8, y: 0 }, { x: 10.5, y: 5.5 }, { x: 16, y: 8 }, { x: 10.5, y: 10.5 },
      { x: 8, y: 16 }, { x: 5.5, y: 10.5 }, { x: 0, y: 8 }, { x: 5.5, y: 5.5 },
    ], true);
    g.fillStyle(0xe0a85a).fillCircle(8, 8, 2.2);
    g.fillStyle(0x8b968f).fillCircle(8, 8, 1);
    g.generateTexture('shuriken', 16, 16).clear();

    // pendulum bob
    g.fillStyle(0x3a4a46).fillCircle(12, 12, 9);
    g.lineStyle(2, 0xb68247).strokeCircle(12, 12, 9);
    g.fillStyle(0xb68247).fillTriangle(12, 0, 8, 5, 16, 5).fillTriangle(12, 24, 8, 19, 16, 19);
    g.generateTexture('bob', 24, 24).clear();

    g.fillStyle(0xffffff).fillCircle(2, 2, 2);
    g.generateTexture('p-dot', 4, 4).destroy();
  }

  private buildCourierAtlas() {
    if (this.textures.exists('courier')) return;
    const cell = 160;
    const sourceCellWidth = 145;
    const sourceImage = this.textures.get('courier-source').getSourceImage() as HTMLImageElement;
    const texture = this.textures.createCanvas('courier', cell * 9, cell * 6)!;
    const groups = [
      { row: 0, sourceY: 0, sourceHeight: 145, xs: [0, 145, 290, 435, 580, 725, 870] },
      { row: 1, sourceY: 145, sourceHeight: 145, xs: [0, 145, 290, 435, 580, 725, 870, 1015, 1160] },
      { row: 2, sourceY: 290, sourceHeight: 130, xs: [0, 145, 290, 435] },
      { row: 3, sourceY: 775, sourceHeight: 140, xs: [0, 145, 290, 435, 580, 725, 870] },
      { row: 4, sourceY: 915, sourceHeight: 113, xs: [0, 145, 290, 435] },
      { row: 5, sourceY: 1030, sourceHeight: 160, xs: [0, 145, 290, 435, 580, 725, 870, 1015] },
    ];
    let frame = 0;
    groups.forEach(group => {
      group.xs.forEach((sourceX, column) => {
        const destinationX = column * cell;
        const destinationY = group.row * cell;
        const destinationTop = destinationY + cell - group.sourceHeight;
        texture.context.drawImage(
          sourceImage,
          sourceX,
          group.sourceY,
          sourceCellWidth,
          group.sourceHeight,
          destinationX + 7,
          destinationTop,
          sourceCellWidth,
          group.sourceHeight,
        );
        texture.add(frame, 0, destinationX, destinationY, cell, cell);
        frame += 1;
      });
    });
    texture.refresh();

    const animation = (key: string, start: number, end: number, frameRate: number, repeat = -1) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers('courier', { start, end }), frameRate, repeat });
    };
    animation('courier-idle', 0, 0, 1);
    animation('courier-run', 7, 15, 12);
    animation('courier-jump', 16, 19, 9, 0);
    animation('courier-record', 20, 26, 8);
    animation('courier-hurt', 27, 30, 10, 0);
    animation('courier-victory', 31, 38, 8);
  }

  // ─────────────────────────────────────────────────────────────
  // World
  // ─────────────────────────────────────────────────────────────

  private drawWorld() {
    const palette = this.level.palette;
    this.cameras.main.setBackgroundColor(`#${palette.sky.toString(16).padStart(6, '0')}`);

    // Full-background sky gradient (behind the parallax). Filled to the band top
    // at layout time so the space above the play area reads as sky, not a flat
    // palette color.
    this.skyGfx = this.add.graphics().setScrollFactor(0).setDepth(-60);
    // Edge fades sit above the parallax but below the platforms/player, so the
    // art dissolves into the sky/void at the band edges instead of a hard line.
    this.fadeGfx = this.add.graphics().setScrollFactor(0).setDepth(.9);

    this.parallaxLayers = [];
    const tint = palette.tint;

    // The original Malaysian parallax stack — skyline, architecture, foliage —
    // runs on every chapter. Arrival keeps it exactly as shipped. Tiles are
    // created lazily in layoutParallax() to match the live viewport width.
    const imageScale = HEIGHT / 724;
    const layerWidth = 2172 * imageScale;

    if (this.level.id === 'arrival') {
      // Arrival keeps the original Malaysian parallax stack, palette-tinted.
      this.parallaxLayers.push(
        { texture: 'malaysia-skyline', images: [], width: layerWidth, scale: imageScale, rate: .08, depth: -30, alpha: 1, tint, mirror: false },
        { texture: 'malaysia-midground', images: [], width: layerWidth, scale: imageScale, rate: .24, depth: -20, alpha: .88, tint, mirror: false },
        { texture: 'malaysia-foreground', images: [], width: layerWidth, scale: imageScale, rate: .46, depth: .5, alpha: .82, tint, mirror: false },
      );
    } else {
      // Each chapter owns a unique generated stack: an opaque background plus
      // three transparent parallax layers. Scaled so the art height fills the
      // 540px play band; full-colour, so no palette tint is applied.
      const addGenerated = (key: string, rate: number, depth: number) => {
        const source = this.textures.get(key).getSourceImage() as HTMLImageElement;
        const scale = HEIGHT / source.height;
        this.parallaxLayers.push({ texture: key, images: [], width: source.width * scale, scale, rate, depth, alpha: 1, tint: 0xffffff, mirror: true });
      };
      addGenerated(`${this.level.id}-bg`, .05, -35);
      addGenerated(`${this.level.id}-far`, .08, -30);
      addGenerated(`${this.level.id}-mid`, .24, -20);
      addGenerated(`${this.level.id}-near`, .46, .5);
    }

    // Minimal abyss: a WORLD-space gradient below the ground line. World space
    // means it scales and aligns with the camera at any zoom, and it is drawn
    // deep and wide enough to fill the margin around the centered play band.
    const abyss = this.add.graphics().setDepth(.75);
    const abyssX = -WIDTH;
    const abyssWidth = this.level.worldWidth + WIDTH * 2;
    // Scale RGB directly — Color.darken() is HSV-value based and wraps for very
    // dark colours (e.g. #050c10 -> #193d51), which wrongly brightened the void.
    const shade = (color: number, factor: number) => Phaser.Display.Color.GetColor(
      Math.round(((color >> 16) & 0xff) * factor),
      Math.round(((color >> 8) & 0xff) * factor),
      Math.round((color & 0xff) * factor),
    );
    const deep = shade(palette.abyss, .62);
    const deeper = shade(palette.abyss, .32);
    abyss.fillStyle(palette.abyss, .68).fillRect(abyssX, GROUND_Y + 6, abyssWidth, 30);
    abyss.fillStyle(palette.abyss, .88).fillRect(abyssX, GROUND_Y + 36, abyssWidth, 46);
    abyss.fillStyle(deep, .95).fillRect(abyssX, GROUND_Y + 82, abyssWidth, 150);
    abyss.fillStyle(deeper, .98).fillRect(abyssX, GROUND_Y + 232, abyssWidth, 2600);
    // Thin brass rim hugging the ground line, then nothing but depth.
    abyss.fillStyle(0xe0a85a, .22).fillRect(abyssX, GROUND_Y + 6, abyssWidth, 2);
    abyss.fillStyle(0x88b6a3, .1).fillRect(abyssX, GROUND_Y + 40, abyssWidth, 1);
  }

  /** Recomputes zoom, centers the 540px play band, and refits the parallax. */
  private applyResponsiveLayout() {
    const camera = this.cameras.main;
    const fitZoom = Phaser.Math.Clamp(this.scale.height / HEIGHT, MIN_ZOOM, 1);
    let zoom: number = MIN_ZOOM;
    for (const step of ZOOM_STEPS) {
      if (fitZoom >= step - 1e-4) { zoom = step; break; }
    }
    camera.setZoom(zoom);
    // Center the 540px band: spare vertical space splits equally into a sky band
    // above and an underground (abyss) band below.
    this.bandOffset = Math.max(0, (this.scale.height / zoom - HEIGHT) / 2);
    camera.setBounds(0, -this.bandOffset, this.level.worldWidth, HEIGHT);
    this.layoutParallax();
    this.positionParallax();
    this.redrawSky();
    this.redrawFade();
    if (import.meta.env.DEV) {
      console.debug('[echofall-layout]', {
        viewport: `${this.scale.width}x${this.scale.height}`,
        zoom, bandOffset: Math.round(this.bandOffset),
      });
    }
  }

  /** Creates/destroys parallax tiles so they always cover the viewport width. */
  private layoutParallax() {
    const camera = this.cameras.main;
    const viewportWidth = this.scale.width;
    this.parallaxLayers.forEach(layer => {
      const tileScreenWidth = Math.max(1, layer.width * camera.zoom);
      const needed = Math.max(2, Math.ceil(viewportWidth / tileScreenWidth) + 2);
      while (layer.images.length < needed) {
        const image = this.add.image(0, 0, layer.texture).setOrigin(0)
          .setScrollFactor(0).setScale(layer.scale).setDepth(layer.depth).setAlpha(layer.alpha);
        if (layer.tint !== 0xffffff) image.setTint(layer.tint);
        layer.images.push(image);
      }
      while (layer.images.length > needed) layer.images.pop()?.destroy();
    });
  }

  /**
   * Pins the scroll-factor-0 parallax tiles to the screen. The camera folds zoom
   * around its origin, so a scroll-factor-0 object at `o` renders at
   * `origin + (o - origin) * zoom`; we invert that mapping per tile.
   */
  private positionParallax() {
    const camera = this.cameras.main;
    const zoom = camera.zoom;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const bandTopScreen = this.bandOffset * zoom;
    this.parallaxLayers.forEach(layer => {
      const tileScreenWidth = layer.width * zoom;
      const wrapped = ((camera.scrollX * layer.rate) % layer.width + layer.width) % layer.width;
      const offsetScreen = -wrapped * zoom;
      for (let i = 0; i < layer.images.length; i += 1) {
        const screenX = offsetScreen + i * tileScreenWidth;
        const image = layer.images[i];
        image.x = originX + (screenX - originX) / zoom;
        image.y = originY + (bandTopScreen - originY) / zoom;
        if (layer.mirror) image.setFlipX(i % 2 === 1);
      }
    });
  }

  /** Paints the sky gradient across the spare space above the play band. */
  private redrawSky() {
    const camera = this.cameras.main;
    const zoom = camera.zoom;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const toLocalX = (screenX: number) => originX + (screenX - originX) / zoom;
    const toLocalY = (screenY: number) => originY + (screenY - originY) / zoom;
    const skyScreenHeight = this.bandOffset * zoom;
    const palette = this.level.palette;
    this.skyGfx.clear();
    if (skyScreenHeight <= 0) return;
    this.skyGfx.fillGradientStyle(palette.skyTop, palette.skyTop, palette.skyBottom, palette.skyBottom, 1);
    this.skyGfx.fillRect(toLocalX(0), toLocalY(0), this.scale.width / zoom, skyScreenHeight / zoom);
  }

  /**
   * Softens the top/bottom edges of the play band: the art fades up into the sky
   * colour and down into the abyss colour, so the band edges don't read as hard
   * letterbox lines.
   */
  private redrawFade() {
    const camera = this.cameras.main;
    const zoom = camera.zoom;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const toLocalX = (screenX: number) => originX + (screenX - originX) / zoom;
    const toLocalY = (screenY: number) => originY + (screenY - originY) / zoom;
    const g = this.fadeGfx;
    g.clear();
    const bandTopScreen = this.bandOffset * zoom;
    const bandBottomScreen = (this.bandOffset + HEIGHT) * zoom;
    const fadeScreen = Math.min(120, (bandBottomScreen - bandTopScreen) * 0.22);
    if (fadeScreen < 1 || bandTopScreen <= 0) return;
    const width = this.scale.width / zoom;
    const palette = this.level.palette;
    g.fillGradientStyle(palette.skyBottom, palette.skyBottom, palette.skyBottom, palette.skyBottom, 1, 1, 0, 0);
    g.fillRect(toLocalX(0), toLocalY(bandTopScreen), width, fadeScreen / zoom);
    g.fillGradientStyle(palette.abyss, palette.abyss, palette.abyss, palette.abyss, 0, 0, 1, 1);
    g.fillRect(toLocalX(0), toLocalY(bandBottomScreen - fadeScreen), width, fadeScreen / zoom);
  }

  private onResize() {
    if (this.resizeTimer !== undefined) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.applyResponsiveLayout(), 120);
  }

  private addPlatform(x: number, y: number, width: number, height = 28) {
    const palette = this.level.palette;
    const block = this.add.rectangle(x, y, width, height, palette.platform).setStrokeStyle(2, palette.stroke).setDepth(1);
    this.physics.add.existing(block, true);
    this.platforms.add(block);
    const moss = this.add.rectangle(x, y - height / 2 + 3, width - 4, 5, palette.moss).setDepth(2);
    moss.setAlpha(.85);
    return block;
  }

  private buildLevel() {
    const level = this.level;
    this.platforms = this.physics.add.staticGroup();
    level.floorSegments.forEach(([x, width]) => this.addPlatform(x, GROUND_Y, width, 36));
    level.platforms.forEach(([x, y, width]) => this.addPlatform(x, y, width));
    level.hazards.forEach(([x, count]) => this.addHazards(x, 475, count));
    (level.crumbles ?? []).forEach(([x, y, width]) => this.addCrumble(x, y, width));
    (level.movers ?? []).forEach(mover => this.addMover(mover.x, mover.y, mover.width, mover.dx, mover.speed ?? 80));
    (level.bouncers ?? []).forEach(([x, y]) => this.addBouncer(x, y));
    (level.windZones ?? []).forEach(wind => this.addWind(wind.x, wind.width, wind.fx));
    (level.crushers ?? []).forEach(crusher => this.addCrusher(crusher.x, crusher.hangY, crusher.slamY, crusher.period, crusher.phase ?? 0));
    (level.pendulums ?? []).forEach(p => this.addPendulum(p.x, p.pivotY, p.length, p.period, p.phase ?? 0, p.amplitude ?? .55));
    level.devices.forEach(device => {
      switch (device.kind) {
        case 'hold': this.addHoldGate(device.plateXs, device.gateXs, device.requireAll ?? false, device.latch ?? false, device.closeDelayMs); break;
        case 'timed': this.addTimedGate(device.plateX, device.gateXs, device.openMs); break;
        case 'relay': this.addRelayGate(device.plateXs, device.gateX, device.holdMs); break;
        case 'sequence': this.addSequenceGate(device.plateXs, device.gateX, device.order); break;
        case 'echoSwitch': this.addEchoGate(device.switchXs, device.gateX); break;
        case 'guard': this.addGuardGate(device.enemyIndex, device.gateX); break;
        case 'lift': this.addLift(device.plateX, device.x, device.from, device.to, device.axis, device.speed ?? 130); break;
      }
    });
  }

  private addHazards(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const spike = this.physics.add.staticImage(x + i * 19, y, 'spike').setOrigin(.5, 1).setDepth(3);
      spike.body.setSize(14, 12).setOffset(3, 6);
      spike.setData('hazard', true);
      this.platforms.add(spike);
    }
  }

  private addCrumble(x: number, y: number, width: number) {
    const rect = this.add.rectangle(x, y, width, 14, 0x5a4a3a).setStrokeStyle(2, 0x9a7a5a).setDepth(1);
    this.physics.add.existing(rect, true);
    this.platforms.add(rect);
    rect.setData('crumble', true);
    this.crumbles.push({ rect, state: 'idle', until: 0, baseX: x });
  }

  private addMover(x: number, y: number, width: number, dx: number, speed: number) {
    const platform = this.add.rectangle(x, y, width, 16, 0x4f8177).setStrokeStyle(2, 0xb9d8d0).setDepth(3);
    this.physics.add.existing(platform);
    const body = platform.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setImmovable(true);
    body.pushable = false;
    this.movers.push({ platform, x0: x, span: Math.max(1, dx), speed, dir: 1 });
  }

  private addBouncer(x: number, surfaceY: number) {
    // Build the body from the already-origin'd image so the overlap zone hugs the cap.
    const cap = this.add.image(x, surfaceY, 'bouncer').setOrigin(.5, 1).setDepth(3);
    this.physics.add.existing(cap, true);
    cap.setData('bouncer', true);
    this.physics.add.overlap(this.player, cap, () => {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (body.velocity.y > -260 && this.time.now > (cap.getData('bounceAt') ?? 0)) {
        cap.setData('bounceAt', this.time.now + 200);
        body.setVelocityY(-760);
        audio.play('bounce', this.spatial(x));
        this.dust.explode(8, x, surfaceY - 14);
        this.tweens.add({ targets: cap, scaleY: .6, scaleX: 1.25, duration: 90, yoyo: true, ease: 'Quad.Out' });
      }
    });
  }

  private addWind(x: number, width: number, fx: number) {
    this.winds.push({ zone: new Phaser.Geom.Rectangle(x, 120, width, HEIGHT - 120), fx });
    this.add.particles(0, 0, 'p-dot', {
      x: { min: x, max: x + width },
      y: { min: 150, max: 460 },
      lifespan: 1500,
      speedX: { min: fx * 1.4, max: fx * 2.2 },
      speedY: { min: 4, max: 16 },
      scale: { start: .9, end: .2 },
      alpha: { start: .55, end: .08 },
      quantity: 1,
      frequency: 240,
      tint: 0x9fd08a,
    }).setDepth(2);
  }

  private addCrusher(x: number, hangY: number, slamY: number, period: number, phase: number) {
    // The head is solid (you can ride it) but only the crush itself hurts.
    const head = this.add.rectangle(x, hangY, 64, 36, 0x4a3f38).setStrokeStyle(3, 0xb68247).setDepth(3);
    this.physics.add.existing(head, true);
    this.platforms.add(head);
    const column = this.add.rectangle(x, 0, 18, 10, 0x3a322c).setOrigin(.5, 0).setStrokeStyle(2, 0x6a5a4a, .6).setDepth(2);
    const teeth = this.add.rectangle(x, hangY + 14, 64, 8, 0xbc6655).setDepth(3);
    this.crushers.push({ head, column, teeth, x, hangY, slamY, period, phase });
    this.physics.add.overlap(this.player, head, () => this.hurtPlayer());
  }

  private addPendulum(x: number, pivotY: number, length: number, period: number, phase: number, amplitude: number) {
    const bob = this.physics.add.staticImage(x, pivotY + length, 'bob').setDepth(4);
    bob.setData('hazard', true);
    const chain = this.add.graphics().setDepth(3);
    this.pendulums.push({ bob, chain, x, pivotY, length, period, phase, amplitude });
    this.physics.add.overlap(this.player, bob, () => this.hurtPlayer());
  }

  // ─────────────────────────────────────────────────────────────
  // Devices
  // ─────────────────────────────────────────────────────────────

  private addPlate(x: number, tint = 0xb68247) {
    return this.add.rectangle(x, 465, 68, 10, tint).setStrokeStyle(2, 0xe4c288).setDepth(3);
  }

  private addBarrierBody(x: number, stroke = 0xb68247) {
    const height = 388;
    const closedY = 274;
    const body = this.add.rectangle(x, closedY, 30, height, 0x263b36).setStrokeStyle(3, stroke).setDepth(4);
    this.physics.add.existing(body, true);
    this.platforms.add(body);
    this.add.rectangle(x, 74, 100, 18, 0x314840).setStrokeStyle(2, stroke).setDepth(4);
    return { rect: body, closedY, openY: -height / 2 - 10 };
  }

  private drawCable(plateX: number, targetX: number, targetY = 469) {
    this.add.graphics().lineStyle(2, 0xb68247, .65).lineBetween(plateX, 469, targetX, targetY).setDepth(2);
  }

  private addHoldGate(plateXs: number[], gateXs: number[], requireAll: boolean, latch: boolean, closeDelayMs?: number) {
    const plates = plateXs.map(x => this.addPlate(x));
    gateXs.forEach(gateX => plateXs.forEach(plateX => this.drawCable(plateX, gateX)));
    this.holdGates.push({ bodies: gateXs.map(x => this.addBarrierBody(x)), open: false, plates, requireAll, latch, closeDelayMs });
  }

  private addTimedGate(plateX: number, gateXs: number[], openMs: number) {
    const plate = this.addPlate(plateX, 0x8a6a4a);
    gateXs.forEach(gateX => this.drawCable(plateX, gateX));
    this.timedGates.push({ bodies: gateXs.map(x => this.addBarrierBody(x)), open: false, plate, openMs, expiry: 0 });
  }

  private addRelayGate(plateXs: number[], gateX: number, holdMs: number) {
    const plates = plateXs.map(x => this.addPlate(x, 0x6a7a5a));
    const bars = plates.map(plate => this.add.rectangle(plate.x, 448, 60, 5, 0x9fd08a).setDepth(3));
    plateXs.forEach(x => this.drawCable(x, gateX));
    this.relayGates.push({
      bodies: [this.addBarrierBody(gateX)], open: false,
      plates, bars, holdMs, state: emptyRelayState(plates.length) as number[],
    });
  }

  private addSequenceGate(plateXs: number[], gateX: number, order: number[]) {
    const plates = plateXs.map(x => this.addPlate(x, 0x7a5a8a));
    const lamps: Phaser.GameObjects.Rectangle[] = [];
    const labels: Phaser.GameObjects.Text[] = [];
    plateXs.forEach((x, index) => {
      const lamp = this.add.circle(x, 419, 12, 0x22312c).setStrokeStyle(2, 0xb68247).setDepth(4);
      const label = this.add.text(x, 419, String(sequenceLampLabel(order, index)), {
        fontFamily: '"DM Mono", monospace', fontSize: '14px', color: '#f1d7a9', fontStyle: 'bold',
      }).setOrigin(.5).setDepth(5);
      lamps.push(lamp as unknown as Phaser.GameObjects.Rectangle);
      labels.push(label);
      this.drawCable(x, gateX);
    });
    // A readable legend right at the first plate.
    this.add.text(plateXs[0] - 10, 372, 'STEP IN ORDER', {
      fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#e0a85a', letterSpacing: 2,
    }).setOrigin(.5).setDepth(4).setAlpha(.9);
    this.sequenceGates.push({
      bodies: [this.addBarrierBody(gateX)], open: false,
      plates, lamps, labels, order, progress: 0, prev: plates.map(() => false), flashUntil: 0,
    });
  }

  private addEchoGate(switchXs: number[], gateX: number) {
    const pads: Phaser.GameObjects.Rectangle[] = [];
    const crystals: Phaser.GameObjects.Image[] = [];
    switchXs.forEach(x => {
      const pad = this.add.rectangle(x, 462, 72, 14, 0x1f3a36).setStrokeStyle(2, 0x7fd8c8, .9).setDepth(3);
      const crystal = this.add.image(x, 462, 'resonator').setOrigin(.5, 1).setDepth(4).setAlpha(.85).setTint(0x9fbdb4);
      pads.push(pad);
      crystals.push(crystal);
      this.drawCable(x, gateX);
      this.tweens.add({ targets: crystal, y: 452, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    });
    this.echoGates.push({ bodies: [this.addBarrierBody(gateX, 0x7fd8c8)], open: false, pads, crystals, states: switchXs.map(() => false), prev: switchXs.map(() => false) });
  }

  private addGuardGate(enemyIndex: number, gateX: number) {
    this.drawCable(gateX - 160, gateX);
    this.guardGates.push({ bodies: [this.addBarrierBody(gateX, 0xd16151)], open: false, enemyIndex });
  }

  private addLift(plateX: number, x: number, from: number, to: number, axis: 'x' | 'y', speed: number) {
    const plate = this.addPlate(plateX);
    const baseX = axis === 'x' ? from : x;
    const baseY = axis === 'y' ? from : 405;
    this.drawCable(plateX, baseX, baseY + 64);
    const platform = this.add.rectangle(baseX, baseY, 130, 18, 0x4f8177).setStrokeStyle(2, 0xb9d8d0).setDepth(3);
    this.physics.add.existing(platform);
    const body = platform.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setImmovable(true);
    body.pushable = false;
    this.lifts.push({ platform, plate, axis, baseX, baseY, from, to, speed, dir: 1, powered: false });
  }

  private setGateOpen(gate: GateCore, opening: boolean, silent = false) {
    if (gate.open === opening) return;
    gate.open = opening;
    if (!silent) audio.play(opening ? 'plate' : 'gate', this.spatial(gate.bodies[0]?.rect.x ?? this.player.x));
    gate.bodies.forEach(barrier => {
      const body = barrier.rect.body as Phaser.Physics.Arcade.StaticBody;
      body.enable = false;
      this.tweens.killTweensOf(barrier.rect);
      this.tweens.add({
        targets: barrier.rect,
        y: opening ? barrier.openY : barrier.closedY,
        alpha: opening ? .2 : 1,
        duration: opening ? 320 : 220,
        ease: opening ? 'Cubic.Out' : 'Cubic.In',
        onComplete: () => {
          body.updateFromGameObject();
          body.enable = !opening;
        },
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Actors
  // ─────────────────────────────────────────────────────────────

  private createPlayer() {
    this.player = this.physics.add.sprite(140, 430, 'courier').setDepth(8);
    this.player.setOrigin(.5, .90625).setScale(.42).setCollideWorldBounds(true).setBounce(0).setDragX(1100).setMaxVelocity(300, 700);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(52, 90).setOffset(54, 55);
    this.player.play('courier-idle');
  }

  private createEnemies() {
    this.groundEnemies = this.physics.add.group({ allowGravity: true });
    this.airEnemies = this.physics.add.group({ allowGravity: false });
    this.level.enemies.forEach((spec, index) => {
      const flying = spec.kind === 'flyer';
      const enemy = (flying ? this.airEnemies : this.groundEnemies).create(spec.x, spec.y, spec.kind) as Phaser.Physics.Arcade.Sprite;
      enemy.setData('kind', spec.kind).setData('alive', true).setData('index', index).setData('anchorX', spec.x).setData('anchorY', spec.y).setData('phase', index * 1.7);
      enemy.setDepth(7);
      if (spec.minX !== undefined) enemy.setData('minX', spec.minX);
      if (spec.maxX !== undefined) enemy.setData('maxX', spec.maxX);
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      switch (spec.kind) {
        case 'crawler':
          enemy.setVelocityX(index % 2 ? 70 : -70).setBounce(1, 0).setCollideWorldBounds(true);
          body.setSize(28, 27).setOffset(2, 4);
          break;
        case 'flyer':
          body.setImmovable(true).setSize(26, 20).setOffset(2, 2);
          break;
        case 'spitter':
          body.setSize(24, 30).setOffset(3, 3);
          body.pushable = false;
          enemy.setData('nextShot', 1200);
          break;
        case 'charger':
          enemy.setBounce(0, 0).setCollideWorldBounds(true).setData('state', 'patrol').setData('dir', -1);
          body.setSize(34, 22).setOffset(3, 5);
          break;
        case 'warden':
          enemy.setCollideWorldBounds(true).setData('hp', 3).setData('state', 'patrol').setData('dir', -1);
          body.setSize(42, 30).setOffset(3, 5);
          body.pushable = false;
          break;
      }
    });
    this.projectiles = this.physics.add.group({ allowGravity: false });
    this.shurikenGroup = this.physics.add.group({ allowGravity: false, maxSize: 16 });
  }

  private createShards() {
    this.shards = this.physics.add.staticGroup();
    this.level.shards.forEach(([x, y], i) => {
      const shard = this.shards.create(x, y, 'shard') as Phaser.Physics.Arcade.Sprite;
      shard.setData('baseY', y).setData('phase', i * .55).setDepth(5);
    });
  }

  private createCheckpointAndGoal() {
    this.level.checkpoints.forEach(x => {
      const relay = this.add.rectangle(x, 424, 18, 88, 0x516a62).setStrokeStyle(2, 0xd4a258).setDepth(3);
      relay.setData('checkpoint', true);
      this.physics.add.existing(relay, true);
      this.physics.add.overlap(this.player, relay, () => this.activateCheckpoint(relay, x - 30));
    });
    const goal = this.add.rectangle(this.level.goalX, 370, 70, 196, 0x243b35).setStrokeStyle(4, 0xe0a85a).setDepth(3);
    this.add.circle(this.level.goalX, 340, 21, 0xe0a85a, .85).setDepth(4);
    goal.setData('goal', true);
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.player, goal, () => this.win());
  }

  private createParticles() {
    this.dust = this.add.particles(0, 0, 'p-dot', {
      emitting: false, speed: { min: 30, max: 110 }, angle: { min: 200, max: 340 },
      gravityY: 320, lifespan: 480, scale: { start: 1.1, end: 0 }, tint: 0xcfe3d8,
    }).setDepth(6);
    this.sparkle = this.add.particles(0, 0, 'p-dot', {
      emitting: false, speed: { min: 40, max: 140 }, angle: { min: 0, max: 360 },
      gravityY: -60, lifespan: 560, scale: { start: 1.2, end: 0 }, tint: 0xf1d7a9,
    }).setDepth(9);
  }

  // ─────────────────────────────────────────────────────────────
  // Input
  // ─────────────────────────────────────────────────────────────

  private bindInput() {
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys('W,A,D,E,F,R,X,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    keyboard.on('keydown-E', () => this.toggleRecording());
    keyboard.on('keydown-F', () => this.throwShuriken());
    keyboard.on('keydown-X', () => this.throwShuriken());
    keyboard.on('keydown-R', () => this.restartRun());
    keyboard.on('keydown-ESC', () => this.togglePause());
  }

  /** Touch handlers call these directly; they are safe to fire between frames. */
  queueJump() {
    if (!this.gameStarted || this.gameEnded || this.paused) return;
    this.jumpQueuedAt = this.time.now;
  }

  setTouchDirection(dir: 'left' | 'right' | 'none') {
    touch.left = dir === 'left';
    touch.right = dir === 'right';
  }

  setTouchJumpHeld(held: boolean) {
    touch.jumpHeld = held;
  }

  /** Also wired to the STAR touch button and the F/X keys. */
  throwShuriken() {
    if (!this.gameStarted || this.gameEnded || this.paused) return;
    const now = this.time.now;
    if (!cooldownReady(this.lastThrowAt, now, 520)) return;
    if (this.shurikens.length >= 3) return;
    const facing = this.player.flipX ? -1 : 1;
    const star = this.shurikenGroup.create(this.player.x + facing * 26, this.player.y - 42, 'shuriken') as Phaser.Physics.Arcade.Image | null;
    if (!star) return;
    this.lastThrowAt = now;
    star.setVelocity(facing * 540, 0).setDepth(7).setData('bornAt', now);
    (star.body as Phaser.Physics.Arcade.Body).setSize(12, 12);
    this.shurikens.push(star);
    audio.play('throw');
    this.tweens.add({ targets: this.player, scaleX: .38, duration: 60, yoyo: true });
  }

  /** The ONLY way a shuriken leaves the world — destroy + forget, never disable. */
  private destroyShuriken(star: Phaser.Physics.Arcade.Image) {
    const index = this.shurikens.indexOf(star);
    if (index >= 0) this.shurikens.splice(index, 1);
    if (star.active) star.destroy();
  }

  private updateShurikens(time: number) {
    for (let i = this.shurikens.length - 1; i >= 0; i -= 1) {
      const star = this.shurikens[i];
      if (!star.active || !star.body) { this.shurikens.splice(i, 1); continue; }
      star.rotation += .5;
      if (time - (star.getData('bornAt') as number) > 1400 || Math.abs(star.x - this.player.x) > 640) {
        this.destroyShuriken(star);
      }
    }
  }

  private onShurikenHitEnemy(star: Phaser.Physics.Arcade.Image, enemyObject: Phaser.Physics.Arcade.Sprite) {
    const enemy = enemyObject;
    if (!star.active) return;
    if (!enemy.getData('alive')) return;
    const hitX = star.x;
    const hitY = star.y;
    const at = this.spatial(hitX);
    this.destroyShuriken(star);
    this.sparkle.explode(6, hitX, hitY);
    if (enemy.getData('kind') === 'warden') {
      this.hitWarden(enemy, hitX); // the warden's armour rings out inside hitWarden
    } else {
      audio.play('hit', at);
      this.killEnemy(enemy);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Physics wiring
  // ─────────────────────────────────────────────────────────────

  private bindPhysics() {
    this.physics.add.collider(this.player, this.platforms, (_player, object) => {
      const block = object as Phaser.GameObjects.GameObject;
      if (block.getData('hazard')) this.hurtPlayer();
      if (block.getData('crumble')) this.touchCrumble(block as Phaser.GameObjects.Rectangle);
    });
    this.physics.add.collider(this.groundEnemies, this.platforms);
    this.lifts.forEach(lift => this.physics.add.collider(this.player, lift.platform));
    this.movers.forEach(mover => this.physics.add.collider(this.player, mover.platform));
    this.physics.add.collider(this.player, this.groundEnemies, (playerObject, enemyObject) => this.onPlayerEnemy(playerObject as Phaser.Physics.Arcade.Sprite, enemyObject as Phaser.Physics.Arcade.Sprite));
    this.physics.add.collider(this.player, this.airEnemies, (playerObject, enemyObject) => this.onPlayerEnemy(playerObject as Phaser.Physics.Arcade.Sprite, enemyObject as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.shards, (_p, shardObject) => {
      const shard = shardObject as Phaser.Physics.Arcade.Sprite;
      shard.disableBody(true, true);
      this.shardsFound += 1;
      audio.play('shard');
      this.sparkle.explode(6, shard.x, shard.y);
      ui.shard.textContent = `${this.shardsFound} / ${this.totalShards}`;
      this.tweens.add({ targets: ui.shard, scale: 1.16, duration: 90, yoyo: true });
    });
    this.physics.add.collider(this.projectiles, this.platforms, (orb) => this.popProjectile(orb as Phaser.Physics.Arcade.Image));
    // Sprite-vs-group callbacks always receive the sprite (player) first, then
    // the group member (orb) — even though the group is registered first here.
    this.physics.add.overlap(this.projectiles, this.player, (_player, orb) => {
      this.popProjectile(orb as Phaser.Physics.Arcade.Image);
      this.hurtPlayer();
    });
    this.physics.add.collider(this.shurikenGroup, this.platforms, (star) => {
      const shuriken = star as Phaser.Physics.Arcade.Image;
      if (!shuriken.active) return;
      audio.play('clang', this.spatial(shuriken.x));
      this.dust.explode(3, shuriken.x, shuriken.y);
      this.destroyShuriken(shuriken);
    });
    this.physics.add.overlap(this.shurikenGroup, this.groundEnemies, (star, enemy) => this.onShurikenHitEnemy(star as Phaser.Physics.Arcade.Image, enemy as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.shurikenGroup, this.airEnemies, (star, enemy) => this.onShurikenHitEnemy(star as Phaser.Physics.Arcade.Image, enemy as Phaser.Physics.Arcade.Sprite));
  }

  private onPlayerEnemy(playerObject: Phaser.Physics.Arcade.Sprite, enemyObject: Phaser.Physics.Arcade.Sprite) {
    const player = this.player;
    const enemy = enemyObject;
    if (!enemy.active || !enemy.getData('alive') || this.gameEnded) return;
    const playerBody = player.body as Phaser.Physics.Arcade.Body;
    const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;
    const stompedFromAbove = playerBody.deltaY() > 0 && playerBody.bottom <= enemyBody.center.y + 10;
    if (stompedFromAbove) {
      player.setVelocityY(-330);
      audio.play('stomp', this.spatial(enemy.x));
      this.cameras.main.shake(70, .0018);
      this.dust.explode(7, enemy.x, enemy.y + 8);
      if (enemy.getData('kind') === 'warden') this.hitWarden(enemy, playerBody.center.x);
      else this.killEnemy(enemy);
    } else this.hurtPlayer();
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    enemy.setData('alive', false);
    enemy.disableBody(true, true);
    audio.play('pop', this.spatial(enemy.x));
    this.sparkle.explode(8, enemy.x, enemy.y);
  }

  private hitWarden(enemy: Phaser.Physics.Arcade.Sprite, playerX: number) {
    const hp = (enemy.getData('hp') as number) - 1;
    enemy.setData('hp', hp);
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(130, () => { if (enemy.active) enemy.clearTint(); });
    if (hp <= 0) {
      this.killEnemy(enemy);
      audio.play('unlock');
      this.cameras.main.shake(220, .008);
      this.sparkle.explode(16, enemy.x, enemy.y);
      this.openGuardGates();
      this.showMessage('The warden falls. The gate yields.', 2600);
    } else {
      audio.play('clang', this.spatial(enemy.x));
      enemy.setData('staggerUntil', this.time.now + 450);
      const knock = enemy.x < playerX ? -170 : 170;
      (enemy.body as Phaser.Physics.Arcade.Body).setVelocityX(knock);
      const dx = Math.abs(this.player.x - enemy.x);
      if (dx < 430) this.cameras.main.shake(110, .0035 * (1 - dx / 430));
    }
  }

  private openGuardGates() {
    this.guardGates.forEach(gate => this.setGateOpen(gate, true, true));
  }

  private popProjectile(orb: Phaser.Physics.Arcade.Image) {
    if (!orb.active) return;
    this.dust.explode(4, orb.x, orb.y);
    orb.destroy();
  }

  private touchCrumble(rect: Phaser.GameObjects.Rectangle) {
    const crumble = this.crumbles.find(c => c.rect === rect);
    if (!crumble || crumble.state !== 'idle') return;
    crumble.state = 'shake';
    crumble.until = this.time.now + 460;
    audio.play('crumble', this.spatial(crumble.baseX));
  }

  // ─────────────────────────────────────────────────────────────
  // Frame update
  // ─────────────────────────────────────────────────────────────

  update(time: number, delta: number) {
    this.positionParallax();
    if (!this.gameStarted || this.gameEnded || this.paused) return;
    this.runElapsedMs += delta;
    const timerTick = Math.floor(this.runElapsedMs / 100);
    if (timerTick !== this.lastTimerTick) {
      this.lastTimerTick = timerTick;
      ui.timer.textContent = formatRunTime(this.runElapsedMs);
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = this.cursors.left.isDown || this.keys.A.isDown || touch.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || touch.right;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.keys.W) || Phaser.Input.Keyboard.JustDown(this.cursors.up);
    if (jumpPressed) this.queueJump();
    const jumpHeld = this.cursors.space.isDown || this.keys.W.isDown || this.cursors.up.isDown || touch.jumpHeld;

    const grounded = body.blocked.down || body.touching.down;
    if (grounded) {
      this.lastGroundedAt = time;
      this.jumpActive = false;
    }

    let windAccel = 0;
    for (const wind of this.winds) {
      const zone = wind.zone;
      if (body.right > zone.x && body.left < zone.right && body.bottom > zone.y && body.top < zone.bottom) {
        windAccel += wind.fx;
      }
    }

    if (left) { this.player.setAccelerationX(-950 + windAccel); this.player.setFlipX(true); }
    else if (right) { this.player.setAccelerationX(950 + windAccel); this.player.setFlipX(false); }
    else this.player.setAccelerationX(windAccel);

    if (time - this.jumpQueuedAt <= 120 && time - this.lastGroundedAt <= 110) {
      this.player.setVelocityY(-465);
      audio.play('jump');
      this.jumpQueuedAt = Number.NEGATIVE_INFINITY;
      this.lastGroundedAt = Number.NEGATIVE_INFINITY;
      this.jumpActive = true;
    }
    if (this.jumpActive && !jumpHeld && body.velocity.y < -190) {
      this.player.setVelocityY(body.velocity.y * .58);
      this.jumpActive = false;
    }
    if (grounded && !this.wasGrounded) {
      audio.play('land');
      this.dust.explode(5, this.player.x, this.player.y);
    }
    if (grounded && (left || right) && Math.abs(body.velocity.x) > 45 && time - this.lastStepAt > 250) {
      this.lastStepAt = time;
      audio.play('step');
    }
    this.wasGrounded = grounded;
    this.updatePlayerAnimation(grounded, left || right);
    if (this.player.y > HEIGHT + 80) this.hurtPlayer();

    if (this.recording) {
      const elapsed = time - this.recordStarted;
      this.echoFrames.push({ t: elapsed, x: this.player.x, y: this.player.y, flipX: this.player.flipX });
      ui.echo.textContent = `REC ${(Math.max(0, ECHO_DURATION_MS / 1000 - elapsed / 1000)).toFixed(1)}s`;
      if (elapsed >= ECHO_DURATION_MS) this.finishRecording();
    }
    this.drawRecordingRing(time);
    this.updateEcho(time);
    this.updateDevices(time);
    this.updateMovers(delta);
    this.updateCrushers(time);
    this.updatePendulums(time);
    this.updateEnemies(time);
    this.updateProjectiles(time);
    this.updateShurikens(time);
    this.updateCrumbles(time);
    this.updateShards(time);
    this.updateHints();

    // Wind bed follows how deep the player is inside a gust zone.
    let windStrength = 0;
    for (const wind of this.winds) {
      const inside = body.right > wind.zone.x && body.left < wind.zone.right;
      const nearEdge = Math.min(Math.abs(body.right - wind.zone.x), Math.abs(body.left - wind.zone.right));
      const strength = inside ? 1 : Math.max(0, 1 - nearEdge / 240) * .5;
      windStrength = Math.max(windStrength, strength);
    }
    audio.wind(windStrength);
  }

  private updatePlayerAnimation(grounded: boolean, moving: boolean) {
    if (this.recording) { this.player.play('courier-record', true); return; }
    if (!grounded) { this.player.play('courier-jump', true); return; }
    this.player.play(moving ? 'courier-run' : 'courier-idle', true);
  }

  private drawRecordingRing(time: number) {
    this.echoGfx.clear();
    if (!this.recording) return;
    const elapsed = time - this.recordStarted;
    const progress = Math.min(1, elapsed / ECHO_DURATION_MS);
    const cx = this.player.x;
    const cy = this.player.y - 74;
    this.echoGfx.lineStyle(3, 0x2c3f3a, .8).strokeCircle(cx, cy, 13);
    this.echoGfx.lineStyle(3, 0xe0a85a, .95);
    this.echoGfx.beginPath();
    this.echoGfx.arc(cx, cy, 13, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * progress));
    this.echoGfx.strokePath();
  }

  private updateHints() {
    if (this.hints.length === 0) return;
    // Fire when the player walks NEAR the feature — before they reach it.
    const index = this.hints.findIndex(hint => Math.abs(this.player.x - hint.atX) <= 240);
    if (index >= 0) {
      const [hint] = this.hints.splice(index, 1);
      this.showMessage(hint.text, 4600);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Echo
  // ─────────────────────────────────────────────────────────────

  /** Also wired to the on-screen ECHO button. */
  toggleRecording() {
    if (!this.gameStarted || this.gameEnded || this.paused) return;
    if (this.recording) { this.finishRecording(); return; }
    this.playingEcho = false;
    if (this.echo) {
      this.tweens.killTweensOf(this.echo);
      this.echo.destroy();
      this.echo = undefined;
    }
    this.echoFrames = [];
    this.recording = true;
    this.recordStarted = this.time.now;
    audio.play('record');
    this.player.setTint(0xe8bd7c);
    ui.echo.textContent = 'RECORDING';
    this.showMessage('Recording timeline. Release to send the echo.', 1800);
  }

  private finishRecording() {
    if (!this.recording || this.echoFrames.length < 2) return;
    this.recording = false;
    this.player.clearTint();
    this.playingEcho = true;
    this.playbackStarted = this.time.now;
    const first = this.echoFrames[0];
    this.echo = this.add.sprite(first.x, first.y, 'courier').setOrigin(.5, .90625).setScale(.42).setAlpha(.5).setTint(0x8dc9bd).setDepth(6).play('courier-idle');
    this.tweens.add({ targets: this.echo, alpha: { from: .38, to: .62 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const ring = this.add.circle(first.x, first.y - 30, 10).setStrokeStyle(2, 0x8dc9bd, .9).setDepth(6);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
    audio.play('echo');
    ui.echo.textContent = 'PLAYING';
  }

  private updateEcho(time: number) {
    if (!this.playingEcho || !this.echo || this.echoFrames.length < 2) return;
    const elapsed = time - this.playbackStarted;
    const last = this.echoFrames[this.echoFrames.length - 1];
    if (elapsed >= last.t) {
      this.echo.setPosition(last.x, last.y);
      this.playingEcho = false;
      ui.echo.textContent = 'READY';
      this.tweens.killTweensOf(this.echo);
      this.tweens.add({ targets: this.echo, alpha: 0, duration: 380, onComplete: () => this.echo?.destroy() });
      return;
    }
    const sample = sampleEchoFrame(this.echoFrames, elapsed);
    if (sample) {
      const moving = Math.abs(sample.x - this.echo.x) > .35;
      this.echo.setPosition(sample.x, sample.y).setFlipX(sample.flipX).play(moving ? 'courier-run' : 'courier-idle', true);
    }
  }

  private echoActive() {
    return this.playingEcho && !!this.echo?.active;
  }

  /** Distance/direction attenuation for positional sound, relative to the player. */
  private spatial(x: number, maxDistance = 900): { volume: number; pan: number } {
    if (!Number.isFinite(x) || !Number.isFinite(this.player.x)) return { volume: 0, pan: 0 };
    const dx = x - this.player.x;
    const distance = Math.abs(dx);
    return {
      volume: Math.max(0, Math.min(1, 1 - distance / maxDistance)),
      pan: Math.max(-.85, Math.min(.85, dx / 480)),
    };
  }

  private isPlateActive(plate: Phaser.GameObjects.Rectangle) {
    const playerOn = Phaser.Geom.Rectangle.Overlaps(this.player.getBounds(), plate.getBounds());
    const echoOn = this.echoActive() && Phaser.Geom.Rectangle.Overlaps(this.echo!.getBounds(), plate.getBounds());
    return playerOn || echoOn;
  }

  /** Nearest decoy-able target (the player or the echo) for smart enemies. */
  private nearestTarget(x: number, y: number, range: number, maxDy = Number.POSITIVE_INFINITY) {
    let bestD2 = range * range;
    let bestX = 0;
    let bestY = 0;
    let found = false;
    const consider = (tx: number, ty: number) => {
      const dy = Math.abs(ty - y);
      if (dy > maxDy) return;
      const dx = tx - x;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) { bestD2 = d2; bestX = tx; bestY = ty; found = true; }
    };
    if (!this.gameEnded) consider(this.player.x, this.player.y);
    if (this.echoActive()) consider(this.echo!.x, this.echo!.y);
    return found ? { x: bestX, y: bestY } : null;
  }

  // ─────────────────────────────────────────────────────────────
  // Devices update
  // ─────────────────────────────────────────────────────────────

  private updateDevices(time: number) {
    this.updateHoldGates(time);
    this.updateTimedGates(time);
    this.updateRelayGates(time);
    this.updateSequenceGates(time);
    this.updateEchoGates(time);
    this.updateLifts();
  }

  private updateHoldGates(time: number) {
    this.holdGates.forEach(gate => {
      const plateStates = gate.plates.map(plate => this.isPlateActive(plate));
      const mode: HoldMode = gate.requireAll ? 'all' : 'any';
      const activated = holdGateOpen(plateStates, mode, false);
      const shouldOpen = gate.latch ? holdGateOpen(plateStates, mode, gate.open) : activated;
      gate.plates.forEach((plate, index) => plate.setFillStyle(plateStates[index] ? 0xe0a85a : 0xb68247));

      if (gate.closeDelayMs !== undefined) {
        if (activated && !gate.open) this.setGateOpen(gate, true);
        else if (!activated && gate.open) this.armGateClose(gate, time);
        else if (activated && gate.closeTimer) this.disarmGateClose(gate);
        return;
      }
      if (shouldOpen !== gate.open) this.setGateOpen(gate, shouldOpen);
    });
  }

  private armGateClose(gate: HoldGate, _time: number) {
    if (gate.closeTimer || gate.closeDelayMs === undefined) return;
    audio.play('gate', this.spatial(gate.bodies[0]?.rect.x ?? this.player.x));
    gate.closeTimer = this.time.delayedCall(gate.closeDelayMs, () => {
      gate.closeTimer = undefined;
      this.setGateOpen(gate, false);
    });
  }

  private disarmGateClose(gate: HoldGate) {
    if (!gate.closeTimer) return;
    gate.closeTimer.remove(false);
    gate.closeTimer = undefined;
  }

  private updateTimedGates(time: number) {
    this.timedGates.forEach(gate => {
      const active = this.isPlateActive(gate.plate);
      gate.plate.setFillStyle(active ? 0xe0a85a : 0x8a6a4a);
      if (active) {
        const fresh = gate.expiry < time;
        gate.expiry = time + gate.openMs;
        if (!gate.open) {
          audio.play(fresh ? 'plate' : 'toggle');
          this.setGateOpen(gate, true, true);
        }
      }
      if (gate.open) {
        const remaining = gate.expiry - time;
        if (remaining <= 0) {
          this.setGateOpen(gate, false);
        } else {
          const blink = remaining < 1200 ? (Math.sin(time / 55) > 0 ? .55 : .2) : .2;
          gate.bodies.forEach(barrier => barrier.rect.setAlpha(blink));
        }
      }
    });
  }

  private updateRelayGates(time: number) {
    this.relayGates.forEach(gate => {
      gate.plates.forEach((plate, index) => {
        if (this.isPlateActive(plate)) {
          const wasDead = gate.state[index] <= time;
          gate.state = touchRelayPlate(gate.state, index, time, gate.holdMs) as number[];
          if (wasDead) audio.play('toggle', this.spatial(plate.x));
        }
        const charge = relayCharge(gate.state, index, time, gate.holdMs);
        gate.bars[index].setDisplaySize(60 * charge, 5).setAlpha(charge > 0 ? .95 : .18);
        plate.setFillStyle(charge > 0 ? 0x9fd08a : 0x6a7a5a);
      });
      const shouldOpen = relayGateOpen(gate.state, time);
      if (shouldOpen !== gate.open) this.setGateOpen(gate, shouldOpen);
    });
  }

  private updateSequenceGates(time: number) {
    this.sequenceGates.forEach(gate => {
      if (gate.progress >= gate.order.length) {
        gate.lamps.forEach((lamp, index) => {
          lamp.setFillStyle(0xe0a85a);
          gate.labels[index].setColor('#171713');
        });
        return;
      }
      const active = gate.plates.map(plate => this.isPlateActive(plate));
      active.forEach((on, index) => {
        if (on && !gate.prev[index]) {
          const before = gate.progress;
          gate.progress = advanceSequence(gate.progress, index, gate.order);
          if (gate.progress > before) {
            audio.play('good', this.spatial(gate.plates[index].x));
            const lamp = gate.lamps[index];
            this.tweens.add({ targets: lamp, scale: 1.5, duration: 110, yoyo: true, ease: 'Quad.Out' });
            if (gate.progress >= gate.order.length) {
              audio.play('unlock', this.spatial(gate.bodies[0]?.rect.x ?? this.player.x));
              this.setGateOpen(gate, true, true);
              this.showMessage('Sequence accepted — 1 · 2 · 3. The gate releases.', 2600);
            } else {
              this.showMessage(`Accepted. Next: plate ${gate.progress + 1} of ${gate.order.length}.`, 1500);
            }
          } else {
            gate.progress = 0;
            gate.flashUntil = time + 420;
            audio.play('bad', this.spatial(gate.plates[index].x));
            this.showMessage('Wrong order — the sequence resets. Follow 1 · 2 · 3.', 2000);
          }
        }
        gate.prev[index] = on;
      });
      const flashing = time < gate.flashUntil;
      gate.lamps.forEach((lamp, index) => {
        if (flashing) {
          lamp.setFillStyle(0xd16151);
          gate.labels[index].setColor('#f1d7a9');
          return;
        }
        const isNext = gate.order[gate.progress] === index;
        const lit = gate.order.indexOf(index) < gate.progress;
        lamp.setFillStyle(lit ? 0xe0a85a : isNext ? 0xf1d7a9 : 0x22312c);
        gate.labels[index].setColor(lit ? '#171713' : isNext ? '#f1d7a9' : '#8fa39b');
      });
    });
  }

  private updateEchoGates(time: number) {
    this.echoGates.forEach(gate => {
      gate.pads.forEach((pad, index) => {
        const over = this.echoActive() && Phaser.Geom.Rectangle.Overlaps(this.echo!.getBounds(), pad.getBounds());
        if (over && !gate.prev[index]) {
          gate.states[index] = !gate.states[index];
          audio.play(gate.states[index] ? 'chime' : 'toggle', this.spatial(pad.x));
          this.sparkle.explode(8, pad.x, 440);
          gate.crystals[index].setTint(gate.states[index] ? 0xffffff : 0x9fbdb4);
        }
        gate.prev[index] = over;
        // The player themselves cannot wake a crystal — shimmer a polite refusal.
        const playerOver = Phaser.Geom.Rectangle.Overlaps(this.player.getBounds(), pad.getBounds());
        if (playerOver && !gate.states[index] && time > (pad.getData('rejectAt') ?? 0)) {
          pad.setData('rejectAt', time + 1100);
          audio.play('reject', this.spatial(pad.x));
          this.tweens.add({ targets: gate.crystals[index], x: pad.x - 3, duration: 45, yoyo: true, repeat: 3 });
          if (this.lastHint !== 'resonator') {
            this.lastHint = 'resonator';
            this.showMessage('The crystal ignores the living — only your ECHO can wake it.', 3000);
          }
        }
        pad.setFillStyle(gate.states[index] ? 0x2c5a50 : 0x1f3a36);
      });
      const shouldOpen = echoSwitchGateOpen(gate.states);
      if (shouldOpen !== gate.open) this.setGateOpen(gate, shouldOpen);
    });
  }

  private updateLifts() {
    this.lifts.forEach(lift => {
      const active = this.isPlateActive(lift.plate);
      if (active !== lift.powered) {
        lift.powered = active;
        lift.plate.setFillStyle(active ? 0xe0a85a : 0xb68247);
        audio.play(active ? 'plate' : 'gate', this.spatial(lift.plate.x));
      }
      const body = lift.platform.body as Phaser.Physics.Arcade.Body;
      const position = lift.axis === 'x' ? lift.platform.x : lift.platform.y;
      if (active) {
        if (position >= lift.to) lift.dir = -1;
        if (position <= lift.from) lift.dir = 1;
        const velocity = lift.speed * lift.dir;
        if (lift.axis === 'x') body.setVelocityX(velocity); else body.setVelocityY(velocity);
        return;
      }
      if (Math.abs(position - lift.from) < 4) {
        if (lift.axis === 'x') { lift.platform.x = lift.from; body.setVelocityX(0); }
        else { lift.platform.y = lift.from; body.setVelocityY(0); }
      } else {
        const back = position > lift.from ? -lift.speed * .8 : lift.speed * .8;
        if (lift.axis === 'x') body.setVelocityX(back); else body.setVelocityY(back);
      }
    });
  }

  private updateMovers(delta: number) {
    this.movers.forEach(mover => {
      const body = mover.platform.body as Phaser.Physics.Arcade.Body;
      const next = mover.platform.x + mover.dir * mover.speed * (delta / 1000);
      if (next >= mover.x0 + mover.span) { mover.platform.x = mover.x0 + mover.span; mover.dir = -1; }
      else if (next <= mover.x0) { mover.platform.x = mover.x0; mover.dir = 1; }
      else mover.platform.x = next;
      body.setVelocityX(mover.dir * mover.speed);
    });
  }

  private updateCrushers(time: number) {
    this.crushers.forEach(crusher => {
      const t = ((time + crusher.phase) % crusher.period) / crusher.period;
      let y = crusher.hangY;
      let telegraph = false;
      if (t < .3) {
        y = crusher.hangY;
        telegraph = t > .2; // tremble warning right before the drop
      } else if (t < .4) {
        const k = (t - .3) / .1;
        y = crusher.hangY + (crusher.slamY - crusher.hangY) * k * k;
      } else if (t < .5) {
        y = crusher.slamY;
      } else {
        const k = (t - .5) / .5;
        y = crusher.slamY + (crusher.hangY - crusher.slamY) * (1 - Math.pow(1 - k, 2));
      }
      if (telegraph) y += Math.sin(time / 16) * 1.8;
      if (y >= crusher.slamY - 1 && crusher.head.y < crusher.slamY - 1) {
        // Strictly proximity-based: silent and still beyond ~620px.
        const dx = Math.abs(this.player.x - crusher.x);
        const at = this.spatial(crusher.x, 620);
        if (at.volume > .1) audio.play('slam', at);
        if (dx < 320) this.cameras.main.shake(60, .0009 * (1 - dx / 320));
        if (dx < 620) {
          this.dust.explode(5, crusher.x, crusher.slamY + 14);
          const ring = this.add.circle(crusher.x, crusher.slamY + 12, 12).setStrokeStyle(2, 0xd6a45d, .55).setDepth(5);
          this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
        }
      }
      crusher.head.y = y;
      crusher.teeth.y = y + 14;
      crusher.column.setDisplaySize(18, Math.max(0, y - 18));
      const staticBody = crusher.head.body as Phaser.Physics.Arcade.StaticBody;
      staticBody.updateFromGameObject();
    });
  }

  private updatePendulums(time: number) {
    this.pendulums.forEach(p => {
      const theta = Math.sin(((time + p.phase) / p.period) * Math.PI * 2) * p.amplitude;
      const bobX = p.x + Math.sin(theta) * p.length;
      const bobY = p.pivotY + Math.cos(theta) * p.length;
      p.bob.setPosition(bobX, bobY);
      p.bob.setRotation(theta * .6);
      (p.bob.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
      p.chain.clear().lineStyle(2, 0xb68247, .55).lineBetween(p.x, p.pivotY, bobX, bobY);
    });
  }

  private updateCrumbles(time: number) {
    this.crumbles.forEach(crumble => {
      if (crumble.state === 'shake') {
        crumble.rect.x = crumble.baseX + Math.sin(time / 14) * 1.6;
        if (time >= crumble.until) {
          crumble.state = 'gone';
          crumble.until = time + 2800;
          crumble.rect.x = crumble.baseX;
          (crumble.rect.body as Phaser.Physics.Arcade.StaticBody).enable = false;
          this.tweens.add({ targets: crumble.rect, alpha: .12, y: crumble.rect.y + 120, duration: 500, ease: 'Quad.In' });
          this.dust.explode(8, crumble.rect.x, crumble.rect.y);
        }
      } else if (crumble.state === 'gone' && time >= crumble.until) {
        crumble.state = 'idle';
        crumble.rect.y -= 120;
        crumble.rect.setAlpha(1);
        const staticBody = crumble.rect.body as Phaser.Physics.Arcade.StaticBody;
        staticBody.enable = true;
        staticBody.updateFromGameObject();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Enemies
  // ─────────────────────────────────────────────────────────────

  private updateEnemies(time: number) {
    // Iterate snapshots: these loops may disable/enable bodies, and any future
    // destroy() call would otherwise corrupt a live Set.iterate().
    const ground = (this.groundEnemies.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice();
    for (let i = 0; i < ground.length; i += 1) {
      const enemy = ground[i];
      if (!enemy.active) continue;
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      if (enemy.y > HEIGHT + 160) { enemy.disableBody(true, true); continue; }
      switch (enemy.getData('kind')) {
        case 'crawler': this.updateCrawler(enemy, body, time); break;
        case 'spitter': this.updateSpitter(enemy, body, time); break;
        case 'charger': this.updateCharger(enemy, body, time); break;
        case 'warden': this.updateWarden(enemy, body, time); break;
      }
    }
    const air = (this.airEnemies.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice();
    for (let i = 0; i < air.length; i += 1) {
      const enemy = air[i];
      if (!enemy.active) continue;
      this.updateFlyer(enemy, enemy.body as Phaser.Physics.Arcade.Body, time);
    }
  }

  private patrolFlip(enemy: Phaser.Physics.Arcade.Sprite, body: Phaser.Physics.Arcade.Body, speed: number) {
    const minX = enemy.getData('minX') as number | undefined;
    const maxX = enemy.getData('maxX') as number | undefined;
    if (body.blocked.left) enemy.setData('dir', 1);
    if (body.blocked.right) enemy.setData('dir', -1);
    if (minX !== undefined && enemy.x <= minX) enemy.setData('dir', 1);
    if (maxX !== undefined && enemy.x >= maxX) enemy.setData('dir', -1);
    const dir = enemy.getData('dir') as number;
    body.setVelocityX(dir * speed);
    enemy.setFlipX(dir > 0);
  }

  private updateCrawler(enemy: Phaser.Physics.Arcade.Sprite, body: Phaser.Physics.Arcade.Body, time: number) {
    if (enemy.getData('dir') === undefined) enemy.setData('dir', body.velocity.x >= 0 ? 1 : -1);
    this.patrolFlip(enemy, body, 70);
    // Audible skittering, but only within earshot.
    if (time >= (enemy.getData('nextSkitter') ?? 0)) {
      enemy.setData('nextSkitter', time + 760 + (enemy.getData('index') as number) * 173 % 520);
      const at = this.spatial(enemy.x, 560);
      if (at.volume > .05) audio.play('tick', at);
    }
  }

  private updateSpitter(enemy: Phaser.Physics.Arcade.Sprite, body: Phaser.Physics.Arcade.Body, time: number) {
    body.setVelocityX(0);
    const nextShot = enemy.getData('nextShot') as number;
    const target = this.nearestTarget(enemy.x, enemy.y - 10, 560, 260);
    if (!target) {
      if (enemy.scaleX !== 1) enemy.setScale(1);
      enemy.setData('nextShot', Math.max(nextShot, time + 500));
      return;
    }
    const windup = time >= nextShot - 260;
    enemy.setScale(windup ? 1.14 : 1);
    enemy.setFlipX(target.x < enemy.x);
    if (time >= nextShot) {
      enemy.setData('nextShot', time + 1750);
      enemy.setScale(1);
      this.fireProjectile(enemy, target);
    }
  }

  private fireProjectile(enemy: Phaser.Physics.Arcade.Sprite, target: { x: number; y: number }) {
    const orb = this.projectiles.create(enemy.x, enemy.y - 16, 'orb') as Phaser.Physics.Arcade.Image;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y + 6;
    const length = Math.max(1, Math.hypot(dx, dy));
    orb.setVelocity(dx / length * 265, dy / length * 265);
    orb.setDepth(6).setData('born', this.time.now);
    audio.play('shoot', this.spatial(enemy.x));
  }

  private updateProjectiles(time: number) {
    // Snapshot the children: destroying an orb removes it from the group's
    // backing Set, and Phaser's Set.iterate() indexes that live array while
    // holding a stale length — mutating it mid-iterate throws on `undefined`.
    const orbs = (this.projectiles.getChildren() as Phaser.Physics.Arcade.Image[]).slice();
    for (let i = 0; i < orbs.length; i += 1) {
      const orb = orbs[i];
      if (!orb.active || !orb.body) continue;
      if (time - (orb.getData('born') as number) > 3200) { orb.destroy(); continue; }
      orb.rotation += .12;
      if (this.echoActive() && Phaser.Geom.Rectangle.Overlaps(orb.getBounds(), this.echo!.getBounds())) {
        audio.play('chime');
        this.sparkle.explode(5, orb.x, orb.y);
        orb.destroy();
      }
    }
  }

  private updateCharger(enemy: Phaser.Physics.Arcade.Sprite, body: Phaser.Physics.Arcade.Body, time: number) {
    const state = enemy.getData('state') as string;
    if (state === 'patrol') {
      this.patrolFlip(enemy, body, 90);
      const target = this.nearestTarget(enemy.x, enemy.y, 360, 70);
      if (target) {
        enemy.setData('state', 'windup').setData('windupUntil', time + 350);
        body.setVelocityX(0);
        audio.play('growl', this.spatial(enemy.x, 640));
      }
    } else if (state === 'windup') {
      body.setVelocityX(0);
      enemy.setAlpha(Math.sin(time / 22) > 0 ? .65 : 1);
      if (time >= (enemy.getData('windupUntil') as number)) {
        const target = this.nearestTarget(enemy.x, enemy.y, 420, 80);
        enemy.setAlpha(1);
        enemy.setData('state', 'charge').setData('chargeUntil', time + 900);
        enemy.setData('dir', target && target.x < enemy.x ? -1 : 1);
        audio.play('swoop', this.spatial(enemy.x, 640));
      }
    } else if (state === 'charge') {
      this.patrolFlip(enemy, body, 340);
      if (body.blocked.left || body.blocked.right) {
        enemy.setData('state', 'dizzy').setData('dizzyUntil', time + 600);
        audio.play('slam', this.spatial(enemy.x, 640));
        const dx = Math.abs(this.player.x - enemy.x);
        if (dx < 380) this.cameras.main.shake(60, .0012 * (1 - dx / 380));
        this.dust.explode(5, enemy.x, enemy.y + 10);
      } else if (time >= (enemy.getData('chargeUntil') as number)) {
        enemy.setData('state', 'dizzy').setData('dizzyUntil', time + 500);
      }
    } else {
      body.setVelocityX(body.velocity.x * .8);
      if (time >= (enemy.getData('dizzyUntil') as number)) enemy.setData('state', 'patrol');
    }
  }

  private updateWarden(enemy: Phaser.Physics.Arcade.Sprite, body: Phaser.Physics.Arcade.Body, time: number) {
    const staggerUntil = (enemy.getData('staggerUntil') as number) ?? 0;
    if (time < staggerUntil) {
      body.setVelocityX(body.velocity.x * .88);
      return;
    }
    const hp = enemy.getData('hp') as number;
    const target = this.nearestTarget(enemy.x, enemy.y, 460, 130);
    if (target) {
      if (!enemy.getData('aggroed')) {
        enemy.setData('aggroed', true);
        audio.play('growl', this.spatial(enemy.x, 760));
      }
      const dir = target.x < enemy.x ? -1 : 1;
      const minX = enemy.getData('minX') as number | undefined;
      const maxX = enemy.getData('maxX') as number | undefined;
      const atMin = minX !== undefined && enemy.x <= minX;
      const atMax = maxX !== undefined && enemy.x >= maxX;
      const step = atMin && dir < 0 ? 0 : atMax && dir > 0 ? 0 : dir;
      enemy.setData('dir', step);
      body.setVelocityX(step * (150 + (3 - hp) * 28));
      enemy.setFlipX(dir > 0);
      if (time >= (enemy.getData('nextStep') ?? 0)) {
        enemy.setData('nextStep', time + 620);
        audio.play('stepheavy', this.spatial(enemy.x, 700));
      }
    } else {
      this.patrolFlip(enemy, body, 60);
    }
  }

  private updateFlyer(enemy: Phaser.Physics.Arcade.Sprite, body: Phaser.Physics.Arcade.Body, time: number) {
    const state = (enemy.getData('state') as string) ?? 'hover';
    const anchorX = enemy.getData('anchorX') as number;
    const anchorY = enemy.getData('anchorY') as number;
    const phase = enemy.getData('phase') as number;
    if (state === 'hover') {
      body.setVelocityX(Phaser.Math.Clamp((anchorX - enemy.x) * 1.6, -60, 60));
      body.setVelocityY(Math.sin(time / 300 + phase) * 38 + Phaser.Math.Clamp((anchorY - enemy.y) * 1.6, -40, 40));
      const target = this.nearestTarget(enemy.x, enemy.y, 300);
      if (target) {
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        body.setVelocity(dx / length * 300, dy / length * 300);
        enemy.setData('state', 'swoop').setData('swoopUntil', time + 700);
        audio.play('swoop', this.spatial(enemy.x));
      }
    } else if (state === 'swoop') {
      if (time >= (enemy.getData('swoopUntil') as number)) enemy.setData('state', 'return');
    } else {
      const dx = anchorX - enemy.x;
      const dy = anchorY - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 14) {
        enemy.setData('state', 'hover');
        body.setVelocity(0, 0);
      } else {
        body.setVelocity(dx / dist * 170, dy / dist * 170);
      }
    }
    enemy.setFlipX(body.velocity.x > 0);
  }

  private updateShards(time: number) {
    const shards = (this.shards.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice();
    for (let i = 0; i < shards.length; i += 1) {
      const shard = shards[i];
      if (!shard.active) continue;
      shard.setAngle((time / 25 + shard.getData('phase') * 50) % 360);
      shard.y = shard.getData('baseY') + Math.sin(time / 350 + shard.getData('phase')) * 5;
      shard.refreshBody();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // State changes
  // ─────────────────────────────────────────────────────────────

  private activateCheckpoint(relay: Phaser.GameObjects.Rectangle, respawnX: number) {
    if (this.checkpointX >= respawnX) return;
    this.checkpointX = respawnX;
    relay.setFillStyle(0xd3a259);
    audio.play('checkpoint');
    ui.checkpoint.textContent = 'ONLINE';
    this.showMessage('Relay restored. Respawn point synchronized.', 2400);
  }

  private hurtPlayer() {
    if (this.time.now < this.invulnerableUntil || this.gameEnded) return;
    this.invulnerableUntil = this.time.now + 1100;
    audio.play('hurt');
    this.cameras.main.shake(160, .009);
    this.player.setTint(0xd16151).setVelocity(0, -240);
    this.player.play('courier-hurt', true);
    this.time.delayedCall(230, () => {
      this.player.setPosition(this.checkpointX, 420).setVelocity(0, 0).clearTint();
      this.cameras.main.fadeIn(180, 15, 22, 21);
    });
  }

  private win() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.player.setAcceleration(0).setVelocity(0, 0);
    this.player.play('courier-victory');
    audio.play('win');
    const level = this.level;
    const rank = completionRank(this.shardsFound, this.totalShards, this.runElapsedMs, level.parMs);
    const outcome = recordCompletion(this.progress, level.id, this.levelIndex, LEVELS.length, this.runElapsedMs, this.shardsFound);
    this.progress = outcome.progress;
    ui.resultEyebrow.textContent = `CHAPTER ${this.levelIndex + 1} · ${level.name.toUpperCase()}`;
    const best = this.progress.best[level.id];
    const nextExists = this.levelIndex + 1 < LEVELS.length;
    ui.resultTitle.textContent = `Rank ${rank} — ${nextExists ? 'The next ward awaits.' : 'The city remembers.'}`;
    ui.resultCopy.textContent = [
      `Run ${formatRunTime(this.runElapsedMs, true)}`,
      `${this.shardsFound}/${this.totalShards} shards`,
      `Best ${formatRunTime(best?.ms ?? this.runElapsedMs, true)}${outcome.isBest ? ' · New record' : ''}`,
      outcome.unlockedNext ? '· New chapter unlocked' : '',
    ].filter(Boolean).join(' · ');
    ui.next.classList.toggle('hidden', !nextExists);
    ui.result.classList.remove('hidden');
  }

  private showMessage(text: string, duration: number) {
    ui.message.textContent = text;
    ui.message.classList.add('visible');
    this.messageTimer?.remove(false);
    this.messageTimer = this.time.delayedCall(duration, () => ui.message.classList.remove('visible'));
  }

  private showLevelBanner() {
    ui.bannerName.textContent = `LEVEL ${this.levelIndex + 1} — ${this.level.name.toUpperCase()}`;
    ui.bannerSub.textContent = this.level.subtitle;
    ui.banner.classList.remove('show');
    void ui.banner.offsetWidth;
    ui.banner.classList.add('show');
  }

  // ─────────────────────────────────────────────────────────────
  // Flow control
  // ─────────────────────────────────────────────────────────────

  startGame() {
    // Chips may have changed the selection after this scene loaded its copy.
    this.progress = withDevUnlocks(loadProgress(LEVELS.map(l => l.id)));
    this.launchLevel(this.progress.current);
  }

  launchLevel(index: number) {
    audio.start();
    this.hasEverStarted = true;
    this.levelIndex = Phaser.Math.Clamp(index, 0, LEVELS.length - 1);
    this.progress.current = this.levelIndex;
    saveProgress(this.progress);
    ui.start.classList.add('hidden');
    ui.pause.classList.add('hidden');
    ui.result.classList.add('hidden');
    ui.message.classList.remove('visible');
    this.scene.resume();
    this.scene.restart();
  }

  restartRun() {
    if (!this.hasEverStarted) return;
    ui.pause.classList.add('hidden');
    ui.result.classList.add('hidden');
    this.paused = false;
    this.physics.world.isPaused = false;
    this.scene.restart();
  }

  openMenu() {
    if (!this.hasEverStarted) return;
    this.paused = true;
    this.physics.world.isPaused = true;
    ui.pause.classList.add('hidden');
    ui.result.classList.add('hidden');
    ui.start.classList.remove('hidden');
    renderChips(this.progress);
  }

  togglePause(force?: boolean) {
    if (!this.gameStarted || this.gameEnded) return;
    const next = force ?? !this.paused;
    if (next === this.paused) return;
    this.paused = next;
    this.physics.world.isPaused = this.paused;
    ui.pause.classList.toggle('hidden', !this.paused);
    if (!next) ui.start.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────────────────────
// Boot + DOM wiring
// ─────────────────────────────────────────────────────────────

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  parent: 'game',
  backgroundColor: '#182422',
  pixelArt: true,
  roundPixels: true,
  audio: { noAudio: true },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1050 }, debug: false } },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: GameScene,
});

const scene = () => game.scene.getScene('game') as GameScene;

const savedProgress = loadProgress(LEVELS.map(l => l.id));
const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouchDevice) document.body.classList.add('touch-ui');

function renderChips(progress: PlayerProgress) {
  ui.chips.innerHTML = '';
  LEVELS.forEach((level, index) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    const record = progress.best[level.id];
    const locked = index > progress.unlocked;
    const accent = `#${level.palette.sky.toString(16).padStart(6, '0')}`;
    chip.className = [
      'chip',
      index === progress.current ? 'active' : '',
      locked ? 'locked' : '',
      record ? 'done' : '',
    ].filter(Boolean).join(' ');
    chip.style.setProperty('--accent', accent);
    chip.innerHTML = `
      <span class="chip-index">${index + 1}</span>
      <span class="chip-body">
        <span class="chip-name">${level.name}</span>
        <span class="chip-sub">${level.subtitle}</span>
      </span>
      <span class="chip-meta">${locked ? 'LOCKED · FINISH PREVIOUS' : record ? `BEST ${formatRunTime(record.ms)} · ${record.shards}/${level.shards.length} SHARDS` : 'NEW · NOT CLEARED'}</span>
    `;
    chip.addEventListener('click', () => {
      if (locked) {
        chip.classList.add('deny');
        window.setTimeout(() => chip.classList.remove('deny'), 380);
        return;
      }
      progress.current = index;
      saveProgress(progress);
      renderChips(progress);
      if (document.body.classList.contains('in-run')) scene().launchLevel(index);
    });
    ui.chips.appendChild(chip);
  });
  ui.begin.textContent = progress.best[LEVELS[progress.current].id] ? `CONTINUE — ${LEVELS[progress.current].name.toUpperCase()}` : `BEGIN — ${LEVELS[progress.current].name.toUpperCase()}`;
}
renderChips(withDevUnlocks(loadProgress(LEVELS.map(l => l.id))));

// The scene loads the same persisted progress itself, so both stay in sync.

ui.begin.addEventListener('click', () => {
  document.body.classList.add('in-run');
  scene().startGame();
});
document.querySelector('#resume-button')!.addEventListener('click', () => scene().togglePause(false));
document.querySelector('#pause-restart-button')!.addEventListener('click', () => scene().restartRun());
document.querySelector('#pause-menu-button')!.addEventListener('click', () => scene().openMenu());
document.querySelector('#retry-button')!.addEventListener('click', () => scene().restartRun());
document.querySelector('#result-menu-button')!.addEventListener('click', () => scene().openMenu());
ui.next.addEventListener('click', () => scene().startGame());
(document.querySelector('#pause-button') as HTMLButtonElement).addEventListener('click', () => scene().togglePause());

ui.sound.addEventListener('click', () => {
  audio.start();
  const muted = audio.toggleMuted();
  ui.sound.textContent = muted ? 'AUDIO OFF' : 'AUDIO ON';
});

// Touch controls — pointer events with capture keep slides and multi-touch reliable.
function bindHold(target: Element, down: () => void, up: () => void) {
  const element = target as HTMLElement;
  const active = new Set<number>();
  element.addEventListener('pointerdown', event => {
    event.preventDefault();
    element.setPointerCapture?.(event.pointerId);
    if (active.has(event.pointerId)) return;
    active.add(event.pointerId);
    down();
  });
  const release = (event: PointerEvent) => {
    if (!active.has(event.pointerId)) return;
    active.delete(event.pointerId);
    up();
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
  element.addEventListener('contextmenu', event => event.preventDefault());
}

bindHold(document.querySelector('#tc-left')!, () => scene().setTouchDirection('left'), () => scene().setTouchDirection(touch.right ? 'right' : 'none'));
bindHold(document.querySelector('#tc-right')!, () => scene().setTouchDirection('right'), () => scene().setTouchDirection(touch.left ? 'left' : 'none'));
bindHold(document.querySelector('#tc-jump')!, () => { scene().setTouchJumpHeld(true); scene().queueJump(); }, () => scene().setTouchJumpHeld(false));
bindHold(document.querySelector('#tc-echo')!, () => scene().toggleRecording(), () => undefined);
bindHold(document.querySelector('#tc-star')!, () => scene().throwShuriken(), () => undefined);
// Pause automatically when the tab loses focus (mobile switching).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) scene().togglePause(true);
});

// Orientation flips and iOS toolbar collapses occasionally need a scale nudge.
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => game.scale.refresh(), 250);
});

// Fullscreen is a big win on phones; hide the button where unsupported.
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button');
if (fullscreenButton && document.fullscreenEnabled) {
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  });
} else if (fullscreenButton) {
  fullscreenButton.classList.add('hidden');
}

if (import.meta.env.DEV) {
  (window as typeof window & { __echofall?: Phaser.Game }).__echofall = game;

  // Surface any uncaught frame error on-screen so a freeze reports its cause
  // instead of silently stopping the render loop.
  let reported = false;
  const reportError = (title: string, detail: string) => {
    if (reported) return;
    reported = true;
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;margin:0;padding:10px 14px;max-height:45vh;overflow:auto;white-space:pre-wrap;background:rgba(130,25,25,.95);color:#fff;font:12px/1.5 monospace';
    box.textContent = `[Echofall] ${title}\n${detail}`;
    document.body.appendChild(box);
    console.error(title, detail);
  };
  window.addEventListener('error', event => {
    reportError(event.message, `${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack ?? ''}`);
  });
  window.addEventListener('unhandledrejection', event => {
    reportError('Unhandled promise rejection', `${event.reason?.stack ?? String(event.reason)}`);
  });
}
