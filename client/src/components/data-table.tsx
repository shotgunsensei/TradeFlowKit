import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  mobileHide?: boolean;
  sortFn?: (a: T, b: T) => number;
}

interface SelectionConfig {
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  emptyState?: React.ReactNode;
  testIdPrefix?: string;
  rowClassName?: (item: T) => string;
  activeFilters?: { label: string; value: string; onRemove: () => void }[];
  tableId?: string;
  selection?: SelectionConfig;
}

function readSortState(tableId: string): { key: string; dir: "asc" | "desc" } | null {
  try {
    const raw = localStorage.getItem(`dt_sort_${tableId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.key === "string" && (parsed.dir === "asc" || parsed.dir === "desc")) {
      return parsed as { key: string; dir: "asc" | "desc" };
    }
    return null;
  } catch {
    return null;
  }
}

function writeSortState(tableId: string, key: string, dir: "asc" | "desc"): void {
  try {
    localStorage.setItem(`dt_sort_${tableId}`, JSON.stringify({ key, dir }));
  } catch {
    // storage not available
  }
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  onRowClick,
  emptyState,
  testIdPrefix = "row",
  rowClassName,
  activeFilters,
  tableId,
  selection,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(() => {
    if (!tableId) return null;
    return readSortState(tableId)?.key ?? null;
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    if (!tableId) return "asc";
    return readSortState(tableId)?.dir ?? "asc";
  });

  useEffect(() => {
    if (tableId && sortKey) {
      writeSortState(tableId, sortKey, sortDir);
    }
  }, [tableId, sortKey, sortDir]);

  const handleSort = (col: Column<T>) => {
    if (!col.sortFn) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  const sortedData = (() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortFn) return data;
    const multiplier = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => col.sortFn!(a, b) * multiplier);
  })();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (sortedData.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const firstCol = columns[0];
  const restCols = columns.slice(1);

  return (
    <div className="space-y-3">
      {activeFilters && activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center px-4 pt-3">
          <span className="text-xs text-muted-foreground">Filters:</span>
          {activeFilters.map((f) => (
            <button
              key={f.value}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5 font-medium hover:bg-primary/20 transition-colors"
              onClick={f.onRemove}
              data-testid={`filter-chip-${f.value}`}
            >
              {f.label}
              <span className="text-primary/60 ml-0.5">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              {selection && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected ? true : selection.isSomeSelected ? "indeterminate" : false}
                    onCheckedChange={() => selection.toggleAll()}
                    aria-label="Select all"
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`${col.className || ""} ${col.sortFn ? "cursor-pointer select-none hover:bg-muted/40" : ""}`}
                  onClick={() => handleSort(col)}
                  aria-sort={
                    col.sortFn && sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortFn && (
                      <span className="text-muted-foreground/60">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3" />
                        )}
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow
                key={item.id}
                data-testid={`${testIdPrefix}-${item.id}`}
                className={`${onRowClick ? "cursor-pointer" : ""} ${selection?.isSelected(item.id) ? "bg-primary/5" : ""} ${rowClassName ? rowClassName(item) : ""}`}
                onClick={() => onRowClick?.(item)}
              >
                {selection && (
                  <TableCell
                    className="w-10"
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <Checkbox
                      checked={selection.isSelected(item.id)}
                      onCheckedChange={() => selection.toggle(item.id)}
                      aria-label="Select row"
                      data-testid={`checkbox-row-${item.id}`}
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {sortedData.map((item) => (
          <div
            key={item.id}
            data-testid={`${testIdPrefix}-mobile-${item.id}`}
            className={`border rounded-lg p-3 bg-card ${onRowClick ? "cursor-pointer active:opacity-80" : ""} ${selection?.isSelected(item.id) ? "ring-1 ring-primary/40 bg-primary/5" : ""} ${rowClassName ? rowClassName(item) : ""}`}
            onClick={() => onRowClick?.(item)}
          >
            <div className="flex items-start justify-between gap-3">
              {selection && (
                <div onClick={(e) => { e.stopPropagation(); }} className="pt-0.5">
                  <Checkbox
                    checked={selection.isSelected(item.id)}
                    onCheckedChange={() => selection.toggle(item.id)}
                    aria-label="Select row"
                    data-testid={`checkbox-row-mobile-${item.id}`}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">{firstCol.render(item)}</div>
              {restCols[0] && <div className="shrink-0">{restCols[0].render(item)}</div>}
            </div>
            {restCols.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {restCols
                  .slice(1)
                  .filter((col) => !col.mobileHide)
                  .map((col) => (
                    <div key={col.key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/60">{col.header}: </span>
                      {col.render(item)}
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
