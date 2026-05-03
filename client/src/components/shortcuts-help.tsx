import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useHotkey } from "@/hooks/use-hotkey";

type Shortcut = { keys: string; description: string };

type ShortcutsContext = {
  registerPageShortcuts: (shortcuts: Shortcut[]) => () => void;
  open: () => void;
};

const Ctx = createContext<ShortcutsContext | null>(null);

const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: "⌘ K  /  Ctrl K", description: "Open command palette" },
  { keys: "?", description: "Show keyboard shortcuts" },
  { keys: "Esc", description: "Close dialogs" },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
      {children}
    </kbd>
  );
}

export function ShortcutsHelpProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageShortcuts, setPageShortcuts] = useState<Shortcut[]>([]);

  const registerPageShortcuts = useCallback((shortcuts: Shortcut[]) => {
    setPageShortcuts(shortcuts);
    return () => {
      setPageShortcuts((curr) =>
        curr === shortcuts ? [] : curr,
      );
    };
  }, []);

  useHotkey("?", () => setIsOpen((v) => !v));

  return (
    <Ctx.Provider value={{ registerPageShortcuts, open: () => setIsOpen(true) }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-shortcuts-help">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>Use these shortcuts to move faster.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <section>
              <h4 className="text-sm font-semibold mb-2">Global</h4>
              <ul className="space-y-1.5">
                {GLOBAL_SHORTCUTS.map((s) => (
                  <li key={s.keys} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.description}</span>
                    <Kbd>{s.keys}</Kbd>
                  </li>
                ))}
              </ul>
            </section>

            {pageShortcuts.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold mb-2">This page</h4>
                <ul className="space-y-1.5">
                  {pageShortcuts.map((s) => (
                    <li
                      key={s.keys + s.description}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{s.description}</span>
                      <Kbd>{s.keys}</Kbd>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export function usePageShortcuts(shortcuts: Shortcut[]) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerPageShortcuts(shortcuts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(shortcuts)]);
}
