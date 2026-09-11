# Agent Handoff

## Product Summary

**Echofall: Clockwork Run** is an original Malaysian-themed 2D platformer built around a seven-second Time Echo. The game now ships **four data-driven chapters** — Arrival Gate, Batu Caverns, Tea Terraces, and Merdeka Ascent — plus full touch/mobile support.

Do not introduce a double jump. The intended movement uses a single jump, 110 ms of coyote time, and a 120 ms jump buffer.

## Stack

- Phaser 3 with Arcade Physics (`Phaser.Scale.FIT`, 960×540 design resolution)
- TypeScript, Vite, Vitest
- Browser Web Audio API for procedural sound (no audio files)
- Static hosting with no backend; relative asset URLs for GitHub Pages

## Commands

```bash
npm run dev      # local Vite server (allowedHosts enabled for previews)
npm test         # isolated logic and level-layout tests
npm run build    # TypeScript check and production bundle
npm run preview  # serve the production build locally
```

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | `A`/`D` or Left/Right | ◀ / ▶ pads (bottom-left) |
| Jump | `Space`, `W`, or Up | JUMP button (bottom-right) |
| Record/release echo | `E` | ECHO button |
| Throw shuriken | `F` or `X` | ★ STAR button |
| Pause | `Escape` | `II` button in the topbar |
| Restart | `R` | Pause overlay → RESTART CHAPTER |
| Fullscreen | — | `⛶` button (where supported) |

Touch controls appear automatically when `pointer: coarse` or `ontouchstart` is detected (`.touch-ui` class on `<body>`). The virtual buttons are DOM elements using pointer events with capture; multi-touch (move + jump) works.

## Core Mechanics

### Movement

Horizontal acceleration, ground friction, max speed 300, single variable-height jump (releasing early cuts velocity). Coyote time 110 ms, jump buffer 120 ms. No double jump.

### Time Echo

- `E`/ECHO starts recording position and facing for up to `7,000 ms`; pressing again releases it early.
- The replay is one translucent sprite following the recorded path (`src/echo.ts` interpolates).
- Player and echo both press plates. Starting a new recording replaces the echo.
- **Echo-only resonators** toggle when the echo passes through them; the player passes through freely.
- Smart enemies (flyer, charger, warden, spitter) target the nearest of player/echo — the echo is a decoy.
- Spitter projectiles are absorbed by the echo.

### Shuriken

`F`/`X`/★ throws a steel star in the facing direction (520 ms cooldown, 3 in flight). It kills crawlers, flyers, spitters, and chargers outright and deals 1 damage to the warden (3 to fell it). Stars shatter on platforms with a metallic clang. `cooldownReady()` in `src/devices.ts` is the tested rule.

### Puzzle devices (`DeviceSpec` in `src/level.ts`)

- `hold` — gates open while plate(s) are pressed; optional `requireAll` + `latch` + `closeDelayMs` (dual-lock vault).
- `timed` — pressing the plate opens shutters for `openMs`; barrier blinks when about to close.

Crusher feedback is proximity-based: the slam sound, camera micro-shake, dust, and shock-ring only fire within range, and the head trembles as a telegraph before dropping.
- `relay` — each touch charges a plate for `holdMs`; gate opens only while ALL plates are charged at once. Charge bars show decay.
- `sequence` — plates must be touched in `order`; numbered lamps show 1·2·3; a wrong press resets (with a buzz).
- `echoSwitch` — echo-only crystal resonators; each echo crossing toggles; its gate opens while all crystals are on.
- `guard` — gate stays shut until the linked warden enemy is felled (3 stomps).
- `lift` — plate-powered platform patrolling between `from`/`to` on `axis: 'x'|'y'`.

Pure device rules live in `src/devices.ts` and are unit-tested.

### Obstacles

Spikes; **crushers** (period-slamming columns; solid to ride, deadly when crushed); **pendulums** (swinging spike balls, damage overlap); **crumble platforms** (shake 460 ms, fall, respawn after 2.8 s); **bouncers** (spring mushrooms, −760 vy); **movers** (patrolling platforms); **wind zones** (horizontal force added to player acceleration, drifting leaf particles).

### Teaching the player

Every level carries a `hints` list. Hints fire by **proximity** (|player.x − atX| ≤ 240), not by progress, and explain each device in plain words before the player reaches it. The sequence lock additionally highlights the NEXT expected plate in pale gold and flashes its lamps red on a wrong step; echo resonators shimmer and play a dull thud when the living player touches them ("the crystal ignores the living").

### Per-chapter presentation

The original three-layer Malaysian parallax runs on every chapter — `malaysia-skyline` (rate 0.08), `malaysia-midground` (0.24), `malaysia-foreground` foliage (0.46) — palette-tinted per level. Chapter 1 (Arrival Gate) uses that stack exactly as shipped. Chapters 2–4 additionally place their generated painting (`public/assets/level-<id>.png`: crystal caverns, Cameron tea hills, dusk KL twin towers) as a far identity layer (rate 0.05, cover-fit, tinted) behind the original stack. The void below the ground is a clean banded gradient (palette abyss → near-black) with a thin brass rim — no tick marks or dots.

