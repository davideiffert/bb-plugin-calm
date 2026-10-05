# Scene style guide

Every Calm scene should read as part of one set: the same pixel size, the same
height, the same pace, and the same meaning for each moment. The numbers live
in [`src/kit/style.ts`](../src/kit/style.ts); this page explains them.

## The grid

- **One art pixel is 3 CSS pixels** (`SCALE`). Previews in settings draw at 2.
  Never draw at a fractional scale: positions may move smoothly, but sprites
  always land on whole art pixels.
- **The strip is 16 art rows tall** (`ROWS`), 48 CSS pixels.
- **Land scenes stand on row 14** (`GROUND`): feet on row 13, a faint ground
  line on row 15. **Water scenes use row 10** (`WATERLINE`). The top rows
  (`SKY_ROWS`, 0 to 9) are sky: sun, moon, stars, clouds, kites.
- The strip is as wide as the chat pane. Lay the scene out in fractions of the
  width, and check it at 360 CSS px (a phone) and at 600 and wider.

## Sprites

Sprites are small text grids, one character per pixel, `.` for empty, letters
mapped to a palette. Keep them inside these size classes (`SIZE`):

| Class | Max size (art px) | Examples |
| --- | --- | --- |
| Lead | 16 x 12 | the collie, the sailboat, the moon |
| Crew | 13 x 9 | a sheep, a small boat, a bright star |
| Detail | 8 x 6 | a fish, a bell, a flower, a dew drop |

- The lead is the one character the eye follows. Give it an idle behavior
  (walking, drifting, glowing) so the scene is alive between steps.
- Crew members are one per child thread. Mark each with the member's color
  on a solid patch of at least 2 art px (an ear tag, a hull stripe, a wing
  patch) so a thread keeps its color and the color reads at a glance.
- **Crew never overlap.** Give each member its own spot, lane, or orbit, and
  keep figures at least 6 art px in from both edges.
- **Leave room for each crew marker.** The "!", cloud, or pause bars sit 5
  rows above the figure (`k.marker`), so a member can't sit so high that its
  marker leaves the strip.
- **The lead is the clearest thing in the scene.** Keep backgrounds (skylines,
  fences, ranges, houses) softer than the lead in both themes, and give a dark
  lead a light edge if it sits on a dark backdrop.
- Pale colors get a 1 px outline in light mode: list their letters as
  `outlined` when you paint the sprite.

## Color

- **One palette per theme** (`light`, `dark`), per scene. Muted, natural
  colors: no pure white, no pure black, nothing neon.
- **The sky glow is shared.** The kit draws a faint glow behind the strip that
  follows the time of day (blue by day, amber at dusk, lavender at night).
  Don't paint a sky background; let the page show through.
- **Per-scene accents** are welcome where they mean something: a peach harvest
  moon in autumn, a pink tint on a spring night.
- **Amber (`AMBER`, `#f5a524`) means "needs you", and nothing else.** It
  appears in exactly three places: the waiting signal (`k.signal`), the crew's
  waiting "!" (`k.marker`), and the helper alert. No lamp, window, fire,
  flower, fish, or kite is amber, even at dusk. A test enforces this.
- **Warm lights that aren't asking for anything use `CREAM`:** lamps, lit
  windows, the moon, a headlamp, a balloon's inner glow, a lighthouse lamp.
- **Flames use `FIRE`:** orange-red with a pale core, clearly apart from
  amber.
- **Light mode needs its own pass.** Check every scene on white: pale stars,
  steam, suits, and water need darker values or an outline there.
- **The rain cloud means "failed"** (`RAIN` colors). The kit draws it; place it
  over the lead with `errorCloudX`.

## The waiting signal

Every scene shows "waiting on you" the same way, so it reads in a second:

- Call `k.signal(x, y)` in `draw` while `k.mood.kind === "waiting"`. It draws a
  2 x 2 amber light with a soft glow at art px `x`,`y`. Only the glow breathes,
  so it reads in a still frame and with reduced motion.
- Put it next to the lead, within a few art px, and have the lead face you.
  If the lead walks to the signal (the child to the clock tower, the hiker to
  the trail marker), move it in `update` and jump it there in `settle`.
