# Parallax Art Pipeline

Status of the layered background art, the responsive layout that sizes it, the
image-generation prompts used to create it, and the follow-up work. Written so a
future agent can continue or **scale the art to new chapters** without
re-deriving anything.

> Branch: `fix/zoom-centered-bands`
> Commits: `8d9be0d` (responsive layout), `82ef6c7` (centered band + abyss fix),
> `4106869` (edge fades), `cae9915` (generated art), `f9b3690` (mirror tiling).

---

## 1. Where we are

- The game renders at **native resolution** with an **adaptive camera zoom** and a
  **vertically centered 540px play band** (`Phaser.Scale.RESIZE`). This supersedes
  the `Phaser.Scale.FIT` note in `AGENT_HANDOFF.md` on this branch.
- **Batu Caverns**, **Tea Terraces**, and **Merdeka Ascent** each have their own
  unique generated art stack: one opaque background + three transparent parallax
  layers (far / mid / foreground foliage).
- **Arrival Gate keeps the original Malaysian stack** (`malaysia-*.png`,
  palette-tinted) as the template.
- No image or component is shared between chapters; every chapter is unique.

---

## 2. Asset inventory & naming

| Chapter | id | Files (`public/assets/`) | Prompt section |
| --- | --- | --- | --- |
| Batu Caverns | `caverns` | `caverns-bg/far/mid/near.webp` | Section 4.1 |
| Tea Terraces | `terraces` | `terraces-bg/far/mid/near.webp` | Section 4.2 |
| Merdeka Ascent | `ascent` | `ascent-bg/far/mid/near.webp` | Section 4.3 |
| Arrival Gate | `arrival` | `malaysia-skyline/midground/foreground.webp` | original art |

- `-bg` = opaque full scene (no alpha).
- `-far` / `-mid` / `-near` = images with a **transparent** background; elements
  sit in the lower ~70% so upper areas reveal the layers behind.
- **Compressed:** all background/parallax art is **WebP (q82), downscaled to
  720px tall** (~37 MB PNG -> ~3.5 MB total). Source PNGs are recoverable from
  git history.
- **Loaded lazily per chapter:** `preload()` loads only the current chapter's
  four layers (plus the Malaysian stack for Arrival). Textures already resident
  are skipped, so switching chapters never re-downloads.

Naming rule for new chapters: `<chapterId>-{bg,far,mid,near}.webp`, registered in
`preload()` in `src/main.ts`.

Painted background/parallax textures are set to **LINEAR** filtering in
`drawWorld()` (sprites keep nearest-neighbour pixel-art filtering) so the scaled
art stays smooth rather than blocky.

---

## 3. Engine integration spec

Lives in `src/main.ts`: `drawWorld`, `applyResponsiveLayout`, `layoutParallax`,
`positionParallax`, `redrawSky`, `redrawFade`.

### 3.1 Responsive layout (camera)

```
ZOOM_STEPS = [1, 0.8, 2/3, 0.5]   MIN_ZOOM = 0.5
fitZoom    = clamp(scale.height / 540, MIN_ZOOM, 1)
zoom       = largest ZOOM_STEP <= fitZoom     // never upscales beyond 1:1
bandOffset = max(0, (scale.height / zoom - 540) / 2)   // centers the band
camera.setZoom(zoom)
camera.setBounds(0, -bandOffset, worldWidth, 540)
```

- Tall viewports: `zoom = 1`, spare space split equally into a **sky band** above
  and an **underground band** below.
- Short viewports: downscaled (e.g. 0.8) so the whole band fits.
- Re-layout runs on a debounced `scale.on('resize')`.

### 3.2 Layer stack

| Layer | rate | depth | scale | alpha | tint | mirror |
| --- | --- | --- | --- | --- | --- | --- |
| generated `-bg` | .05 | -35 | `540 / nativeHeight` | 1 | none | yes |
| generated `-far` | .08 | -30 | `540 / nativeHeight` | 1 | none | yes |
| generated `-mid` | .24 | -20 | `540 / nativeHeight` | 1 | none | yes |
| generated `-near` | .46 | +0.5 | `540 / nativeHeight` | 1 | none | yes |
| arrival `malaysia-skyline` | .08 | -30 | `540 / 724` | 1 | `palette.tint` | no |
| arrival `malaysia-midground` | .24 | -20 | `540 / 724` | .88 | `palette.tint` | no |
| arrival `malaysia-foreground` | .46 | +0.5 | `540 / 724` | .82 | `palette.tint` | no |

