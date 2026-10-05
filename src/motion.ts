import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** The system's reduced-motion setting, kept live. */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia(QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(QUERY);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Still pictures: the system's reduced-motion setting, or Calm's own "Still pictures" switch. */
export function useReducedMotion(stillPictures = false): boolean {
  const system = useSystemReducedMotion();
  return system || stillPictures;
}
