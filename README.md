# Echofall: Clockwork Run

An original Malaysian-themed 2D platformer built with Phaser, TypeScript, and Vite. A courier automaton carries the last time core through four chapters of an overgrown clockwork Malaysia — recording its movement and replaying it as a **Time Echo** that holds pressure plates, flips resonator crystals, powers lifts, and decoys enemies.

## Highlights

- **Four chapters** — Arrival Gate, Batu Caverns, Tea Terraces, and the Merdeka Ascent, each with its own palette, devices, and fauna.
- **Time Echo** — record up to 7 seconds of movement, release the replay, and use it to hold plates, trigger echo-only resonators, power lifts, absorb spitter shots, and lure hunters.
- **Puzzle devices** — hold plates, timed shutters, decaying relay chains, sequence locks, echo resonators, warden guard gates, and plate-powered horizontal/vertical lifts.
- **Obstacles** — spike beds, slam crushers, pendulum bombs, collapsing planks, spring mushrooms, drifting platforms, and highland wind zones.
- **Five enemies** — crawlers, kite flyers, pitcher-plant spitters, charger boars, and the three-stomp Warden mini-boss. Flyers, chargers, wardens, and spitters all hunt the nearest automaton — the echo counts.
- **Mobile-first** — on-screen touch controls, FIT scaling for any screen, fullscreen support, safe-area padding, and automatic pause on tab switch. Keyboard play still works everywhere.

## Run Locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Audio starts after the first button press, as required by browser autoplay policies. On a phone, open the dev URL over the network or deploy; the touch controls appear automatically on coarse-pointer devices.

## Verify

```bash
npm test         # level geometry, device rules, echo sampling, progress persistence
npm run build    # TypeScript check and production bundle
```

The production output is written to `dist/`. Vite uses relative asset paths and allows any preview host so the build can be hosted from a GitHub Pages repository path.

## Documentation

- [MVP scope](docs/MVP.md)
- [Technical plan](docs/TECHNICAL_PLAN.md)
- [Agent handoff and gameplay mechanics](docs/AGENT_HANDOFF.md)