- Layers are `scrollFactor(0)` and positioned in screen space with a zoom-correct
  inverse transform (`o = origin + (screen - origin) / zoom`) so they stay pinned
  to the viewport as the camera zooms.
- **Mirror tiling:** generated source art is not perfectly seamless (edge match
  can differ by up to ~80/255), so tiles alternate `flipX`; a flipped tile's left
  edge equals the original right edge, so edges always meet. Arrival's original
  stack tiles normally.
- Generated art is full colour, so **no tint**. Only Arrival is palette-tinted.

### 3.3 Backgrounds behind/around the band

- **Sky:** `redrawSky()` fills the space above the band with a `skyTop -> skyBottom`
  vertical gradient (`fillGradientStyle`).
- **Edge fades:** `redrawFade()` overlays a short gradient at the band top
  (`skyBottom`, opaque -> transparent downward) and bottom (`abyss`,
  transparent -> opaque downward) so the art dissolves instead of a hard line.
  `fadeScreen = min(120, bandHeight * 0.22)`.
- **Abyss:** `drawWorld()` draws a world-space gradient below `GROUND_Y`.
  WARNING: do **not** use `Phaser.Display.Color.darken()`; it is HSV-value based
  and wraps for very dark colours (`#050c10 -> #193d51` blue, `#0c0916 -> #342e3b`
  purple). Scale RGB directly (see `shade()` in `drawWorld`).

### 3.4 Pitfalls encountered (do not reintroduce)

- Sprite-vs-group physics callbacks receive the **sprite first, group member
  second**; the projectile overlap was destroying the player.
- Destroying objects inside `Set.iterate` corrupts iteration; iterate a `.slice()`
  snapshot instead.
- Two `immovable` bodies never separate in Arcade physics; ground enemies must not
  be `immovable`.

---

## 4. Prompt kit (verbatim)

### 4.0 Shared rules (include in every generated-art prompt)

```
World: dystopian far-future Malaysia - Kuala Lumpur/its surrounds reclaimed by
tropical jungle after humanity faded; abandoned, overgrown, humid, misty;
painterly digital matte painting, cinematic, soft volumetric light, muted
desaturated palette.
Negatives: no people, no text, no watermark, no logos, no UI, no frame/border.
Seamless: horizontally tileable - left and right edges match exactly.
Composition: wide panorama; horizon low; base of the art at the bottom; keep
critical detail out of the top/bottom 15% (crop-safe).
Transparency: layers 2-4 are PNGs with a transparent background (elements only).
If transparency isn't possible, render on flat pure-magenta #FF00FF with no
gradients/shadows so it can be keyed.
Size: min 1792x1024 (16:9); prefer wider (21:9 2560x1080 or 4:1 3072x768).
```

Each prompt below is **self-contained** (the shared rules are inline), so it can
be handed to a separate generator agent as-is. The engine mirror-tiles, so minor
seam imperfection is tolerated.

### 4.1 Level 2 - BATU CAVERNS (dark blue-grey, bioluminescent teal, damp)

**2.1 - Background (opaque, full scene)**
```
Painterly digital matte painting, cinematic, highly detailed. Setting: the Batu Caves of Malaysia, far-future dystopian - a vast limestone cavern interior reclaimed by jungle, humanity long gone. Distant cathedral-sized cave chamber vanishing into mist; shafts of pale light from ceiling breaches; damp teal bioluminescence glowing on wet rock; hanging vines and roots tearing through the ceiling; ruined Hindu temple structures far in the background, overgrown. Muted desaturated dark blue-grey palette with teal accents; soft volumetric light, atmospheric depth. Wide panorama, horizon low, base at the bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly for seamless repetition. Full opaque scene (no transparency). Minimum 1792x1024, prefer wider (2560x1080 or 3072x768). No people, no text, watermark, logo, UI or border.
```

