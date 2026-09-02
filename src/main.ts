import Phaser from 'phaser';
import './style.css';
import { sampleEchoFrame, type EchoFrame } from './echo';
import { completionRank, formatRunTime } from './progress';
import { AudioDirector } from './audio';
import { LEVEL_BLUEPRINT } from './level';

type BarrierBody = { body: Phaser.GameObjects.Rectangle; closedY: number; openY: number };
type Gate = { bodies: BarrierBody[]; plates: Phaser.GameObjects.Rectangle[]; requireAll: boolean; latchesOpen: boolean; open: boolean };
type LiftDevice = { platform: Phaser.GameObjects.Rectangle; plate: Phaser.GameObjects.Rectangle; startX: number; endX: number; direction: number; powered: boolean };
type ParallaxLayer = { images: Phaser.GameObjects.Image[]; width: number; rate: number };

const WIDTH = 960;
const HEIGHT = 540;
const WORLD_WIDTH = LEVEL_BLUEPRINT.worldWidth;
const GROUND_Y = 486;
const TOTAL_SHARDS = 18;
const ECHO_DURATION_MS = 7000;
const audio = new AudioDirector();

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
  sound: document.querySelector<HTMLButtonElement>('#sound-toggle')!,
};

class GameScene extends Phaser.Scene {
  private parallaxLayers: ParallaxLayer[] = [];
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private shards!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private gates: Gate[] = [];
  private lift?: LiftDevice;
  private echo?: Phaser.GameObjects.Sprite;
  private echoFrames: EchoFrame[] = [];
  private recording = false;
  private recordStarted = 0;
  private playbackStarted = 0;
  private playingEcho = false;
  private shardsFound = 0;
  private checkpointX = 140;
  private invulnerableUntil = 0;
  private gameStarted = false;
  private gameEnded = false;
  private paused = false;
  private messageTimer?: Phaser.Time.TimerEvent;
  private lastHint = '';
  private hasEverStarted = false;
  private runElapsedMs = 0;
  private lastTimerTick = -1;
  private lastGroundedAt = Number.NEGATIVE_INFINITY;
  private jumpQueuedAt = Number.NEGATIVE_INFINITY;
  private wasGrounded = false;
  private lastStepAt = 0;

  constructor() { super('game'); }

  preload() {
    this.load.image('courier-source', 'assets/kite-sprite-source.png');
    this.load.image('malaysia-skyline', 'assets/malaysia-skyline.png');
    this.load.image('malaysia-midground', 'assets/malaysia-midground.png');
    this.load.image('malaysia-foreground', 'assets/malaysia-foreground.png');
  }

