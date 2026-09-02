# Agent Handoff

## Product Summary

**Echofall: Clockwork Run** is an original Malaysian-themed 2D platformer. The current MVP contains one 7,800-pixel level built around a seven-second Time Echo. The player records their movement, releases a translucent replay, and uses that replay to operate pressure plates while continuing through the level.

Do not introduce a double jump. The intended movement uses a single jump, 110 ms of coyote time, and a 120 ms jump buffer.

## Stack

- Phaser 3 with Arcade Physics
- TypeScript
- Vite
- Vitest
- Browser Web Audio API for procedural sound
- Static hosting with no backend

## Commands

```bash
npm run dev      # local Vite server
npm test         # isolated logic and level-layout tests
npm run build    # TypeScript check and production bundle
npm run preview  # serve the production build locally
```

## Controls

| Action | Input |
| --- | --- |
| Move | `A`/`D` or Left/Right |
| Jump | `Space`, `W`, or Up |
| Start/release recording | `E` |
| Pause | `Escape` |
| Restart | `R` |
| Mute/unmute | HUD button |

## Core Mechanics

### Movement

The player accelerates horizontally, has ground friction, a maximum horizontal speed of 300, and a single variable-height jump. Releasing jump early reduces upward velocity. There is no double jump.

### Time Echo

- Pressing `E` begins recording position and facing direction.
- The recording lasts up to `7,000 ms`; pressing `E` again releases it early.
- Playback creates one translucent copy following the recorded path.
- Starting another recording replaces the previous echo.
- Both the player and active echo can trigger brass pressure plates.
- Recording/playback implementation: `src/main.ts`.
- Frame interpolation: `src/echo.ts`.

For a stationary echo, begin recording while standing on a plate, remain there for the desired hold time, and release the recording. The replay will repeat that stationary position for the recorded duration.

### Gates and Echo Encounters

1. **Echo door:** plate at `x=1400`, gate at `x=2050`. A single plate temporarily opens the gate.
2. **Powered lift:** plate at `x=2700`; the lift travels between `x=3020` and `x=3370` while powered.
3. **Shutter run:** plate at `x=4280`; it temporarily opens gates at `x=4560`, `4820`, and `5080` together.
4. **Dual-lock vault:** plates at `x=5520` and `x=6460`, gate at `x=6800`. Both plates must be active simultaneously once. After successful activation, this final gate permanently latches open so the player can leave the second plate and proceed.

Gate barriers are full-height and have ceiling caps. Keep ordinary platforms at least `120px` away from gate centers; `src/level.test.ts` checks this clearance.

### Enemies and Hazards

- Crawlers patrol horizontally and reverse against solid geometry.
- Landing on a crawler while descending kills it and bounces the player upward.
- Side contact damages the player.
- Spikes damage the player.
- Damage returns the player to the most recent checkpoint and grants a short invulnerability window.

### Progression

- Four checkpoints update the respawn position.
- Eighteen optional memory shards are distributed through the level.
- The HUD tracks shards, elapsed time, echo state, checkpoint state, and audio state.
- Reaching the vault at `x=7650` completes the run.
- Completion rank depends on time and shard count.
- Best time is stored in `localStorage`.

## Level Data

Static geometry and item placement live in `src/level.ts` under `LEVEL_BLUEPRINT`:

- `floorSegments`: ground spans
- `platforms`: elevated platform center, height, and width
- `hazards`: spike start position and count
- `enemies`: crawler spawn coordinates
- `shards`: collectible coordinates
- `checkpoints`: checkpoint x-coordinates
- `gateXs`: gate centers used by clearance tests
- `goalX`: final vault position

The Phaser world uses a design height of `540px`, ground center at `y=486`, and world width of `7,800px`. Platform coordinates are center-based.

## Visual System

The Malaysian environment uses three supplied PNG layers:

- `public/assets/malaysia-skyline.png`: distant Kuala Lumpur skyline
- `public/assets/malaysia-midground.png`: architecture and clockwork city
- `public/assets/malaysia-foreground.png`: tropical foliage and machinery

`drawWorld()` creates paired copies of every image and wraps them manually. Do not replace these with Phaser `TileSprite`: the non-power-of-two source dimensions produced blank seams during testing. The three camera rates are `0.08`, `0.24`, and `0.46`.

The dark abyss beneath the ground is camera-fixed and intentionally oversized to cover wide and tall responsive canvases. It must not be added to the parallax update loop.

The courier source is `public/assets/kite-sprite-source.png`. `buildCourierAtlas()` uses hand-authored source regions because the generated sheet does not have a uniform grid. Preserve the player scale of `0.42` and the single-frame idle pose unless replacement artwork is deliberately re-authored.

## Audio

`src/audio.ts` synthesizes all audio at runtime. It provides ambience plus cues for steps, jump, landing, shards, stomps, damage, recording, echo release, plates, gates, checkpoints, and victory. No external audio files are required.

Phaser audio is disabled intentionally. `AudioDirector.start()` creates/resumes Web Audio only after a user gesture. Preserve that behavior to avoid autoplay failures.

## Code Map

- `src/main.ts`: scene lifecycle, rendering, player controls, collisions, echo devices, checkpoints, victory, and DOM integration
- `src/level.ts`: level geometry and gate-clearance validation
- `src/echo.ts`: pure echo-frame interpolation
- `src/progress.ts`: time formatting, ranks, and best-time parsing
- `src/audio.ts`: procedural audio engine
- `src/style.css`: responsive application shell and overlays
- `index.html`: HUD, start/pause/result overlays, and controls legend

## Deployment

`vite.config.ts` sets `base: './'`, and Phaser assets use relative `assets/...` URLs. This allows the contents of `dist/` to run from a GitHub Pages repository subpath.

A deployment workflow has not been added yet. Before publishing, add a GitHub Actions Pages workflow that runs `npm ci` and `npm run build`, then uploads `dist/` as the Pages artifact.

## Change Checklist

1. Keep the no-double-jump rule and seven-second echo unless the product requirement changes.
2. Update `LEVEL_BLUEPRINT` instead of scattering new platform coordinates through scene code.
3. Add every new gate center to `gateXs` so clearance tests cover it.
4. Preserve relative asset URLs for GitHub Pages.
5. Check wide and mobile viewports after rendering changes.
6. Run `npm test` and `npm run build` before handoff.
7. Manually verify the affected encounter in a browser; canvas gameplay is not covered by DOM-only tests.
