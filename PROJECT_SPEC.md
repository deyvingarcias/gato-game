# SquishPets — Pinxu the Black Cat (v1)

## What we're building

A web-based ASMR cat interaction experience. The user lands on the page and sees a chubby black cat on a cozy cushion. The cat is interactive — clicking, dragging, and holding different parts produces soft-body deformation, procedural ASMR sounds, and visual feedback. The goal: the user records screen footage of their interactions and shares it on TikTok/YouTube/Instagram.

**This is NOT** a generic mobile-app cat game. We are competing visually with Studio Ghibli, sonically with Purrli, and tactilely with high-end iPad apps like Procreate. The bar is **production-grade indie game quality**, not "looks like a hobby project."

## Non-negotiables

1. **Zero placeholder assets.** No external images, no stock sounds. The cat is drawn procedurally with Canvas. All audio is generated with Web Audio API oscillators.
2. **Real soft-body physics.** Not a sprite that scales on click — actual Verlet integration with a mesh of points and constraints. When you press the belly, the fat jiggles, the head sinks slightly, the whole body redistributes mass.
3. **No frameworks.** Vanilla HTML + CSS + JS. ES modules. No React, no Vue, no build step. Deploys as static files.
4. **Mobile-first.** Designed for portrait recording on phones. Touch events first, mouse events as fallback. Vibration API for haptic feedback.
5. **60fps on a mid-range phone.** Performance budget is strict.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Rendering (cat body) | HTML Canvas 2D | Triangulating Verlet points into a filled mesh; need pixel control |
| Post-processing | WebGL fragment shader | Bloom/glow pass over the canvas for the "soft light" look |
| Physics | Custom Verlet integration | Soft-body deformation; Matter.js is rigid only |
| Audio | Web Audio API (oscillators + filters + noise) | Procedural purring, no mp3 files |
| Animation timing | `requestAnimationFrame` loop | One main loop, no GSAP needed |
| UI overlay | Plain HTML + CSS | Logo, FPS counter, share button |

## File structure

```
squishpets/
├── index.html
├── style.css
├── vercel.json
├── README.md
├── js/
│   ├── main.js          # entry, game loop
│   ├── pinxu.js         # cat: mesh, drawing, states
│   ├── verlet.js        # physics engine
│   ├── audio.js         # procedural sound system
│   ├── particles.js     # hearts, fur, dust
│   ├── input.js         # pointer/touch unified handling
│   ├── shaders.js       # WebGL bloom pass
│   └── state.js         # mood/happiness state machine
└── (no /assets — everything is procedural)
```

## The cat (Pinxu)

### Visual design
- **Color:** Deep black (`#0a0a0a` base, `#1a1a1a` highlights, near-black with bluish midtones)
- **Body shape:** Round, bean-shaped, very chubby. Belly is the widest part. Sits on a cushion.
- **Face:** Closed-eye "happy" default (two small upward arcs). Small triangle nose (`#2a1a1a`, dark plum). No visible mouth unless yawning. Two pointed ears with soft pink inner triangles.
- **Whiskers:** 3 per side, fine white strokes, subtle wobble in idle.
- **Tail:** Curled around the body, soft, also Verlet-simulated.
- **Paws:** Two front paws tucked under the chest, just visible.
- **Eyes:** When open (rare, on first interaction), large yellow-green pupils with a single glint.

### Soft-body mesh
- Body is ~24 Verlet points arranged in a deformable disk/oval shape
- Constraints: outer ring + inner cross-bracing to prevent collapse
- Inner "skeleton" point at the center anchors the cat to its sitting position
- When user touches/drags a region, nearby points are displaced; constraints propagate the deformation
- Damping is high (cat is soft fat, not bouncy rubber) — should look like memory foam

### Drawing the body from the mesh
- Iterate Verlet points around the perimeter, build a smooth closed path using Catmull-Rom or quadratic curve interpolation between points
- Fill with a radial gradient (lighter center, darker edges) to fake volume
- Layer 2: short fur strokes around the silhouette edge (random angles, varying length, very thin, slightly translucent)
- Layer 3: subtle highlight arc on top of the body (light source from upper-left)

