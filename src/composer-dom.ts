// bb has no plugin API to paint the chat input, so this finds the prompt box
// that shares a banner's `[data-app-composer]` shell in bb's markup. A null
// means the markup wasn't recognized, and the caller does nothing.
const SHELL_SELECTOR = "[data-app-composer]";

/** The chat input's outer box, from any element inside the same composer shell. */
export function findComposerSurface(from: Element): HTMLElement | null {
  return from.closest(SHELL_SELECTOR)?.querySelector<HTMLElement>("form[data-promptbox]") ?? null;
}
