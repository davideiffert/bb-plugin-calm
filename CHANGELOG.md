# Changelog

## 1.0.0

First release.

- Three scenes above the prompt box, shown only on the thread you are viewing:
  the Pasture, the Sea, and the Night sky.
- Moments in every scene: working, a reaction to each agent step, a long-run
  evening, waiting on you, rate-limited with the reset time, and error. When a
  run finishes, the strip closes right away.
- Every run starts mid-action, so short runs show the best part.
- The strip opens and closes with a quick height ease so the prompt box glides
  instead of jumping.
- A settings page with live scene tiles: choose a scene, a different one per
  thread, or a new one each run, and set the evening timing to 20, 40, or 60 minutes over a
  small dusk strip.
- The crew: each active child thread joins the scene as a tagged sheep, a
  boat in the fleet, or a bright star, shows when it is waiting or failed,
  and peels off when it finishes. "+N" past the cap.
- Steps count completed agent actions from the thread's events.
- The light follows the local time of day, and the date adds a quiet seasonal
  touch to each scene.
- Hover or tap the dog, boat, moon, or a crew member for working time, steps,
  children, and the rate-limit reset time.
- Rare surprises while working: a fox, a whale, a comet.
- Taps: a sheep says "♪ baa", a boat rings a bell, a star twinkles. Silent,
  and they never take focus from the composer.
- A text label on the strip, so screen readers and phone docks that fold
  cards into pills can name it.
- Follows bb's light and dark mode, the system's reduced-motion setting, and
  pauses while hidden.
- A faint ambient glow behind every scene, by day, dusk, and night: a soft
  oval of a few percent opacity just above the ground, fading to nothing in
  every direction.
- Chat text scrolling down toward the strip dissolves into the page instead of
  being cut at the strip's edge.
- "A new one each time": each new run of a thread moves to the next scene, in
  order, never mid-run or while the strip closes, remembered across restarts.
  A pause of a few seconds between steps counts as the same run.
- The full scene means only that the main agent is working. While it is idle,
  helpers that are only working show nothing (bb's own child thread bar covers
  them). A helper that needs you gets a half-height mini scene in the current
  scene's style, with the words beside it: an amber "!" for one waiting on
  you, a rain cloud for one that failed. Tap a figure to open that helper.
- Light on CPU: drawn at CSS-pixel resolution and scaled up crisply, cached
  static layers, an adaptive frame rate that stops when nothing moves, and one
  shared clock for every visible strip. About 4% of one core while animating,
  0 when hidden. One broken strip never stops the others.
- Light on the server: event-driven only, open questions re-checked only while
  a thread waits, steps counted incrementally and only for threads with a
  strip open.
- A home screen section: a still picture of the current scene in today's
  season and time of day, and "Today: N runs · N hops · longest run N min".
- A thread header control to turn Calm off for one thread or pin a scene to
  it, remembered per thread.
- A Features list on the settings page to switch off the home section, the
  crew, the helper alert, surprises, taps, time of day and seasons, or the
  header control.
- "A new one each time" is the default scene choice.
- Works with bb 0.45, built against plugin SDK 0.6.15.
