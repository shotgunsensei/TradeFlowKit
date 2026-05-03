import { useEffect } from "react";

type HotkeyOptions = {
  enabled?: boolean;
  allowInInputs?: boolean;
  preventDefault?: boolean;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Register a global keyboard shortcut.
 *
 * `keys` examples:
 *   "mod+k"   — Ctrl+K on Windows/Linux, Cmd+K on macOS
 *   "e"       — single letter
 *   "?"       — shift+/
 *   "escape"
 */
export function useHotkey(
  keys: string,
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOptions = {},
) {
  const { enabled = true, allowInInputs = false, preventDefault = true } = opts;

  useEffect(() => {
    if (!enabled) return;

    const parts = keys.toLowerCase().split("+").map((p) => p.trim());
    const wantMod = parts.includes("mod") || parts.includes("ctrl") || parts.includes("cmd");
    const wantShift = parts.includes("shift");
    const wantAlt = parts.includes("alt");
    const key = parts.filter((p) => !["mod", "ctrl", "cmd", "shift", "alt"].includes(p))[0] || "";

    function onKey(e: KeyboardEvent) {
      if (!allowInInputs && isEditableTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (wantMod !== mod) return;
      if (wantShift !== e.shiftKey) {
        // Allow `?` which inherently requires shift on US keyboards
        if (!(key === "?" && e.shiftKey)) return;
      }
      if (wantAlt !== e.altKey) return;

      const pressed = e.key.toLowerCase();
      const matchesKey =
        pressed === key ||
        (key === "escape" && pressed === "escape") ||
        (key === "?" && (pressed === "?" || (e.shiftKey && pressed === "/")));
      if (!matchesKey) return;

      if (preventDefault) e.preventDefault();
      handler(e);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, handler, enabled, allowInInputs, preventDefault]);
}
