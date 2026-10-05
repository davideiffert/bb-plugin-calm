# How Calm works


The plugin uses bb's plugin events and SDK:

- `thread.active`, `thread.idle`, and `thread.failed` for working, finished,
  and error.
- `interaction.pending`, plus a check of the thread's open interactions, for
  waiting on you.
- `turn.failed` with a `rate-limit` category for rate limits, taking the reset
  time from the provider's rate-limit windows.
- bb's once-a-second "new thread events" notice, then the thread's completed
  items, to count steps.
- While a watched thread waits on you, a re-check of its open questions every
  15 seconds, so an answer always clears the amber light.
- Each thread record's `parentThreadId`, plus `threads.list({ parentThreadId })`
  once per strip, for the crew.

It keeps each thread's state in memory and sends changes to the open strip
over bb's realtime channel. In the plugin's own storage on your bb it keeps
your settings, the choice of any thread
you set from its header, and, for "a new one each time", a run count for each
thread (up to the 2,000 most recent threads; a thread's entries are removed
when it is archived or deleted), plus the failed helpers you have opened (up
to 500). Nothing leaves your bb: Calm talks only to your own bb server, with
no external services and no telemetry.

**Experimental bb APIs.** Three parts lean on APIs bb still marks
experimental, and each has a fallback so a change in bb can't stop Calm from
loading:

- `experimental_thread.events` (the step count, and noticing an answered
  question quickly). Without it, steps aren't counted and the 15-second
  re-check clears "waiting on you".
- `experimental_threadHeaderAction` (the header button). Without it, Calm runs
  without the button.
- `experimental_useCodeTheme` (bb's light or dark). Without it, Calm follows the
  page's light or dark mode.

**Performance:** in one measured workload (a single strip animating the
Pasture in Chrome on a 4-core server), about 4% of one CPU core while it
animates, around 1.5% while it waits or rains, and none while hidden. A still
scene that is on screen redraws once every 30 seconds so its light follows the
clock, and an open strip renews its watch with the server every 5 minutes.
Other scenes and machines will differ. It draws at one canvas pixel per CSS pixel and lets the browser scale
up, redraws static layers only when the time of day, season, size, or theme
changes, slows to 15 frames a second for gentle changes and stops when nothing
moves, and drives every visible strip from one shared clock. On the server it
reacts to bb's events, counts steps incrementally only for threads with a
strip open (and never for a thread where Calm is off), and re-checks open
questions only for a watched thread that is waiting on you.


[Back to Calm](../README.md)
