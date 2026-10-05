// Calm's few uses of bb's experimental plugin APIs, each behind a fallback,
// so a rename in a future bb never stops Calm from loading. Today that is
// the code theme (light or dark) and the thread header button.
import { useEffect, useState } from "react";
import { experimental_useCodeTheme } from "@get-bb/plugin-sdk/app";
import type { ThemeMode } from "./kit/types";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const pageTheme = (): ThemeMode =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark"
    : typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches ? "dark" : "light";

/** The page's own light or dark, kept live: the fallback when bb's code theme isn't there. */
function usePageTheme(): ThemeMode {
  const [mode, setMode] = useState(pageTheme);
  useEffect(() => {
    const on = () => setMode(pageTheme());
    const mq = typeof matchMedia === "function" ? matchMedia(DARK_QUERY) : null;
    mq?.addEventListener("change", on);
    const watch = typeof MutationObserver === "function" ? new MutationObserver(on) : null;
    watch?.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { mq?.removeEventListener("change", on); watch?.disconnect(); };
  }, []);
  return mode;
}

/** Light or dark, from bb's code theme when this bb has it, else from the page. */
export function useThemeMode(): ThemeMode {
  const page = usePageTheme();   // always called, so the hook order never changes
  try {
    const mode = experimental_useCodeTheme().mode;
    return mode === "dark" || mode === "light" ? mode : page;
  } catch {
    return page;
  }
}

/** Register a slot only if this bb offers it; a missing or changed one is skipped, not fatal. */
export function optionalSlot(register: (() => unknown) | undefined, name: string) {
  if (typeof register !== "function") { console.info(`Calm: this bb has no ${name}; skipping it.`); return; }
  try { register(); } catch (e) { console.warn(`Calm: couldn't add the ${name}:`, e); }
}