**2.2 - Parallax: distant skyline (transparent)**
```
Painterly digital matte painting silhouette layer, cinematic, highly detailed. Setting: dystopian overgrown Batu Caves, Malaysia. DISTANT background silhouette only: cave formations, stalactite/stalagmite columns, the giant Lord Murugan statue and the rainbow staircase in silhouette, ruined temple arches, faint teal backlight and mist. Elements sit in the lower ~70% of the frame; top ~30% empty transparent. Muted desaturated dark blue-grey/teal. Wide panorama, base at the bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with a TRANSPARENT background (elements only); if transparency is unsupported, use a flat pure-magenta #FF00FF background with no shadows/gradients so it can be keyed. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

**2.3 - Mid layer, diverse (transparent)**
```
Painterly digital matte painting mid-distance layer, cinematic, highly detailed. Setting: dystopian overgrown Batu Caves, Malaysia. MID-DISTANCE scene elements - diverse, not only machinery: limestone pillars, the broken rainbow staircase, small shrine stalls and hanging lanterns, incense smoke, a rusted brass clockwork waterwheel, a ruined rail/rope bridge crossing the cavern, moss-covered statues, scattered abandoned offering baskets. Elements sit in the lower ~70% of the frame; top ~30% empty transparent. Muted dark blue-grey/teal palette. Wide panorama, base at bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

**2.4 - Foreground foliage (transparent)**
```
Painterly digital matte painting foreground foliage layer, cinematic, highly detailed. Near-camera tropical undergrowth framing the bottom of the scene: huge ferns, moss-covered rocks, hanging vines and roots, carnivorous pitcher plants, glowing fungi, broad monstera and banana leaves, wet dripping leaves. Muted dark blue-grey/teal palette with faint teal bioluminescence. Occupies the bottom ~40% of the frame; upper area transparent. VERY wide panorama, base at the bottom, top 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

### 4.2 Level 3 - TEA TERRACES (overcast green, misty, soft light)

**3.1 - Background (opaque, full scene)**
```
Painterly digital matte painting, cinematic, highly detailed. Setting: the Cameron Highlands of Malaysia, far-future dystopian - terraced tea highlands reclaimed by jungle, humanity gone. Distant rolling ridges fading into heavy mist; layered tea terraces; faint abandoned colonial resort bungalows on far hills; soft overcast sky. Muted desaturated pale-green palette; soft diffuse light, deep atmospheric perspective. Wide panorama, horizon low, base at bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. Full opaque scene (no transparency). Minimum 1792x1024, prefer wider (2560x1080 or 3072x768). No people, no text, watermark, logo, UI or border.
```

**3.2 - Parallax: distant skyline (transparent)**
```
Painterly digital matte painting silhouette layer, cinematic, highly detailed. Setting: dystopian overgrown Cameron Highlands, Malaysia. DISTANT silhouettes only: layered highland ridge lines with terraced contours, an abandoned colonial clock tower and bungalow silhouettes, misty mountain layers. Elements in the lower ~70%; top ~30% empty transparent. Muted desaturated pale green. Wide panorama, base at bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

**3.3 - Mid layer, diverse (transparent)**
```
Painterly digital matte painting mid-distance layer, cinematic, highly detailed. Setting: dystopian overgrown Cameron Highlands, Malaysia. MID-DISTANCE elements - diverse, not only machinery: contouring rows of overgrown tea bushes, a rusted brass clockwork waterwheel, an abandoned colonial bungalow, dense bamboo groves, wooden tea-processing sheds, weathered fences and a footbridge, faded hand-painted signage, wildflowers among the rows. Elements in the lower ~70%; top ~30% empty transparent. Muted pale-green palette. Wide panorama, base at bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

**3.4 - Foreground foliage (transparent)**
```
Painterly digital matte painting foreground foliage layer, cinematic, highly detailed. Near-camera highland undergrowth framing the bottom: overgrown tea bushes, large ferns, broad tropical leaves, tall wind-blown grass, wildflowers, creeping vines and moss. Muted pale-green palette, soft overcast light. Occupies the bottom ~40%; upper area transparent. VERY wide panorama, base at bottom, top 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

