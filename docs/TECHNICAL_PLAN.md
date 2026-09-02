# Technical Plan

## Stack

- Phaser 3 and Arcade Physics
- TypeScript
- Vite
- Vitest for isolated rule tests as logic is extracted
- Static deployment; no backend or database
- Relative Vite asset paths for GitHub Pages compatibility

## Architecture

The MVP uses one Phaser game scene for level state and a small DOM shell for menus and status. Runtime textures are generated with Phaser Graphics so the game is self-contained and legally distinct.

The level spans 7,800 pixels and is divided into arrival, echo-door, powered-lift, shutter-run, dual-lock, and vault zones. Puzzle gates use full-height barriers and reserved clearance areas so traversal platforms cannot bypass them.

Sound is generated through the browser Web Audio API after the first user gesture. Each gameplay event has a distinct synthesized cue, while the low-volume clockwork ambience runs independently of Phaser's disabled audio subsystem.

## Input

- `A/D` or arrow keys: move
- `Space`, `W`, or Up: jump
- `E`: start or release Time Echo recording
- `Escape`: pause
- `R`: restart

## Time Echo

The game samples player position and facing during a recording window capped at six seconds. Releasing the recording creates one translucent replay. Pressure plates accept overlap from either the player or the active echo. Starting a new recording replaces the previous echo.

## Delivery Sequence

1. Foundation and scene flow
2. Movement, physics, camera, and collision
3. Enemies, hazards, collectibles, checkpoint, and finish
4. Time Echo recording, playback, and gates
5. Presentation, responsive shell, testing, and deployment build
