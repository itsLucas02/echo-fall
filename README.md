# Echofall: Clockwork Run

A single-level 2D platformer built with Phaser, TypeScript, and Vite. Its central mechanic records the player's movement and replays it as a Time Echo that can operate pressure plates.

## Run Locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Audio starts after the player presses **Begin the Run**, as required by browser autoplay policies.

## Verify

```bash
npm test
npm run build
```

The production output is written to `dist/`. Vite uses relative asset paths so the build can be hosted below a GitHub Pages repository path.

## Documentation

- [MVP scope](docs/MVP.md)
- [Technical plan](docs/TECHNICAL_PLAN.md)
- [Agent handoff and gameplay mechanics](docs/AGENT_HANDOFF.md)
