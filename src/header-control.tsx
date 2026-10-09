// A small control in the thread header: turn Calm off for just this thread,
// or pin one scene to it. The choice is kept per thread on the bb server.
import { useEffect, useId, useRef, useState } from "react";
import type { PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { useThemeMode } from "./compat";
import { SCENES } from "./scenes";
import { sprite, type Sprite } from "./kit/common";
import type { ThemeMode } from "./kit/types";
import type { SceneId } from "./settings";
import { usePrefs, useThreadPrefs } from "./use-prefs";

// One small icon per scene, from a sheep's head to a ringed planet.
const ICONS: Record<string, Sprite> = {
  pasture: ["..ss..", ".wwww.", "wwKKK.", "wwKeKK", ".wKKK.", "..KK.."],
  sea: ["...m...", "...mS..", "..smSS.", ".ssmSSS", "hhhhhhh", ".rrrrr."],
  night: ["...c...", "...c...", ".ccxcc.", "ccxxxcc", ".ccxcc.", "...c...", "...c..."],
  balloons: [".RYB.", "RRYBB", "RRYBB", ".RYB.", "..k..", ".hhh."],
  pond: ["...gg.", "..gGgo", "..gg..", "w.ww..", "wwwww."],
  train: ["k.....", "kk.RRR", "BBBBRR", "BBBBBB", ".o..o."],
  garden: [".p.", "pyp", ".p.", "lG.", ".G."],
  campfire: [".o.", "oyo", "oyo", "hhh"],
  underwater: ["..GG..", ".GlGG.", "GGGGGg", ".g..g."],
  village: ["..x..", ".xxx.", "xxxxx", ".hhh.", ".hdh."],
  mountain: ["...x...", "..xMx..", ".MMMMM.", "MMMMMMM"],
  kites: ["..R..", ".RYR.", "RYYYR", ".RYR.", "..R..", "...R."],
  desert: ["..G..", "G.G..", "GGG.G", "..GGG", "..G.."],
  city: ["M.....", "M.MM..", "MMMM.M", "MYMMYM", "MMMMMM"],
  lighthouse: ["..Y..", ".ddd.", ".RxR.", ".RRR.", "RRRRR"],
  space: ["..PP..", ".PPPP.", "IIIIII", ".PPPP.", "..PP.."],
};
const PALETTE: Record<ThemeMode, Record<string, string | null>> = {
  light: {
    s: "#ddd5c6", w: "#fbf8f1", K: "#3b3540", e: "#fbf8f1", m: "#6b4a2f", S: "#fbf8f1", h: "#8a5a36", r: "#c8553d", c: "#e9dcae", x: "#fff6d8",
    R: "#d9534f", Y: "#f2c94c", B: "#4f8fd6", k: "#6b6f7a", g: "#3f8a5c", G: "#2f6b47", o: "#ee6a3a", p: "#e88bb0", y: "#f2c94c", l: "#7aa35a",
    M: "#8a90a0", P: "#e0b07a", I: "#b07ad9", d: "#4a4452",
    outline: "#9c958a",
  },
  dark: {
    s: "#c8c0b1", w: "#ece7dc", K: "#4a4452", e: "#f0ebe0", m: "#a07b55", S: "#ece7dc", h: "#b07a4e", r: "#d86a50", c: "#f3e2a0", x: "#ffffff",
    R: "#e06a5f", Y: "#f2d06a", B: "#6fa3e8", k: "#a0a4ae", g: "#52a674", G: "#3d8058", o: "#f0703a", p: "#e88bb0", y: "#f2d06a", l: "#6d9450",
    M: "#a0a6b4", P: "#c8905a", I: "#a07ad0", d: "#8a8f9a",
    outline: null,
  },
};

function SceneIcon({ id, theme }: { id: string; theme: ThemeMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const art = sprite(ICONS[id] ?? ICONS.pasture, PALETTE[theme], false, "wsS");
    c.width = art.width; c.height = art.height;
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(art, 0, 0);
  }, [id, theme]);
  return <canvas ref={ref} className="calm-head-art" aria-hidden="true" />;
}

/** What each choice is called: the two rotating choices, then every scene by its own name. */
const NAMES: Record<string, string> = {
  "each-run": "a new one each time",
  "each-thread": "one per thread",
  "each-project": "one per project",
  ...Object.fromEntries(SCENES.map((s) => [s.id, s.name])),
};
export const choiceName = (choice: string) => NAMES[choice] ?? "a scene";

export function CalmHeaderControl({ threadId }: PluginThreadHeaderActionProps) {
  const { prefs } = usePrefs();
  const { threadPrefs, saveThread, error } = useThreadPrefs(threadId);
  const theme: ThemeMode = useThemeMode();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Focus moves into the panel when it opens and back to the button when it closes with Escape.
  const close = (refocus: boolean) => { setOpen(false); if (refocus) buttonRef.current?.focus(); };
  useEffect(() => { if (open) panelRef.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [open]);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) close(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!prefs.features.header) return null;

  // A pinned or chosen scene shows its own icon; a rotating choice shows the sheep.
  const iconId = threadPrefs.scene ?? (prefs.scene === "each-run" || prefs.scene === "each-thread" || prefs.scene === "each-project" ? "pasture" : prefs.scene);
  const label = threadPrefs.off ? "Calm is off in this thread" : threadPrefs.scene ? `Calm: ${choiceName(threadPrefs.scene)} in this thread` : "Calm for this thread";
  const pick = (scene: SceneId | null) => void saveThread({ scene });
  return (
    <div className="calm-head" ref={boxRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`calm-head-button${threadPrefs.off ? " calm-head-off" : ""}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <SceneIcon id={iconId} theme={theme} />
      </button>
      {open && (
        <div className="calm-head-panel" id={panelId} role="dialog" aria-label="Calm for this thread" ref={panelRef}>
          <label className="calm-head-row">
            <input type="checkbox" checked={!threadPrefs.off} onChange={(e) => void saveThread({ off: !e.target.checked })} />
            <span>Show Calm in this thread</span>
          </label>
          <div className="calm-head-group" role="radiogroup" aria-label="Scene for this thread">
            <div className="calm-head-heading">Scene here</div>
            <label className="calm-head-row">
              <input type="radio" name={`${panelId}-scene`} checked={!threadPrefs.scene} disabled={threadPrefs.off} onChange={() => pick(null)} />
              <span>Follow settings <span className="calm-head-dim">({choiceName(prefs.scene)})</span></span>
            </label>
            {SCENES.map((s) => (
              <label className="calm-head-row" key={s.id}>
                <input type="radio" name={`${panelId}-scene`} checked={threadPrefs.scene === s.id} disabled={threadPrefs.off} onChange={() => pick(s.id as SceneId)} />
                <SceneIcon id={s.id} theme={theme} />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
          {error && <p className="calm-head-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