- Keep the scene's own object and let the signal be its light: the gardener's
  lantern, the dragonfly's pond, the jellyfish's heart, the trail blaze, the
  antenna, the lighthouse lamp. Turn off any other light nearby while it
  shows (the train's headlamp goes dark).

## The "back at" sign

When rate-limited, the kit draws the "back at 3:40pm" sign in one fixed slot
at the top left, on a small plate in the page's color, in the same type as
the tap labels. It never overlaps the art because the plate covers what is
under it. Scenes don't place it.

## Motion

- Use the shared speeds (`SPEED`): `walk` 3.75, `drift` 4.5, `trot` 12, `dash`
  14, and `sky` 0.6 art px per second. A scene that runs much faster than
  this stops being calm.
- Reactions last about half a second (`TIME.reaction`); taps about 1.2
  (`TIME.tap`); walk cycles swap frames every 0.27 s (`TIME.beat`).
- Every run starts mid-action (`start`): most runs are short, so show the best
  part at once. Never open on an empty stage.
- When nothing moves, say so in `motion()`. "fast" is 30 frames a second,
  "slow" is 15 for gentle pulses and twinkles, "still" stops drawing.

## What each moment means

| Moment | Rule | Pasture | Sea | Night sky |
| --- | --- | --- | --- | --- |
| Working | The lead's idle behavior, never frantic | sheep amble, the dog trots | the boat drifts | stars twinkle and drift |
| A step | One small, clear reaction, at most every 1.7 s | a sheep hops the stile | a fish jumps | a shooting star |
| Waiting on you | Everything holds; the lead faces you; the kit's amber signal beside it | the dog sits facing you, an amber tag by it | anchor down, the lantern glows | the sky stops, the owl faces you, an amber star beside it |
| Error | The kit's rain cloud over the lead | over the dog | over the boat | over the owl |
| Rate-limited | At rest and closed in; the kit adds the "back at" sign | penned, the gate shut | anchored | lavender clouds roll in |
| Long run | Light deepens toward evening (the kit's `evening()`) | the sun sinks | the sun sets | the moon climbs |
| Crew | One member per child thread, its own color, the kit's state markers | tagged sheep | small boats | colored stars |
| Surprise | Rare, gentle, never while waiting or after an error | a fox | a whale | a comet |
| Gags | Three short comic beats, every few minutes of work, only while working | a sheep stuck on the stile | a gull tips the boat | the owl's head spins round |
| Tap | A small silent reaction, never stealing focus | "♪ baa" and a hop | a bell | a twinkle |
| Seasons | One quiet touch per season, where it fits | snow, flowers, a butterfly, leaves | snow, petals, a gull, leaves | snowy pines, fireflies, a harvest moon |

## Gags

Each scene has three little gags: short comic beats that make the set feel
alive on a long run.

- **Two to four seconds each**, one idea each, readable at a glance: a sheep
  stuck on the stile, a cat nudging a flowerpot off the ledge.
- **The kit schedules them**: about one every 3 to 5 minutes of watched work,
  on a per-thread clock, rotating so the same gag never plays twice in a row.
  Don't start them yourself.
- **Only while working.** The kit never starts one in waiting, error, or
  rate-limited, ends one the moment the mood changes, and skips them with
  reduced motion or still pictures.
- **Never cover what matters.** No amber, ever (a test checks every gag's
  frames). The kit draws the crew's markers after the gag, so they stay on
  top.
- **Silent and gentle.** A tiny ♪ label is fine where it lands the joke.
  Generic animals and people only, no famous characters.
- **Put things back.** A gag that moves a character should leave it somewhere
  sensible, and undo anything temporary in `end`.

## Reduced motion

With the system's reduced-motion setting, each moment is a still picture that
still shows the state: `settle()` jumps straight to it (the dog already
seated, the flock already penned), and no surprises play.

## The helper alert

Each scene draws a half-height mini scene (13 rows at scale 2) for a helper
that needs you while the main agent is idle: the scene's crew figure, with the
amber "!" (`p.bang`) when waiting and the rain cloud (`p.failed`) when failed.
Up to three figures, waiting first; the kit adds "+N" and handles taps.
