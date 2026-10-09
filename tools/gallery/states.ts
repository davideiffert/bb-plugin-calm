// Every scene running live, one strip each, with a Run / Rest switch so the
// change between work and rest plays out in front of you. "Run" is a run in
// progress with a step every few seconds; "Rest" is the strip shown always,
// resting between runs. "Fast day" runs the clock through a whole day in
// under a minute, so the evening light, the stars, and the dawn all show.
// Under each strip sits a mock prompt box, so the experimental spill into it
// shows here without turning it on in bb. Built into one HTML file by states.mjs.
//   ?only=sea,night   shows just those scenes
import { SCENES } from "@calm/scenes/index";
import { beginFrame, endFrame, type Label, type Hsla } from "@calm/kit/common";
import type { Mood } from "@calm/mood";
import type { SceneInstance, ThemeMode } from "@calm/kit/types";

const WIDTH = 720;
const SCALE = 3;
const PAD = 18;
const STEP_EVERY = 4;   // seconds between steps while running

type Theme = ThemeMode;
let theme: Theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const muted = () => (theme === "dark" ? "#8a8a93" : "#6b6b73");
const page = () => (theme === "dark" ? "#18181b" : "#ffffff");
const text = () => (theme === "dark" ? "#a1a1aa" : "#6b6b73");