## Interaction zones

| Zone | Trigger | Soft-body effect | Sound | Mood delta |
|---|---|---|---|---|
| Belly | Tap/hold | Strong squish, ripples outward | Low "bloop" + purr volume up | +happy |
| Head | Drag (petting) | Slight compression, head tilts toward stroke | Purr intensity scales with stroke speed | +ecstatic |
| Cheek | Tap | Wobble, jiggle | High "mrrp" chirp | +happy |
| Tail | Drag | Tail follows pointer, swings back | Soft swishy sound | +playful |
| Paws | Tap | Tiny twitch | Almost inaudible "tch" | neutral |
| Outside cat | Click | (nothing) | Distant ambient | — |

## Emotional state machine

States: `sleeping → drowsy → awake → content → happy → ecstatic`

- **Default on load:** `drowsy` (eyes closed, slow breathing)
- 5s without interaction → `sleeping` (deeper breath, occasional tail twitch)
- First touch wakes up → `awake` (eyes briefly open, then close again)
- Continued petting raises mood up the chain
- Each state changes: breathing rate, body color saturation, particles spawn rate, purr pitch/volume

State affects rendering:
- `sleeping`: 0.4 breaths/sec, no particles
- `content`: 0.6 breaths/sec, occasional heart particle on touch
- `ecstatic`: 1.0 breath/sec, continuous heart particles, paws kneading animation, eyes squeezed-shut smile

## Procedural audio system (`audio.js`)

This is the secret sauce. Build a `PurringEngine` class.

### Purr synthesis
- Fundamental frequency: ~25 Hz (sub-bass rumble) — main oscillator, sine wave
- Add 2nd harmonic at 50 Hz, 3rd at 75 Hz, 4th at 100 Hz (each lower in volume) — gives texture
- All routed through a low-pass filter at ~400 Hz to soften
- LFO at 1.5 Hz modulates a gain node — creates the inhale/exhale "rolling" of the purr
- A noise generator (filtered to 200-2kHz bandpass) layered in at low volume — the "throaty" texture
- Master gain modulated by mood: `sleeping` 0%, `content` 40%, `ecstatic` 100%

### Interaction sounds (all procedural)
- **Bloop (belly tap):** sine at 220 Hz → quick frequency drop to 80 Hz over 200ms, with envelope (attack 5ms, decay 200ms). Low-pass filter.
- **Mrrp (cheek):** triangle wave 600 Hz → 400 Hz with vibrato, 150ms duration
- **Tch (paw):** filtered white noise burst, 30ms, high-pass at 2kHz
- **Tail swish:** brown noise filtered through a moving bandpass, follows pointer velocity

### Ambient
- A very subtle pink noise bed at -45dB throughout = room tone

All sounds start only after first user gesture (browsers require user interaction to start AudioContext).

## Particle system

Two types:
1. **Hearts:** spawn on petting in `content+` state, rise upward, gentle drift, fade out over 2s. Drawn as filled hearts with soft pink color, slight rotation, scale-pulse animation.
2. **Fur tufts:** very subtle, spawn rarely from body edges during heavy petting. Tiny black wisps.

Max ~30 particles on screen at once. Pool them, don't allocate per frame.

## WebGL bloom pass (`shaders.js`)

After drawing the Canvas 2D scene, take the canvas as a texture into a WebGL context, apply a Gaussian blur fragment shader, blend additively back over the original. This gives the cat that "soft glow" cinematic quality. Run at 0.5x resolution for the blur for performance.

Reference shader concept:
- Pass 1: extract bright areas (threshold)
- Pass 2: horizontal Gaussian blur
- Pass 3: vertical Gaussian blur
- Pass 4: additive blend over original

If WebGL is unavailable, skip silently — Canvas 2D alone is acceptable fallback.

## Background scene

