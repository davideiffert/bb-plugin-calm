## What you see

Every scene starts mid-action, and the strip closes the moment a run ends.

- **Working:** sheep amble and a collie trots, a sailboat drifts, or stars
  twinkle over the hills.
- **A step happened:** a sheep hops the stile, a fish jumps, or a shooting
  star crosses, at most once every couple of seconds.
- **Long run:** evening light, a setting sun, or a climbing moon.
- **Waiting on you:** the dog sits facing you, the anchor drops and a lantern
  blinks, or the stars hold still and one glows.
- **Rate-limited:** penned, anchored, or clouded over, with a small "back at
  3:40pm" in your local time when the provider reports it.
- **Error:** a rain cloud until the next run.

## Your crew

While the main agent works, each active child thread joins the scene as a
tagged sheep, a small boat, or a bright star, and shows when it is waiting on
you or has failed.

When the main agent is idle, helpers that are only working show nothing, and
bb's own child thread bar covers them. A helper that needs you gets a
half-height mini scene in the same style: a sheep at a closed gate under an
amber "!" with the dog beside it, a boat with its lantern blinking, or a star
pulsing amber. A failed helper sits under its own rain cloud. Tap a figure to
open that helper's thread.

## Small touches

The light follows your local time of day, and each season adds one quiet
detail. Hover or tap the dog, boat, or moon for working time, steps, and
children. Tap a sheep, boat, or star for a silent reaction, and watch for a
rare fox, whale, or comet on long runs.

It follows bb's light and dark mode and your system's reduced-motion setting,
and it pauses while the tab or the strip is out of sight.

## Home screen and thread header

bb's home screen gets a wide, still picture of the current scene with one
line about today: runs, hops, and the longest run. Each thread's header gets a
small scene icon to turn Calm off there or pin one scene to that thread.

## Settings

Calm's settings page shows each scene as a small live tile. Pick one scene, a
different one for each thread, or a new one on every run (the default).
Switch off any optional piece: the home section, the crew, the helper alert,
surprises, taps, time of day and seasons, or the header control. Evening
timing is 20, 40, or 60 minutes to full dusk.

## How it works

The plugin listens to bb's thread events and keeps each thread's state in
memory. It stores your settings, today's counts, per-thread choices, and each
thread's run count, all on your bb. Nothing leaves your bb.

Inspired by the calm mode in Kun Chen's
[firstmate](https://github.com/kunchenguid/firstmate). All the art and code
are new.
