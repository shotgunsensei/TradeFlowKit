import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2.5 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
      data-testid="bulk-action-bar"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear} className="h-8 w-8 p-0" data-testid="button-bulk-clear">
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium" data-testid="text-bulk-count">
            {count} selected
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">{children}</div>
      </div>
    </div>
  );
}