### 4.3 Level 4 - MERDEKA ASCENT (purple-magenta dusk, dramatic)

**4.1 - Background (opaque, full scene)**
```
Painterly digital matte painting, cinematic, highly detailed. Setting: Kuala Lumpur at dusk, far-future dystopian, humanity gone, the abandoned city reclaimed by tropical jungle. A single broad FAR-DISTANCE skyline panorama, hazy and backlit against dramatic purple-magenta dusk clouds, low horizon, the metropolis dissolving into atmospheric haze. The iconic landmarks appear ONCE each, spread apart across the width at different positions, distant and small: Merdeka 118 toward the left, the Petronas Twin Towers centre-left, the KL Tower centre-right, and the TRX (Exchange 106) tower toward the right - all overgrown with vines, faint warm light in a few windows. Generic overgrown skyscrapers fill the spaces between them. A low dark band of jungle canopy and ruined rooftops runs along the bottom edge. Muted desaturated purple-magenta palette with warm glints; soft volumetric light, deep atmospheric perspective. IMPORTANT: each landmark appears exactly once and no landmark is repeated anywhere in the image. Wide panorama, horizon low, base at bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. Full opaque scene (no transparency). Minimum 1792x1024, prefer wider (2560x1080 or 3072x768). No people, no text, watermark, logo, UI or border.
```

**4.2 - Parallax: distant generic skyline (transparent)**
```
Painterly digital matte painting silhouette layer, cinematic, highly detailed. Setting: dystopian overgrown Kuala Lumpur at dusk. DISTANT generic skyline only - ordinary city fabric, NOT landmarks: plain high-rise offices, condominium and apartment towers, residential blocks, telecom masts, rooftop water tanks, construction cranes - all overgrown, silhouetted and backlit against the glowing purple-magenta sky, lost in haze. Do NOT include the Petronas Twin Towers, Merdeka 118, TRX or the KL Tower - no iconic landmark anywhere in this layer. Elements sit in the lower ~70% of the frame; top ~30% empty transparent. Muted purple-magenta palette. Wide panorama, base at bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

**4.3 - Mid layer: KL city fabric (transparent)**
```
Painterly digital matte painting mid-distance layer, cinematic, highly detailed. Setting: dystopian overgrown Kuala Lumpur at dusk. MID-DISTANCE city fabric that sits in front of the far skyline, diverse and lived-in: low- and mid-rise offices and shophouses with weathered clay-tile roofs, an LRT/MRT station with an elevated rail viaduct, an elevated highway interchange, faded billboards and shop signage, rooftop water tanks and air-conditioner units, pedestrian skybridges, street lamps with tangled utility cables, a mosque with a dome and slender minaret, and monsoon trees growing between the buildings - all overgrown with vines and moss. This layer is LOWER and CLOSER than the far skyline: no skyscrapers, and do NOT include the Petronas Twin Towers, Merdeka 118, TRX or KL Tower. Elements sit in the lower ~70% of the frame; top ~30% empty transparent. Muted purple palette with warm lamp glints. Wide panorama, base at bottom, top/bottom 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

**4.4 - Foreground: street-level buildings, infrastructure and foliage (transparent)**
```
Painterly digital matte painting foreground / near layer, cinematic, highly detailed. Setting: dystopian overgrown Kuala Lumpur at dusk. CLOSE street-level buildings and infrastructure framing the bottom of the scene: weathered shophouse facades with Chinese and Tamil signage and awnings, a corner kopitiam, a five-foot-way colonnade, street lamps, tangled overhead utility cables, road barriers, a bus stop, a traffic light and a road drain - all abandoned and overgrown. Framed by dense tropical foliage along the very bottom: palm fronds, banana leaves, monstera, ferns, flowering shrubs and hanging vines, rim-lit by the last dusk light. This is the NEAREST layer: no skyscrapers, and do NOT include the Petronas Twin Towers, Merdeka 118, TRX or KL Tower. Occupies the bottom ~40% of the frame; upper area transparent. Muted purple palette with warm highlights. VERY wide panorama, base at bottom, top 15% crop-safe. HORIZONTALLY SEAMLESS/TILEABLE: left and right edges match exactly. PNG with TRANSPARENT background; otherwise flat pure-magenta #FF00FF background, no shadows/gradients. Minimum 1792x1024, prefer wider. No people, no text, watermark, logo, UI or border.
```

