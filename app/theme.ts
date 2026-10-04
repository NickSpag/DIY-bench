// Light, dark or follow the system. The choice is a per-viewer convenience kept in localStorage.
import { useWb, type ThemePref } from "./store.ts";

const KEY = "wb-theme";

export function installTheme(): void {
  let pref: ThemePref = "auto";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "auto") pref = v;
  } catch {
    // storage blocked
  }
  const apply = (p: ThemePref) => {
    if (p === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", p);
  };
  apply(pref);
  useWb.setState({ theme: pref });
  useWb.subscribe((s, p) => {
    if (s.theme === p.theme) return;
    apply(s.theme);
    try {
      localStorage.setItem(KEY, s.theme);
    } catch {
      // storage blocked
    }
  });
}

/** True when the page currently renders dark. */
export function isDark(): boolean {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr) return attr === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Reads a theme token, e.g. css("--wood"). */
export function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