  create() {
    this.gates = [];
    this.lift = undefined;
    this.echo = undefined;
    this.echoFrames = [];
    this.recording = false;
    this.playingEcho = false;
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
    this.wasGrounded = false;
    this.lastStepAt = 0;
    this.physics.world.isPaused = false;
    this.physics.world.setBoundsCollision(true, true, true, false);
    ui.shard.textContent = `0 / ${TOTAL_SHARDS}`;
    ui.timer.textContent = '00:00.0';
    ui.echo.textContent = 'READY';
    ui.checkpoint.textContent = 'OFFLINE';
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, HEIGHT);
    this.makeTextures();
    this.buildCourierAtlas();
    this.drawWorld();
    this.buildLevel();
    this.createPlayer();
    this.createEnemies();
    this.createShards();
    this.createCheckpointAndGoal();
    this.bindInput();
    this.bindPhysics();
    this.cameras.main.startFollow(this.player, true, 0.085, 0.085, -120, 50);
    this.cameras.main.setDeadzone(210, 90);
    this.showMessage('Reach the time vault. The city is waiting.', 3200);
    if (!this.hasEverStarted) this.scene.pause();
  }

  private makeTextures() {
    if (this.textures.exists('crawler')) return;
    const g = this.add.graphics();
    g.fillStyle(0x263632).fillRoundedRect(1, 4, 30, 22, 5);
    g.fillStyle(0xbc6655).fillRect(4, 0, 24, 8);
    g.fillStyle(0xe6d7b7).fillRect(7, 11, 5, 4).fillRect(20, 11, 5, 4);
    g.fillStyle(0x17211f).fillRect(6, 26, 7, 5).fillRect(20, 26, 7, 5);
    g.generateTexture('crawler', 32, 31).clear();

    g.lineStyle(3, 0xe0a85a).strokeCircle(10, 10, 7);
    g.fillStyle(0xf1d7a9).fillCircle(10, 10, 3);
    g.generateTexture('shard', 20, 20).clear();

    g.fillStyle(0xd16151).fillTriangle(0, 18, 10, 0, 20, 18);
    g.generateTexture('spike', 20, 18).destroy();
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

  private drawWorld() {
    this.cameras.main.setBackgroundColor('#7ca99c');
    const imageScale = HEIGHT / 724;
    const layerWidth = 2172 * imageScale;
    const addLayer = (texture: string, rate: number, depth: number, alpha = 1) => {
      const images = [0, layerWidth].map(x => this.add.image(x, 0, texture)
        .setOrigin(0).setScrollFactor(0).setScale(imageScale).setDepth(depth).setAlpha(alpha));
      this.parallaxLayers.push({ images, width: layerWidth, rate });
    };
    this.parallaxLayers = [];
    addLayer('malaysia-skyline', .08, -30);
    addLayer('malaysia-midground', .24, -20, .88);
    addLayer('malaysia-foreground', .46, .5, .82);

    const abyss = this.add.graphics().setScrollFactor(0).setDepth(.75);
    const viewportRight = Math.max(WORLD_WIDTH, this.scale.width);
    const viewportBottom = Math.max(HEIGHT * 4, this.scale.height);
    abyss.fillStyle(0x10201e, .72).fillRect(0, GROUND_Y + 8, viewportRight, 12);
    abyss.fillStyle(0x0a1514, .86).fillRect(0, GROUND_Y + 20, viewportRight, 14);
    abyss.fillStyle(0x050b0b, .96).fillRect(0, GROUND_Y + 34, viewportRight, viewportBottom - GROUND_Y - 34);
    abyss.lineStyle(1, 0x88b6a3, .18).lineBetween(0, GROUND_Y + 12, viewportRight, GROUND_Y + 12);
    for (let x = 24; x < viewportRight; x += 68) {
      const depth = 12 + (x % 4) * 7;
      abyss.lineStyle(2, 0x28443d, .36).lineBetween(x, GROUND_Y + 17, x, GROUND_Y + 17 + depth);
      abyss.fillStyle(0xd6a45d, .38).fillCircle(x, GROUND_Y + 19 + depth, 1.5);
    }
  }

  private addPlatform(x: number, y: number, width: number, height = 28) {
    const block = this.add.rectangle(x, y, width, height, 0x344b44).setStrokeStyle(2, 0x688078).setDepth(1);
    this.physics.add.existing(block, true);
    this.platforms.add(block);
    const moss = this.add.rectangle(x, y - height / 2 + 3, width - 4, 5, 0x77956c).setDepth(2);
    moss.setAlpha(.85);
    return block;
  }

  private buildLevel() {
    this.platforms = this.physics.add.staticGroup();
    LEVEL_BLUEPRINT.floorSegments.forEach(([x, width]) => this.addPlatform(x, GROUND_Y, width, 36));
    LEVEL_BLUEPRINT.platforms.forEach(([x, y, width]) => this.addPlatform(x, y, width));
    LEVEL_BLUEPRINT.hazards.forEach(([x, count]) => this.addHazards(x, 475, count));

    this.addGate(1400, 2050);
    this.addPoweredLift(2700, 3020, 3370);
    this.addShutterRun(4280, [4560, 4820, 5080]);
    this.addDualGate([5520, 6460], 6800);
  }

  private addHazards(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const spike = this.physics.add.staticImage(x + i * 19, y, 'spike').setOrigin(.5, 1).setDepth(3);
      spike.body.setSize(14, 12).setOffset(3, 6);
      spike.setData('hazard', true);
      this.platforms.add(spike);
    }
  }

  private addPlate(x: number) {
    return this.add.rectangle(x, 465, 68, 10, 0xb68247).setStrokeStyle(2, 0xe4c288).setDepth(3);
  }

  private addBarrierBody(x: number) {
    const height = 388;
    const closedY = 274;
    const body = this.add.rectangle(x, closedY, 30, height, 0x263b36).setStrokeStyle(3, 0xb68247).setDepth(4);
    this.physics.add.existing(body, true);
    this.platforms.add(body);
    this.add.rectangle(x, 74, 100, 18, 0x314840).setStrokeStyle(2, 0xb68247).setDepth(4);
    return { body, closedY, openY: -height / 2 - 10 };
  }

  private drawCable(plateX: number, targetX: number) {
    this.add.graphics().lineStyle(2, 0xb68247, .65).lineBetween(plateX, 469, targetX, 469).setDepth(2);
  }

  private addGate(plateX: number, gateX: number) {
    const plate = this.addPlate(plateX);
    this.drawCable(plateX, gateX);
    this.gates.push({ plates: [plate], bodies: [this.addBarrierBody(gateX)], requireAll: false, latchesOpen: false, open: false });
  }

  private addShutterRun(plateX: number, gateXs: number[]) {
    const plate = this.addPlate(plateX);
    gateXs.forEach(gateX => this.drawCable(plateX, gateX));
    this.gates.push({ plates: [plate], bodies: gateXs.map(gateX => this.addBarrierBody(gateX)), requireAll: false, latchesOpen: false, open: false });
  }

  private addDualGate(plateXs: number[], gateX: number) {
    const plates = plateXs.map(x => this.addPlate(x));
    plateXs.forEach(x => this.drawCable(x, gateX));
    this.gates.push({ plates, bodies: [this.addBarrierBody(gateX)], requireAll: true, latchesOpen: true, open: false });
  }

  private addPoweredLift(plateX: number, startX: number, endX: number) {
    const plate = this.addPlate(plateX);
    this.drawCable(plateX, startX);
    const platform = this.add.rectangle(startX, 405, 130, 18, 0x4f8177).setStrokeStyle(2, 0xb9d8d0).setDepth(3);
    this.physics.add.existing(platform);
    const body = platform.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setImmovable(true);
    body.pushable = false;
    this.lift = { platform, plate, startX, endX, direction: 1, powered: false };
  }

  private createPlayer() {
    this.player = this.physics.add.sprite(140, 430, 'courier').setDepth(8);
    this.player.setOrigin(.5, .90625).setScale(.42).setCollideWorldBounds(true).setBounce(0).setDragX(1100).setMaxVelocity(300, 700);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(52, 90).setOffset(54, 55);
    this.player.play('courier-idle');
  }

  private createEnemies() {
    this.enemies = this.physics.add.group({ allowGravity: true });
    LEVEL_BLUEPRINT.enemies.forEach(([x, y], i) => {
      const enemy = this.enemies.create(x, y, 'crawler') as Phaser.Physics.Arcade.Sprite;
      enemy.setVelocityX(i % 2 ? 70 : -70).setBounce(1, 0).setCollideWorldBounds(true).setData('alive', true).setDepth(7);
      (enemy.body as Phaser.Physics.Arcade.Body).setSize(28, 27).setOffset(2, 4);
    });
  }

  private createShards() {
    this.shards = this.physics.add.staticGroup();
    LEVEL_BLUEPRINT.shards.forEach(([x,y], i) => {
      const shard = this.shards.create(x, y, 'shard') as Phaser.Physics.Arcade.Sprite;
      shard.setData('baseY', y).setData('phase', i * .55).setDepth(5);
    });
  }

  private createCheckpointAndGoal() {
    LEVEL_BLUEPRINT.checkpoints.forEach(x => {
      const relay = this.add.rectangle(x, 424, 18, 88, 0x516a62).setStrokeStyle(2, 0xd4a258).setDepth(3);
      relay.setData('checkpoint', true);
      this.physics.add.existing(relay, true);
      this.physics.add.overlap(this.player, relay, () => this.activateCheckpoint(relay, x - 30));
    });
    const goal = this.add.rectangle(LEVEL_BLUEPRINT.goalX, 370, 70, 196, 0x243b35).setStrokeStyle(4, 0xe0a85a).setDepth(3);
    this.add.circle(LEVEL_BLUEPRINT.goalX, 340, 21, 0xe0a85a, .85).setDepth(4);
    goal.setData('goal', true);
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.player, goal, () => this.win());
  }

  private bindInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,D,E,R,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-E', () => this.toggleRecording());
    this.input.keyboard!.on('keydown-R', () => this.restart());
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause());
  }

  private bindPhysics() {
    this.physics.add.collider(this.player, this.platforms, (_player, object) => {
      if ((object as Phaser.GameObjects.GameObject).getData('hazard')) this.hurtPlayer();
    });
    this.physics.add.collider(this.enemies, this.platforms);
    if (this.lift) this.physics.add.collider(this.player, this.lift.platform);
    this.physics.add.collider(this.player, this.enemies, (playerObject, enemyObject) => {
      const player = playerObject as Phaser.Physics.Arcade.Sprite;
      const enemy = enemyObject as Phaser.Physics.Arcade.Sprite;
      const playerBody = player.body as Phaser.Physics.Arcade.Body;
      const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;
      if (!enemy.getData('alive')) return;
      const stompedFromAbove = playerBody.deltaY() > 0 && playerBody.bottom <= enemyBody.center.y + 10;
      if (stompedFromAbove) {
        enemy.setData('alive', false).disableBody(true, true);
        player.setVelocityY(-330);
        audio.play('stomp');
        this.cameras.main.shake(80, .003);
      } else this.hurtPlayer();
    });
    this.physics.add.overlap(this.player, this.shards, (_p, shardObject) => {
      const shard = shardObject as Phaser.Physics.Arcade.Sprite;
      shard.disableBody(true, true);
      this.shardsFound += 1;
      audio.play('shard');
      ui.shard.textContent = `${this.shardsFound} / ${TOTAL_SHARDS}`;
      this.tweens.add({ targets: ui.shard, scale: 1.16, duration: 90, yoyo: true });
    });
  }

  update(time: number, delta: number) {
    const cameraX = this.cameras.main.scrollX;
    this.parallaxLayers.forEach(layer => {
      const offset = -(cameraX * layer.rate % layer.width);
      layer.images[0].x = offset;
      layer.images[1].x = offset + layer.width;
    });
    if (!this.gameStarted || this.gameEnded || this.paused) return;
    this.runElapsedMs += delta;
    const timerTick = Math.floor(this.runElapsedMs / 100);
    if (timerTick !== this.lastTimerTick) {
      this.lastTimerTick = timerTick;
      ui.timer.textContent = formatRunTime(this.runElapsedMs);
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.keys.W) || Phaser.Input.Keyboard.JustDown(this.cursors.up);
    const grounded = body.blocked.down || body.touching.down;
    if (grounded) this.lastGroundedAt = time;
    if (jumpPressed) this.jumpQueuedAt = time;

    if (left) { this.player.setAccelerationX(-950); this.player.setFlipX(true); }
    else if (right) { this.player.setAccelerationX(950); this.player.setFlipX(false); }
    else this.player.setAccelerationX(0);

    if (time - this.jumpQueuedAt <= 120 && time - this.lastGroundedAt <= 110) {
      this.player.setVelocityY(-465);
      audio.play('jump');
      this.jumpQueuedAt = Number.NEGATIVE_INFINITY;
      this.lastGroundedAt = Number.NEGATIVE_INFINITY;
    }
    const jumpReleased = Phaser.Input.Keyboard.JustUp(this.cursors.space) || Phaser.Input.Keyboard.JustUp(this.keys.W) || Phaser.Input.Keyboard.JustUp(this.cursors.up);
    if (jumpReleased && body.velocity.y < -190) this.player.setVelocityY(body.velocity.y * .58);
    if (grounded && !this.wasGrounded) audio.play('land');
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
    this.updateEcho(time);
    this.updateGates();
    this.updateLift();
    this.updateEnemies();
    this.updateShards(time);

    if (this.player.x > 1180 && this.player.x < 1330) this.hintOnce('echo', 'Record a still echo on the plate, then cross before its timeline ends.');
    if (this.player.x > 2500 && this.player.x < 2660) this.hintOnce('lift', 'The brass circuit powers the lift only while you or your echo holds it.');
    if (this.player.x > 4100 && this.player.x < 4240) this.hintOnce('shutters', 'One sustained echo can hold all three shutters open.');
    if (this.player.x > 5400 && this.player.x < 5510) this.hintOnce('dual', 'Leave an echo on the first lock, then touch the second. The vault will stay open.');
  }

  private updatePlayerAnimation(grounded: boolean, moving: boolean) {
    if (this.time.now < this.invulnerableUntil) {
      this.player.play('courier-hurt', true);
      return;
    }
    if (!grounded) {
      this.player.play('courier-jump', true);
      return;
    }
    if (this.recording && !moving) {
      this.player.play('courier-record', true);
      return;
    }
    this.player.play(moving ? 'courier-run' : 'courier-idle', true);
  }

  private updateEnemies() {
    this.enemies.children.iterate(child => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return true;
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      if (body.blocked.left) enemy.setVelocityX(70);
      if (body.blocked.right) enemy.setVelocityX(-70);
      enemy.setFlipX(body.velocity.x > 0);
      return true;
    });
  }

  private updateShards(time: number) {
    this.shards.children.iterate(child => {
      const shard = child as Phaser.Physics.Arcade.Sprite;
      if (!shard.active) return true;
      shard.setAngle((time / 25 + shard.getData('phase') * 50) % 360);
      shard.y = shard.getData('baseY') + Math.sin(time / 350 + shard.getData('phase')) * 5;
      shard.refreshBody();
      return true;
    });
  }

  private toggleRecording() {
    if (!this.gameStarted || this.gameEnded || this.paused) return;
    if (this.recording) { this.finishRecording(); return; }
    this.playingEcho = false;
    this.echo?.destroy();
    this.echoFrames = [];
    this.recording = true;
    this.recordStarted = this.time.now;
    audio.play('record');
    this.player.setTint(0xe8bd7c);
    ui.echo.textContent = 'RECORDING';
    this.showMessage('Recording timeline. Press E to release the echo.', 1800);
  }

  private finishRecording() {
    if (!this.recording || this.echoFrames.length < 2) return;
    this.recording = false;
    this.player.clearTint();
    this.playingEcho = true;
    this.playbackStarted = this.time.now;
    const first = this.echoFrames[0];
    this.echo = this.add.sprite(first.x, first.y, 'courier').setOrigin(.5, .90625).setScale(.42).setAlpha(.5).setTint(0x8dc9bd).setDepth(6).play('courier-idle');
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
      this.tweens.add({ targets: this.echo, alpha: 0, duration: 380, onComplete: () => this.echo?.destroy() });
      return;
    }
    const sample = sampleEchoFrame(this.echoFrames, elapsed);
    if (sample) {
      const moving = Math.abs(sample.x - this.echo.x) > .35;
      this.echo.setPosition(sample.x, sample.y).setFlipX(sample.flipX).play(moving ? 'courier-run' : 'courier-idle', true);
    }
  }

  private updateGates() {
    this.gates.forEach(gate => {
      const plateStates = gate.plates.map(plate => this.isPlateActive(plate));
      const activated = gate.requireAll ? plateStates.every(Boolean) : plateStates.some(Boolean);
      const shouldOpen = gate.latchesOpen ? gate.open || activated : activated;
      gate.plates.forEach((plate, index) => plate.setFillStyle(plateStates[index] ? 0xe0a85a : 0xb68247));
      if (shouldOpen === gate.open) return;
      gate.open = shouldOpen;
      audio.play(shouldOpen ? 'plate' : 'gate');
      gate.bodies.forEach(barrier => {
        const body = barrier.body.body as Phaser.Physics.Arcade.StaticBody;
        body.enable = false;
        this.tweens.killTweensOf(barrier.body);
        this.tweens.add({
          targets: barrier.body,
          y: shouldOpen ? barrier.openY : barrier.closedY,
          alpha: shouldOpen ? .2 : 1,
          duration: shouldOpen ? 320 : 220,
          ease: shouldOpen ? 'Cubic.Out' : 'Cubic.In',
          onComplete: () => {
            body.updateFromGameObject();
            body.enable = !shouldOpen;
          },
        });
      });
    });
  }

  private isPlateActive(plate: Phaser.GameObjects.Rectangle) {
    const playerOn = Phaser.Geom.Rectangle.Overlaps(this.player.getBounds(), plate.getBounds());
    const echoOn = !!this.echo?.active && Phaser.Geom.Rectangle.Overlaps(this.echo.getBounds(), plate.getBounds());
    return playerOn || echoOn;
  }

  private updateLift() {
    if (!this.lift) return;
    const active = this.isPlateActive(this.lift.plate);
    const body = this.lift.platform.body as Phaser.Physics.Arcade.Body;
    if (active !== this.lift.powered) {
      this.lift.powered = active;
      this.lift.plate.setFillStyle(active ? 0xe0a85a : 0xb68247);
      audio.play(active ? 'plate' : 'gate');
    }
    if (active) {
      if (this.lift.platform.x >= this.lift.endX) this.lift.direction = -1;
      if (this.lift.platform.x <= this.lift.startX) this.lift.direction = 1;
      body.setVelocityX(140 * this.lift.direction);
      return;
    }
    if (Math.abs(this.lift.platform.x - this.lift.startX) < 4) {
      this.lift.platform.x = this.lift.startX;
      body.setVelocityX(0);
    } else body.setVelocityX(this.lift.platform.x > this.lift.startX ? -110 : 110);
  }

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
    ui.resultEyebrow.textContent = 'TIME CORE DELIVERED';
    const rank = completionRank(this.shardsFound, this.runElapsedMs);
    const previousBest = this.readBestTime();
    const isBest = previousBest === undefined || this.runElapsedMs < previousBest;
    if (isBest) this.writeBestTime(this.runElapsedMs);
    const best = isBest ? this.runElapsedMs : previousBest;
    ui.resultTitle.textContent = `Rank ${rank} — The city remembers.`;
    ui.resultCopy.textContent = `Run ${formatRunTime(this.runElapsedMs, true)} · ${this.shardsFound}/${TOTAL_SHARDS} shards · Best ${formatRunTime(best ?? this.runElapsedMs, true)}${isBest ? ' · New record' : ''}`;
    ui.result.classList.remove('hidden');
  }

  private readBestTime(): number | undefined {
    try {
      const value = window.localStorage.getItem('echofall-best-time');
      if (!value) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private writeBestTime(milliseconds: number) {
    try {
      window.localStorage.setItem('echofall-best-time', String(Math.round(milliseconds)));
    } catch {
      // A completed run still works when browser storage is unavailable.
    }
  }

  private hintOnce(id: string, text: string) {
    if (this.lastHint === id) return;
    this.lastHint = id;
    this.showMessage(text, 3500);
  }

  private showMessage(text: string, duration: number) {
    ui.message.textContent = text;
    ui.message.classList.add('visible');
    this.messageTimer?.remove(false);
    this.messageTimer = this.time.delayedCall(duration, () => ui.message.classList.remove('visible'));
  }

  startGame() {
    audio.start();
    this.hasEverStarted = true;
    this.gameStarted = true;
    ui.start.classList.add('hidden');
    this.scene.resume();
  }

  private togglePause() {
    if (!this.gameStarted || this.gameEnded) return;
    this.paused = !this.paused;
    this.physics.world.isPaused = this.paused;
    ui.pause.classList.toggle('hidden', !this.paused);
  }

  restart() {
    ui.result.classList.add('hidden');
    ui.pause.classList.add('hidden');
    ui.message.classList.remove('visible');
    ui.shard.textContent = `0 / ${TOTAL_SHARDS}`;
    ui.echo.textContent = 'READY';
    ui.checkpoint.textContent = 'OFFLINE';
    this.scene.restart();
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  parent: 'game',
  backgroundColor: '#182422',
  pixelArt: true,
  audio: { noAudio: true },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1050 }, debug: false } },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: GameScene,
});

if (import.meta.env.DEV) {
  (window as typeof window & { __echofall?: Phaser.Game }).__echofall = game;
}

document.querySelector('#start-button')!.addEventListener('click', () => (game.scene.getScene('game') as GameScene).startGame());
document.querySelector('#restart-button')!.addEventListener('click', () => (game.scene.getScene('game') as GameScene).restart());
ui.sound.addEventListener('click', () => {
  audio.start();
  const muted = audio.toggleMuted();
  ui.sound.textContent = muted ? 'AUDIO OFF' : 'AUDIO ON';
});
