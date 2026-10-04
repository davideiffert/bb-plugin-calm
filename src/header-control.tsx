// A small control in the thread header: turn Calm off for just this thread,
// or pin one scene to it. The choice is kept per thread on the bb server.
import { useEffect, useId, useRef, useState } from "react";
import { experimental_useCodeTheme, type PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { SCENES } from "./scenes";
import { sprite, type Sprite } from "./scenes/common";
import type { ThemeMode } from "./scenes/types";
import type { SceneId } from "./settings";
import { usePrefs, useThreadPrefs } from "./use-prefs";

// One small icon per scene: a sheep's head, a little boat, a bright star.
const ICONS: Record<string, Sprite> = {
  pasture: ["..ss..", ".wwww.", "wwKKK.", "wwKeKK", ".wKKK.", "..KK.."],
  sea: ["...m...", "...mS..", "..smSS.", ".ssmSSS", "hhhhhhh", ".rrrrr."],
  night: ["...c...", "...c...", ".ccxcc.", "ccxxxcc", ".ccxcc.", "...c...", "...c..."],
};
const PALETTE: Record<ThemeMode, Record<string, string | null>> = {
  light: { s: "#ddd5c6", w: "#fbf8f1", K: "#3b3540", e: "#fbf8f1", m: "#6b4a2f", S: "#fbf8f1", h: "#8a5a36", r: "#c8553d", c: "#d9a93a", x: "#fff6d8", outline: "#9c958a" },
  dark: { s: "#c8c0b1", w: "#ece7dc", K: "#4a4452", e: "#f0ebe0", m: "#a07b55", S: "#ece7dc", h: "#b07a4e", r: "#d86a50", c: "#f3e2a0", x: "#ffffff", outline: null },
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

const NAMES: Record<string, string> = { "each-run": "a new one each time", "each-thread": "one per thread", pasture: "Pasture", sea: "Sea", night: "Night sky" };

export function CalmHeaderControl({ threadId }: PluginThreadHeaderActionProps) {
  const { prefs } = usePrefs();
  const { threadPrefs, saveThread, error } = useThreadPrefs(threadId);
  const theme: ThemeMode = experimental_useCodeTheme().mode;
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
  const iconId = threadPrefs.scene ?? (prefs.scene === "each-run" || prefs.scene === "each-thread" ? "pasture" : prefs.scene);
  const label = threadPrefs.off ? "Calm is off in this thread" : threadPrefs.scene ? `Calm: ${NAMES[threadPrefs.scene]} in this thread` : "Calm for this thread";
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
              <span>Follow settings <span className="calm-head-dim">({NAMES[prefs.scene]})</span></span>
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