### 4.4 Level 1 - ARRIVAL GATE (only if regenerated)

Arrival is **not** generated yet; it keeps the original Malaysian stack. If a set
is wanted, use the shared rules with an **overgrown KL arrival-wards, misty teal**
locale (day, palette `#7ca99c`): background = flooded vine-choked city entry;
far = distant twisted skyline; mid = broken highways, archways, shophouses;
near = tropical entry foliage. Follow the same 4-element structure and
constraints as 4.1-4.3.

---

## 5. Scaling the prompts to a new chapter

1. Pick a **locale** and a **mood/palette** distinct from existing chapters.
2. Write **four self-contained prompts** (background, far, mid, foreground) using
   the same structure: scene line, then keep the shared rules inline, and always
   state the layer role, transparency, seamless requirement, size, and negatives.
3. The **mid layer must stay diverse** (architecture, transit, signage, market,
   vehicles, terrain/water, machinery - not machinery only).
4. Generate, name `<chapterId>-{bg,far,mid,near}.png`, drop into
   `public/assets/`, and register in `preload()`.
5. Add the chapter to `src/levels.ts` with its palette; `drawWorld()` picks up
   `${id}-bg/far/mid/near` automatically for any non-`arrival` id.
6. Verify with the responsive layout (tall / short / ultrawide) before shipping.

---

## 6. Future work

### 6.1 Replace mirror tiling with a feathered cross-fade (removes symmetry)

Mirror-tiling guarantees seamless edges but makes structured art subtly
left-right symmetric (most visible on the caverns). A feathered overlap avoids
symmetry:

- Create a runtime canvas texture per generated layer (`textures.createCanvas`),
  draw the source, then `destination-out` gradient-fade the left/right `N` px
  edges (N ~ 64 source px) so each tile's alpha ramps 0->1 and 1->0.
- In `positionParallax`, space tiles by `step = layer.width - N*scale` and wrap by
  `step`, so the feathered edges overlap and cross-fade.
- Caveat: naive "over" compositing dips the combined alpha in the overlap; accept
  the slight dip, use a slightly overlapping opaque pass, or tune the ramp
  exponent. Verify no vertical seam and no darkening band.

### 6.2 Full-bleed background option

Today the generated `-bg` is scaled to the 540px band, with the palette sky
gradient above and abyss below (softened by fades). To make the scene fill the
**whole screen** (no gradient/abyss bands), scale/position the `-bg` layer to
cover the viewport and re-anchor the parallax/abyss. Trade-off: the background is
then scaled beyond 1:1, so enable `LINEAR` filtering on the background texture
(otherwise `pixelArt` nearest-neighbour makes the painted art blocky).

### 6.3 Remove unused assets (done)

`public/assets/level-*.png` and `skyline-sky.png` were deleted, and all loaded art
was replaced with compressed WebP (see Section 2). Originals remain in git
history if ever needed.

### 6.4 Arrival generated set (optional)

Generate a unique 4-element set for Arrival Gate (see Section 4.4) if the original
art should be replaced. Until then, Arrival remains the original Malaysian stack.

---

## 7. Verification harness (how the art was validated)

- A headless-Chrome CDP harness starts the Vite dev server, loads the game,
  selects a chapter via the dev-unlocked menu, sets device metrics, and captures
  screenshots at several viewport sizes. It also reads live layout values
  (`zoom`, `bandOffset`, band pixel heights) from `window.__echofall`.
- A pixel sampler draws each PNG into a canvas and reports colours down the centre
  column plus the largest vertical colour jump (to locate seams).
- Seam check caveat: comparing edge columns RGB+A over-reports seams when an edge
  is transparent (RGB differences are invisible there); interpret with the alpha
  in mind, or compare only opaque rows.
- Layout numbers observed (1863x765 ultrawide): zoom 1, bandOffset 113,
  sky 113px / play 540px / underground 113px - balanced. Short viewport
  (1000x461): zoom 0.8, band 432px, 15px margins.

