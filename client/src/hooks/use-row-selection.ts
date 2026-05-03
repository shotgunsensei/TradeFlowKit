import { useState, useMemo, useCallback, useEffect } from "react";

export function useRowSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visibleIds = useMemo(() => items.map((i) => i.id), [items]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(visibleIds);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(visibleIds);
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const selected = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  );
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const isSomeSelected = selectedIds.size > 0 && !isAllSelected;
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  return {
    selected,
    selectedItems,
    selectedCount: selectedIds.size,
    isSelected,
    isAllSelected,
    isSomeSelected,
    toggle,
    toggleAll,
    clear,
  };
}
