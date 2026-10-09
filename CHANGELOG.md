# Changelog

## Unreleased

- New **One scene per project** choice beside **One scene per thread**. Each
  project draws one scene from the mix, and every thread in that project shows
  it. The strip learns the project from the thread's record on open.

## 1.2.0 (2026-10-08)

- New **Show scenes** setting. **While the agent works** keeps today's
  behavior and stays the default. **Always** keeps the scene up between runs,
  playing just as it does during work, with the light following the local
  clock. The amber light, rain cloud, and rate-limit rest work as before, and
  **Calm off here** still turns it off for a thread.
- With **Always** and a new scene each run, an idle strip moves to the next
  scene in the mix every 3 minutes, with a quick fade. It never changes during
  a run, follows the mix (every scene once before repeats, left-out scenes
  skipped), and keeps a chosen, per-thread, or pinned scene. The timer stops
  while the page is hidden.

## 1.1.2

- Removed the dark band that showed above an open scene. The prompt box's
  shadow fade now stays hidden while the scene strip is open, so the scene
  sits cleanly on the page. When the strip closes, the fade returns.

## 1.1.1

First public release.

- Parallel wording for scenes that change each run or stay with each thread.
- One shared mix count, also visible with reduced motion and still pictures.
- One Edit mix button instead of permanent controls on all sixteen cards.
- Whole-card mix editing, visible excluded-scene labels, and a last-scene safeguard.
- A bordered action button, active Done state, and larger phone tap target.
- Escape exits mix editing without closing the settings panel.
- Updated settings image and installation instructions.

## 1.1.0

Prepared public launch.

- Sixteen scenes above the prompt box, shown only on the thread you are
  viewing: the Pasture, the Sea, the Night sky, Balloon Fiesta, the Pond, the
  Train, the Garden, Campfire, Underwater, a Snowy village, a Mountain trail,
  Kites, a Desert roadrunner, a City rooftop, a Lighthouse, and Space.
- Moments in every scene: working, a reaction to each agent step, a long-run
  evening, waiting on you, rate-limited with the reset time, and error. When a
  run finishes, the strip closes right away.
- Every run starts mid-action, so short runs show the best part.
- Waiting on you looks the same in every scene: one small amber light with a
  soft glow beside the main character. Amber means only that; lamps, windows,
  and the moon are cream, and fires are orange-red.
- The strip opens and closes with a quick height ease so the prompt box glides
  instead of jumping.
- A settings page with a tile for every scene (only the hovered and chosen
  ones animate): choose a scene, a different one per thread, or a new one
  each run, leave scenes out of the random mix, and set the evening timing to 20, 40, or 60 minutes over a
  small dusk strip.
- The crew: each active child thread joins the scene as a small figure in its
  own color (a tagged sheep, a boat in the fleet, a bee, a satellite), shows
  when it is waiting or failed, and peels off when it finishes. "+N" past the
  cap. Helper colors are never amber.
- Steps count completed agent actions from the thread's events.
- The light follows the local time of day, and the date adds a quiet seasonal
  touch to each scene.
- Hover or tap the main character or a crew member, or Tab to the strip, for
  working time, steps, children, and the rate-limit reset time.
- Rare surprises while working, about once in a long session per thread: a
  fox, a whale, a heron, a cow-shaped balloon, a flying saucer, and more.
- Little gags: three short silly moments per scene (a sheep stuck on the
  stile, a cat nudging a flowerpot off the ledge, a gull stealing the
  keeper's sandwich), about one every 3 to 5 minutes of work, rotated so none
  repeats back to back. Only while working; never over the amber light or a
  helper's marker; off with still pictures. A switch turns them off.
- Characters for the quieter scenes: a lighthouse keeper on the gallery, an
  owl on a pine under the night sky, and a bigger, more expressive city cat.
- Taps: a sheep says "♪ baa", a frog says "♪ ribbit", a kite loops. Silent,
  and they never take focus from the composer.
- A text label on the strip that screen readers announce politely on each
  change, and that phone docks folding cards into pills can show.
- Follows bb's light and dark mode, the system's reduced-motion setting, and
  pauses while hidden. A Still pictures switch keeps every scene still
  regardless of the system setting.
- A faint ambient glow behind every scene, by day, dusk, and night: a soft
  oval of a few percent opacity just above the ground, fading to nothing in
  every direction.
- Chat text scrolling down toward the strip dissolves into the page instead of
  being cut at the strip's edge.
- "A new one each time": each new run of a thread picks a scene at random, with
  no repeats until all have shown and never the same twice in a row; never
  mid-run or while the strip closes, and remembered across restarts.
  A pause of a few seconds between steps counts as the same run.
- The full scene means only that the main agent is working. While it is idle,
  helpers that are only working show nothing (bb's own child thread bar covers
  them). A helper that needs you gets a half-height mini scene in the current
  scene's style, with the words beside it: an amber "!" for one waiting on
  you, a rain cloud for one that failed. Tap a figure to open that helper. A
  failed helper you have opened, from the alert or anywhere in bb, stays
  dismissed across reloads and restarts.
- Light on CPU: drawn at CSS-pixel resolution and scaled up crisply, cached
  static layers, an adaptive frame rate that stops when nothing moves, and one
  shared clock for every visible strip. About 4% of one core while one strip
  animates in the measured workload, none when hidden. One broken strip never
  stops the others.
- Light on the server: event-driven, open questions re-checked only while a
  watched thread waits, steps counted incrementally and only for threads with
  a strip open and Calm on. A run that starts while the last one's steps are
  being read keeps its own count.
- Safety nets: "waiting on you" clears once the question is answered even if
  bb's thread events are missing, and a strip whose run-ended event never
  arrives closes on its own after 10 seconds of the composer saying nothing
  runs.
- A thread header control to turn Calm off for one thread or pin a scene to
  it, remembered per thread.
- A Features list on the settings page to switch off the crew, the helper
  alert, surprises, taps, time of day and seasons, or the header control, and
  to turn on Still pictures.
- "A new one each time" is the default scene choice.
- A scene kit: scenes are small modules of pixel art and one hook per moment,
  with a style guide and a guide for adding a scene.
- Tested on bb 0.45 and declared for bb 0.45 and newer, built against plugin
  SDK 0.6.15.
  The three experimental bb APIs it uses each have a fallback, so a bb change
  never stops it from loading.

## 1.0.0

Private preview. The existing tag is retained; the public launch uses a new version.