The audio ambience follows suit: `AudioDirector.setAmbience()` switches between city, cave (drips), highland (birds), and dusk (sparkles) profiles. The city profile plays only its drone and clockwork tick — no random clanks (they read as distant smashes). Crusher slams are strictly proximity-gated: audio within ~620 px, camera micro-shake within ~320 px, dust and shock ring within ~620 px; heads tremble as a telegraph before dropping. Wind gust zones keep their drifting leaf particles because they communicate gameplay.

### Positional audio

`AudioDirector.play(cue, { volume, pan })` accepts distance-attenuated volume and stereo pan; the scene computes both with `spatial(x)` (inaudible beyond ~900 px). Everything in the world — gates, plates, crushers, enemies, resonators, bounce mushrooms, crumbling planks — plays through it, so distant action stays quiet and panned. A looping wind bed (`AudioDirector.wind(level)`) rises inside gust zones. All cues are layered synthesis (sub thumps, band-passed whooshes, detuned metals) through a master compressor.

### Enemies (`EnemySpec` in `src/level.ts`)

- `crawler` — patrols, reverses on walls/bounds, stompable.
- `flyer` — hovers, swoops at the nearest target, returns to anchor, stompable.
- `spitter` — stationary pitcher-plant turret, fires projectiles (popped by platforms/echo), stompable.
- `charger` — patrols, windup, charges at the nearest same-level target, dizzy after impact, stompable.
- `warden` — 3-HP armoured mini-boss; chases nearest target; stomps knock it staggered; third stomp fells it and opens its guard gate.

Landing on any enemy while descending kills it (warden: damages it) and bounces the player upward. Side contact damages the player. Damage returns the player to the most recent checkpoint with a short invulnerability window.

### Progression

- Chapters unlock in order; per-chapter best time and shards persist in `localStorage` (`echofall-progress-v2`, see `src/progress.ts`).
- Ranks scale with each level's shard total and par time (`completionRank`).
- Checkpoints (ground-level only) update the respawn position. Reaching the vault completes the chapter.
- Chapter select lives on the start overlay; pause and result overlays offer resume/restart/chapter actions.

## Level Data

All geometry and placement live in `src/levels.ts` as `LEVELS: LevelBlueprint[]`:

- `floorSegments` `[centerX, width]`, `platforms` `[centerX, centerY, width]` (ground centre y = 486, top edge 468)
- `crumbles`, `movers`, `bouncers`, `windZones`, `crushers`, `pendulums` for obstacles
- `hazards` `[x, spikeCount]`, `enemies`, `shards`, `checkpoints`
- `devices` (see above), `hints` (`atX` triggered tutorial messages), `goalX`, `gateXs`
- `palette` (sky/tint/platform/stroke/moss/abyss colours per chapter) and `parMs`

A single jump clears ~100 px of height and ~230 px of flat gap; keep deliberate gaps within those limits unless a device is the intended crossing. Gate barriers are full-height; ordinary platforms must stay at least `120 px` from gate centres — `src/level.test.ts` enforces clearance, world bounds, device-gate listing, and enemy-gate spacing for every level.

## Visual System

The Malaysian environment uses three supplied PNG layers (`public/assets/malaysia-*.png`). `drawWorld()` creates paired copies of every image and wraps them manually — do not replace with `TileSprite` (non-power-of-two seams). Parallax rates: `0.08`, `0.24`, `0.46`. Each chapter tints the layers via `palette.tint` and re-colours geometry via `palette`.

The courier source is `public/assets/kite-sprite-source.png`. `buildCourierAtlas()` uses hand-authored source regions; keep the player scale of `0.42` unless replacing artwork deliberately.

## Audio

`src/audio.ts` synthesizes all audio at runtime after the first user gesture (autoplay-safe). Cues cover movement, echo, plates, gates, checkpoints, victory, plus new ones: bounce, crumble, toggle, chime (resonator), shoot, pop, slam (crusher/warden), good/bad (sequence), unlock. Phaser audio stays disabled (`audio: { noAudio: true }`).

## Code Map

- `src/main.ts` — scene: level builder, devices, enemies, obstacles, echo, input (keyboard + touch state), flow, DOM wiring
- `src/levels.ts` — the four chapter blueprints
- `src/level.ts` — level types, gate-clearance validation, static checks
- `src/devices.ts` — pure device rules (hold/timed/relay/sequence/echo-switch)
- `src/echo.ts` — pure echo-frame interpolation
- `src/progress.ts` — time formatting, ranks, progress persistence
- `src/audio.ts` — procedural audio engine
- `src/style.css` — responsive shell, overlays, touch controls, safe-area handling
- `index.html` — HUD, chapter select, start/pause/result overlays, touch controls, rotate hint

## Deployment

`vite.config.ts` sets `base: './'`, `server.allowedHosts: true` (preview proxies), and `es2022`. `.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on pushes to `main`.

## Change Checklist

1. Keep the no-double-jump rule and seven-second echo unless the product requirement changes.
2. Add new content to `LEVELS` in `src/levels.ts` — never scatter coordinates through scene code.
3. List every device gate in the level's `gateXs`; clearance and sanity tests fail otherwise.
4. Keep checkpoints on ground-level spans (respawn assumes ground top y = 468).
5. Preserve relative asset URLs for GitHub Pages.
6. Check wide, narrow, and mobile (coarse-pointer) viewports after rendering changes.
7. Run `npm test` and `npm run build` before handoff; manually verify affected encounters in a browser.