- Cozy room aesthetic, but **also procedural**.
- Gradient sky/wall (cream → warm beige top to bottom)
- A soft cushion under Pinxu, drawn as a flattened ellipse with quilted-pattern subtle stitching lines, color: dusty pink `#e8c5c5`
- Faint floor shadow under the cushion
- A single warm light source from upper-left (suggested by gradient direction)
- Slow parallax: cushion shifts ~3px when pointer moves across the screen, very subtle

## Idle animations

When no interaction:
- Body breathes (vertical scale 1.0 ↔ 1.015 on a slow sine wave)
- Tail tip wags slightly every 6-10 seconds (random)
- Every 15-30s: one ear flicks
- Every 45-60s: a dust particle floats through the scene

## UI

Top-left: small "squishpets" wordmark, custom font (Fredoka or similar via Google Fonts CDN), in soft warm-grey.

Top-right: tiny share icon → opens native share sheet on mobile with text "Pinxu is the softest cat alive 🖤 squishpets.web/" + url.

Bottom-center: invisible until 30 seconds in, then a faint hint "Try petting the head..."

No menus, no settings, no instructions on load. The cat invites interaction by itself.

## Pinxu easter egg

The cat's name "Pinxu" is **not visible on the page**. It appears only:
- In the page `<title>` as "Pinxu — SquishPets"
- In the console: `console.log("Hi, I'm Pinxu 🖤")` on load
- In the meta description

This is intentional. The brand is squishpets, Pinxu is the personality.

## Mobile haptics

On supported devices, `navigator.vibrate()`:
- 10ms gentle pulse on every belly tap
- 30ms on cheek tap
- A 4ms-on, 100ms-off pattern during continuous petting (the purr)

## Performance budget

- Total JS file size: < 100KB unminified
- First paint: < 1s on 4G
- Steady-state FPS: 60 on 2022+ phones, 30 minimum on 2018 phones
- Zero memory leaks — particles must be pooled, audio nodes must be reused

## Deployment

- `vercel.json` configured for static hosting
- README with deploy instructions
- The project will be deployed to `squishpets.vercel.app` and then to `gato.limpio.tech` via CNAME

## Build phases

**Phase 1 — Core (do this first, get it working end-to-end before polish):**
1. HTML scaffold + canvas setup + main loop
2. Verlet engine with a simple test (a falling square that deforms)
3. Cat mesh: a basic black blob you can squish
4. Single interaction: tap belly → squish + console log
5. Procedural bloop sound on tap
6. Confirm everything runs at 60fps

**Phase 2 — Bringing Pinxu to life:**
1. Refine cat drawing: fur edge, gradient, ears, eyes-closed, whiskers
2. All interaction zones
3. Full audio system (purring, all interaction sounds)
4. Mood state machine
5. Idle animations (breathing, ear flicks, tail wag)

**Phase 3 — Polish:**
1. Particle system
2. Background scene (cushion, room)
3. WebGL bloom shader
4. UI (logo, share button, hint text)
5. Haptics
6. Performance pass: profile, optimize hot paths

**Phase 4 — Ship:**
1. README
2. vercel.json
3. Deploy preview check
4. Final test on real mobile device

## Code quality requirements

- ES modules (`<script type="module">`)
- No `var`, prefer `const`
- Comments only where the code isn't self-documenting (Verlet math, audio synthesis, shader logic)
- One responsibility per file
- All magic numbers as named constants at top of each module
- After each phase: run a manual checklist, commit to git with a clear message

## What to do if stuck

If a technique looks like it would take more than 30 minutes to implement (e.g., a specific shader bug), simplify: ship the basic version, leave a `// TODO: enhance with X` comment, move on. Phase 1 working end-to-end > Phase 1 perfect.

## Done means

- Open `index.html` in a browser. Pinxu is sitting there breathing softly.
- Tap his belly. He jiggles. A soft bloop plays. A tiny heart floats up.
- Pet his head. Purring fades in. Mood rises.
- Stop for 30 seconds. He goes back to drowsy.
- Record the screen. The footage looks **good enough to post on TikTok unedited**.

That's the bar. Build it.
