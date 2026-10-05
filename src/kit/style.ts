// The house style every scene shares, so the scenes read as one set.
// docs/scene-style.md explains each rule; these are the numbers.

/** CSS pixels per art pixel on the strip. Previews draw at 2. */
export const SCALE = 3;
/** Art rows in the strip: 16 rows, 48 CSS px tall at SCALE 3. */
export const ROWS = 16;
/** The row land creatures stand on (their feet are on GROUND - 1). */
export const GROUND = 14;
/** The waterline row for scenes on water. */
export const WATERLINE = 10;
/** The sky band: stars, sun, clouds, and kites live in rows 0 to SKY_ROWS - 1. */
export const SKY_ROWS = 10;

/**
 * Sprite size classes, as [max width, max height] in art px. A lead is the
 * scene's main character (the dog, the boat, the moon); crew are one per
 * child thread; details are small touches (a fish, a bell, a flower).
 */
export const SIZE = {
  lead: [16, 12],
  crew: [13, 9],
  detail: [8, 6],
} as const;

/** Motion speeds in art px per second, so scenes move at one pace. */
export const SPEED = {
  /** A calm walk or amble. */
  walk: 3.75,
  /** A drift: a boat, a balloon, a cloud. */
  drift: 4.5,
  /** Hurrying somewhere after a step. */
  trot: 12,
  /** A quick pass: a fox, a train, a roadrunner. */
  dash: 14,
  /** The sky turning. */
  sky: 0.6,
} as const;

/** Timing in seconds. */
export const TIME = {
  /** A step reaction (a hop, a jump, a streak) lasts about this long. */
  reaction: 0.55,
  /** A tap's reaction and its floating note. */
  tap: 1.2,
  /** Walking cycle: frames swap every this many seconds. */
  beat: 0.27,
} as const;

/**
 * "Needs you" amber. Reserved: it appears only in the waiting signal
 * (`k.signal`), the crew's waiting "!", and the helper alert. Every other warm
 * light uses CREAM (lamps, windows, the moon, glows) or FIRE (flames).
 */
export const AMBER = "#f5a524";

/** Warm lights that are not "needs you": lamps, lit windows, the moon, inner glows. */
export const CREAM = { light: "#f0dfae", dark: "#fbeccb" } as const;

/** Flames and embers: orange-red, clearly apart from amber. */
export const FIRE = { flame: "#ee6a3a", core: "#f7b48a", ember: "#d9483a" } as const;

/** The two colors of every rain cloud: the cloud and its drops. */
export const RAIN = {
  light: { cloud: "#a3a6b0", drop: "#4f7fd6" },
  dark: { cloud: "#7d808b", drop: "#7fa7e8" },
} as const;