// The clock the scenes see: real time, or a day every DAY_SECONDS while "Fast day" is on.
const DAY_SECONDS = 48;
let fastDay = false;
let clockOffset = 0;   // ms ahead of real time
const simNow = () => Date.now() + clockOffset;
const clockText = () => { const d = new Date(simNow()); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

let runs = 1;
// In a fast day the run's own dusk is held off, so the light follows the clock alone.
const working = (run: number): Mood => ({ kind: "working", turnStartedAt: simNow(), resetsAt: null, since: simNow(), run });
const resting = (run: number): Mood => ({ kind: "working", turnStartedAt: null, resetsAt: null, since: simNow(), run, resting: true });

interface Cell {
  inst: SceneInstance;
  art: HTMLCanvasElement;    // the scene's own pixels
  out: HTMLCanvasElement;    // composed with page color, glow, and labels
  box: HTMLDivElement;       // a mock prompt box under the strip
  below: HTMLCanvasElement;  // the spill layer behind its text
  height: number;
  running: boolean;
  run: number;
  stepAt: number;
  button: HTMLButtonElement;
}
const cells: Cell[] = [];

function compose(c: Cell, frame: { labels: Label[]; glow: Hsla[] }) {
  const g = c.out.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = page();
  g.fillRect(0, 0, c.out.width, c.out.height);
  for (const [h, s, l, a] of frame.glow) {
    const cx = c.out.width / 2, cy = PAD + c.height * 0.84;
    const rx = Math.max(140, c.out.width * 0.42), ry = c.height * 0.62;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const [k, p] of [[1, 0], [0.86, 0.18], [0.62, 0.36], [0.38, 0.54], [0.19, 0.7], [0.07, 0.84], [0.015, 0.94], [0, 1]]) grad.addColorStop(p, `hsla(${h},${s}%,${l}%,${a * k})`);
    g.fillStyle = grad; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(c.art, 0, PAD);
  for (const l of frame.labels) {
    g.globalAlpha = l.alpha;
    g.font = `${l.weight} ${l.size}px ${l.mono ? "ui-monospace, Menlo, monospace" : "system-ui, sans-serif"}`;
    g.textAlign = l.align === "center" ? "center" : l.align;
    g.textBaseline = l.anchor === "top" ? "top" : l.anchor === "bottom" ? "bottom" : "alphabetic";
    g.fillStyle = text();
    if (l.plate) {
      const w = g.measureText(l.text).width;
      g.fillStyle = page();
      g.fillRect(l.x - 5, l.y + PAD - 1, w + 10, l.size + 4);
      g.fillStyle = text();
    }
    g.fillText(l.text, l.x, l.y + PAD);
  }
  g.globalAlpha = 1;
}

/** Switch one strip between a run and a rest. The scene carries on from where it is, as in bb. */
function setRunning(c: Cell, on: boolean) {
  c.running = on;
  if (on) c.run = ++runs;
  c.inst.setMood(on ? working(c.run) : resting(c.run));
  c.stepAt = 1.5;
  c.button.textContent = on ? "End run" : "Start run";
  c.button.dataset.state = on ? "running" : "resting";
  c.out.dataset.state = c.button.dataset.state;
}

function cell(scene: (typeof SCENES)[number]): Cell {
  const inst = scene.create();
  const art = document.createElement("canvas");
  art.width = WIDTH; art.height = scene.height;
  const out = document.createElement("canvas");
  out.width = WIDTH; out.height = scene.height + PAD;
  out.style.width = `${WIDTH}px`; out.style.height = `${scene.height + PAD}px`;
  out.className = "strip";
  const button = document.createElement("button");
  button.className = "toggle";
  const box = document.createElement("div"); box.className = "prompt";
  const below = document.createElement("canvas"); below.className = "below";
  const text = document.createElement("div"); text.className = "prompt-text"; text.textContent = "Type a message to the agent…";
  box.append(below, text);
  const c: Cell = { inst, art, out, box, below, height: scene.height, running: true, run: runs, stepAt: 1.5, button };
  button.onclick = () => setRunning(c, !c.running);
  setRunning(c, true);
  return c;
}

// -- The page --------------------------------------------------------------

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #f0f0f2; color: #222; }
  body.dark { background: #0f0f11; color: #e4e4e7; }
  header { position: sticky; top: 0; display: flex; gap: 10px; align-items: center; padding: 12px 20px; background: inherit; border-bottom: 1px solid #0002; z-index: 1; }
  header h1 { font-size: 16px; margin: 0 auto 0 0; }
  header p { margin: 0 14px 0 0; color: #777; font-size: 13px; }
  header .clock { font: 600 13px ui-monospace, Menlo, monospace; color: #777; min-width: 48px; text-align: right; }
  button[aria-pressed="true"] { border-color: #2a6fd6; color: #2a6fd6; }
  button { font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid #8884; background: #fff2; color: inherit; cursor: pointer; }
  button.toggle { min-width: 92px; font-weight: 600; }
  button.toggle[data-state="running"] { border-color: #2a9d5c; color: #2a9d5c; }
  button.toggle[data-state="resting"] { border-color: #b07a2a; color: #b07a2a; }
  main { display: grid; grid-template-columns: 220px ${WIDTH}px; gap: 12px 16px; padding: 16px 20px 40px; align-items: center; }
  .name { font-weight: 600; }
  .name small { display: block; font-weight: 400; color: #777; }
  .name .state { display: block; font-weight: 400; font-size: 12px; color: #777; margin-top: 2px; }
  .strip { display: block; border-radius: 6px; border: 1px solid #8884; image-rendering: pixelated; }
  .strip[data-state="resting"] { border-color: #b07a2a66; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .cell { display: flex; flex-direction: column; }
  .prompt { position: relative; isolation: isolate; height: 54px; margin-top: -1px; border: 1px solid #8884; border-top: 0; border-radius: 0 0 8px 8px; background: #fff; overflow: hidden; }
  body.dark .prompt { background: #18181b; }
  .prompt .below { position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; display: block; image-rendering: pixelated; }
  .prompt-text { padding: 10px 14px; color: #999; font-size: 14px; }
  body.spill-off .prompt { display: none; }
  body.spill-off .strip { border-radius: 6px; }
  body:not(.spill-off) .strip { border-radius: 6px 6px 0 0; }
`;
document.head.appendChild(style);
document.title = "Calm: run and rest";

const header = document.createElement("header");
const h1 = document.createElement("h1"); h1.textContent = "Calm: every scene, run and rest";
const hint = document.createElement("p"); hint.textContent = "End a run to watch the scene settle; start one to watch it pick up again.";
const allOn = document.createElement("button"); allOn.textContent = "Start all runs";
const allOff = document.createElement("button"); allOff.textContent = "End all runs";
const spillBtn = document.createElement("button"); spillBtn.textContent = "Spill"; spillBtn.title = "The experimental spill into a mock prompt box under each strip"; spillBtn.setAttribute("aria-pressed", "true");
const themeBtn = document.createElement("button");
const clockEl = document.createElement("span"); clockEl.className = "clock"; clockEl.textContent = clockText();
const dayBtn = document.createElement("button"); dayBtn.textContent = "Fast day"; dayBtn.title = `A whole day every ${DAY_SECONDS} seconds`; dayBtn.setAttribute("aria-pressed", "false");
header.append(h1, hint, allOn, allOff, spillBtn, clockEl, dayBtn, themeBtn);
document.body.appendChild(header);

const main = document.createElement("main");
const only = new URLSearchParams(location.search).get("only")?.split(",").filter(Boolean);
for (const scene of SCENES.filter((s) => !only || only.includes(s.id))) {
  const name = document.createElement("div"); name.className = "name";
  name.innerHTML = `${scene.name}<small>${scene.id}</small>`;
  const c = cell(scene);
  cells.push(c);
  const acts = document.createElement("div"); acts.className = "acts";
  const step = document.createElement("button"); step.textContent = "Step"; step.onclick = () => c.inst.step();
  const gag = document.createElement("button"); gag.textContent = "Gag"; gag.onclick = () => c.inst.gag();
  const tap = document.createElement("button"); tap.textContent = "Tap"; tap.onclick = () => c.inst.poke({ target: "lead", x: c.inst.focusX(), y: 12 });
  acts.append(c.button, step, gag, tap);
  name.appendChild(acts);
  const cellEl = document.createElement("div"); cellEl.className = "cell";
  cellEl.append(c.out, c.box);
  main.append(name, cellEl);
}
document.body.appendChild(main);

function applyTheme() {
  document.body.classList.toggle("dark", theme === "dark");
  themeBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}
themeBtn.onclick = () => { theme = theme === "dark" ? "light" : "dark"; applyTheme(); };
allOn.onclick = () => { for (const c of cells) if (!c.running) setRunning(c, true); };
allOff.onclick = () => { for (const c of cells) if (c.running) setRunning(c, false); };
let spillOn = true;
spillBtn.onclick = () => { spillOn = !spillOn; spillBtn.setAttribute("aria-pressed", String(spillOn)); document.body.classList.toggle("spill-off", !spillOn); };
dayBtn.onclick = () => {
  fastDay = !fastDay;
  dayBtn.setAttribute("aria-pressed", String(fastDay));
  if (!fastDay) clockOffset = 0;   // back to the real time of day
};
applyTheme();

// -- The loop ----------------------------------------------------------------

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (fastDay) clockOffset += dt * 1000 * (86400 / DAY_SECONDS - 1);
  const text = clockText();
  if (clockEl.textContent !== text) clockEl.textContent = text;
  const view = { width: WIDTH, dpr: 1, theme, muted: muted(), reducedMotion: false, now: simNow(), duskMinutes: 40, scale: SCALE };
  for (const c of cells) {
    // A fast day would also age every run into dusk within a second; keep the run young so the clock alone sets the light.
    if (fastDay && c.running) c.inst.setMood(working(c.run));
    if (c.running && (c.stepAt -= dt) <= 0) { c.inst.step(); c.stepAt = STEP_EVERY; }
    c.inst.update(dt);
    beginFrame();
    c.inst.draw(c.art.getContext("2d")!, view);
    compose(c, endFrame());
    if (spillOn) c.inst.drawBelow(c.below.getContext("2d")!, c.box.clientWidth, c.box.clientHeight, 1);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
