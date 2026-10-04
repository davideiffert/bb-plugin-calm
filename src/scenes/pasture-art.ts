// Pixel art for the Pasture. One character per pixel; "." is empty.
// Letters map to palette entries below.

import type { Sprite } from "./common";

export const SHEEP = {
  walk1: [
    "..sww.wws....",
    ".wwwwwwwwwsw.",
    "swwwwwwwwKKKK",
    "wwwwwwwwwKeKK",
    "swwwwwwwwKKK.",
    ".swwwwwwwwK..",
    "..sswssws....",
    "..k.k..k.k...",
    "..k.k..k.k...",
  ],
  walk2: [
    "..sww.wws....",
    ".wwwwwwwwwsw.",
    "swwwwwwwwKKKK",
    "wwwwwwwwwKeKK",
    "swwwwwwwwKKK.",
    ".swwwwwwwwK..",
    "..sswssws....",
    "...kk...kk...",
    "...k.k..k.k..",
  ],
  hop: [
    "..sww.wws....",
    ".wwwwwwwwwsw.",
    "swwwwwwwwKKKK",
    "wwwwwwwwwKeKK",
    "swwwwwwwwKKK.",
    ".swwwwwwwwK..",
    "..sswssws....",
    "..kk....kk...",
    ".............",
  ],
} satisfies Record<string, Sprite>;

/** A tri-colour collie: tan, dark saddle, white collar and socks. */
export const DOG = {
  trot1: [
    "..........bb..",
    ".........bttt.",
    "c........ttetK",
    "bb.......cccc.",
    ".bbbbbbbbccc..",
    ".tttttttccc...",
    "..t.t...t.t...",
    "..c.c...c.c...",
  ],
  trot2: [
    "..........bb..",
    ".........bttt.",
    "c........ttetK",
    "bb.......cccc.",
    ".bbbbbbbbccc..",
    ".tttttttccc...",
    "...tt....tt...",
    "...cc....cc...",
  ],
  /** Sitting, facing the viewer. */
  sit: [
    ".bb...bb.",
    "bbttcttbb",
    ".ttKcKtt.",
    ".tttcttt.",
    "..tcKct..",
    "...ccc...",
    "..bcccb..",
    ".bbcccbb.",
    ".tbcccbt.",
    ".tcc.cct.",
    ".cc...cc.",
  ],
  lie: [
    "..........bb..",
    ".........bttt.",
    "c........ttetK",
    "bbbbbbbbbcccc.",
    ".tttttttccccc.",
  ],
} satisfies Record<string, Sprite>;

/** A small red fox for the rare surprise, facing right. */
export const FOX = {
  trot1: [
    ".........o..",
    "........ooo.",
    "ww.....oooeK",
    ".wooooooooo.",
    "..ooooooo...",
    "..o.o..o.o..",
  ],
  trot2: [
    ".........o..",
    "........ooo.",
    "ww.....oooeK",
    ".wooooooooo.",
    "..ooooooo...",
    "...oo...oo..",
  ],
  stand: [
    ".........o.o",
    "........oooo",
    "ww......oeoK",
    ".woooooooo..",
    "..ooooooo...",
    "..o.o..o.o..",
  ],
} satisfies Record<string, Sprite>;

export interface Palette {
  [ch: string]: string | null;
  outline: string | null;
}

export const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    w: "#fbf8f1", s: "#ddd5c6", K: "#3b3540", e: "#fbf8f1", k: "#3b3540",
    t: "#b9874f", b: "#4a3f3a", c: "#f6ead2", o: "#d9772b", f: "#8a6440", grass: "#4f9a5f",
    g: "#a3a6b0", d: "#4f7fd6", star: "#8f86c9",
    outline: "#9c958a",
  },
  dark: {
    w: "#ece7dc", s: "#c8c0b1", K: "#4a4452", e: "#f0ebe0", k: "#8a8392",
    t: "#c99a62", b: "#5e504a", c: "#f1e3c8", o: "#e88a3a", f: "#a07b55", grass: "#62b374",
    g: "#7d808b", d: "#7fa7e8", star: "#e8e2ff",
    outline: null,
  },
};

/** Pale sprite colors that need a 1px outline to read on a light background. */
export const OUTLINED = "wsceb";

