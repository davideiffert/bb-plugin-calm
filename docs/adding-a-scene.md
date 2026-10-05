# How to add a scene

A Calm scene is one TypeScript module: some pixel art and a few named hooks,
one per moment. The scene kit runs everything else (the mood, the crew
roster, step timing, surprises, gags, taps, reduced motion, hit-testing, caching,
the frame rate, and the overlays), so a scene stays small.

Read the [style guide](scene-style.md) first, then copy the complete example,
[`docs/example/snail.ts`](example/snail.ts), and change it.

## 1. Start from the example

Copy it to a new file under a name no scene uses yet. The commands below use
`snail`, the example's own name; for your scene use its id (`ls src/scenes`
shows the names already taken):

```sh
ls src/scenes                               # pick a name that isn't here
cp docs/example/snail.ts src/scenes/snail.ts
```

In the copy, fix the import paths (the example lives in `docs/example/`, so it
imports from `../../src/kit/`; from `src/scenes/` that is `../kit/`). Then
rename the export, `id`, and `name`. The `id` is stored in people's settings,
so pick it once: lowercase, one word (`snail`, `lighthouse`).

## 2. Draw the art

Sprites are text grids, one character per pixel:

```ts
const KITE: Sprite = [
  "..k..",
  ".kKk.",
  "kKKKk",
  ".kKk.",
  "..t..",
];
```

Map the letters in a palette per theme, and paint with the kit's `sprite()`:

```ts
const PALETTE = {
  light: { k: "#c8553d", K: CREAM.light, t: "#8a8a93", outline: "#9c958a" },
  dark: { k: "#d86a50", K: CREAM.dark, t: "#a0a4ae", outline: null },
};
k.blit(sprite(KITE, PALETTE[k.theme], false, "K"), x, y);
```

`sprite()` caches each grid per palette and direction, so calling it every
frame is cheap. The last argument lists pale letters that get a 1 px outline
in light mode. Warm lights use `CREAM` and flames `FIRE` from
`src/kit/style.ts`; never amber, which belongs to the waiting signal
(`k.signal`). A test fails if any file paints amber of its own.

## 3. Fill in the moments

`defineScene({ ... })` takes these parts. Each hook receives your state `s` and
the kit `k`.

| Part | What it does |
| --- | --- |
| `state()` | Your starting state: positions, timers. |
| `layout(s, k, prevW)` | Fit the scene to `k.W` art px (called when the width changes). |
| `start(s, k)` | A new run: set up mid-action. |
| `mood(s, k, was)` | Optional: react to a mood change (before `start`). |
| `focus(s)` | Where the lead is, in art px, for the sky glow. |
| `crew.max(k)` | How many members fit; use `k.narrow` for phone widths (it is false until the width is known). The kit shows "+N" for the rest. |
| `crew.join(s, k, m, shown)` | A member arrives: return its fields (`{ x }`), or null if there's no room. |
| `crew.leave(s, k, c)` | A member finished: start it leaving. Fade `c.alpha` to 0 and the kit removes it. |
| `step(s, k)` | A step happened: react, return true. The kit debounces. |
| `surprise.active(s)`, `surprise.start(s, k)` | The rare surprise. The kit schedules it. |
| `gags` | Optional: the scene's three gags, each `{ id, seconds, ready?, start?, update?, draw?, end? }`. The kit schedules and rotates them, plays them only while working, and ends them early when the mood changes. In your own `update` and `draw`, `k.gagging(id)` returns how far along a gag is (0 to 1) so your characters can join in. |
| `hits(s, k)` | What can be hovered or tapped: boxes (`box`) or nearest points (`near`). |
| `tap(s, k, hit)` | Start a reaction with `k.react(key, TIME.tap)`. Read it back with `k.reaction(key)`. |
| `errorCloudX(s, k)` | Where the kit puts the error's rain cloud. |
| `sky(s, k)` | Optional: a custom glow. Default: the time of day's glow. |
| `update(s, k, dt)` | Advance your motion. Not called with reduced motion. |
| `settle(s, k)` | Reduced motion: jump to the still picture for the mood. |
| `draw(s, k)` | Draw. The kit adds "+N", the rain cloud, and the "back at" sign (in a fixed slot at the top left). |
| `motion(s, k)` | "fast", "slow", or "still". Taps and reduced motion are handled. |
| `alert` | The helper alert's mini scene: `layout`, `still`, `moving`. |

Inside `draw`, use the kit's helpers: `k.blit` (a sprite), `k.dot` (one art
pixel), `k.px` (art px to canvas px), `k.layer` (a cached layer for anything
that doesn't move), `k.marker` (a crew member's "!", cloud, or pause bars),
`k.signal` (the amber waiting light, the only amber a scene may draw),
and `k.evening()` (0 by day to 1 at dusk, from the clock and the run length).
`k.season` is "winter", "spring", "summer", "autumn", or "none" when the
person turned seasons off.

### Escape hatches

Nothing is off limits. `update` and `draw` are plain canvas code, so a scene
can do water shimmer, steam, firelight, or anything else. If two scenes need
the same behavior, move it into `src/kit/` so the next scene gets it free.

## 4. Register it

A scene appears in four places. Add it to each, in the same position:

1. **`SCENES`** in [`src/scenes/index.ts`](../src/scenes/index.ts): import your
   export and add it to the list. Order there is the order in the settings
   picker, and the shuffled "a new one each time" bag picks from all of them.
2. **`SCENE_IDS`** in [`src/settings.ts`](../src/settings.ts): add the `id`,
   in the same order. Settings only accept ids listed here, and a test checks
   that this list matches `SCENES`.
3. **`CAPTIONS`** in [`src/settings-section.tsx`](../src/settings-section.tsx):
   one short line for its settings tile, in the form "A frog leaps to a lily
   pad on each step."
4. **`ICONS`** in [`src/header-control.tsx`](../src/header-control.tsx): a tiny
   sprite (about 6 x 6) for the thread header button, using the letters in
   that file's `PALETTE` (add a letter there if you need a new color).

Then add a column for it to the scene tables in the README.

## 5. Check it

```sh
npm test                                   # the suite, including your scene's moments
npx tsc --noEmit                           # types
node tools/gallery/run.mjs .gallery snail  # every moment, light, dark, phone, a clip
```

Open `.gallery/index.html` and look at every moment. The gallery needs
Playwright's Chromium or Chrome, and ffmpeg for the clip.

Before you send it, check:

- Every moment in the style guide's table has something natural to show.
- It looks right at 360 CSS px and in both themes.
- With reduced motion, each moment is a clear still picture.
- `motion()` returns "still" when nothing moves, so an idle strip costs nothing.
- Nothing flashes, and nothing moves faster than `SPEED.trot` except a rare
  `dash`.

If you change the kit itself, run the parity check against the last release to
prove the existing scenes still draw the same pixels:

```sh
mkdir /tmp/base && git archive v1.0.0 src | tar -x -C /tmp/base
node tools/parity/run.mjs /tmp/base/src
```
