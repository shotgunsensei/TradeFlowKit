import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type CsvImportField = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
};

export type CsvImportResult = {
  imported: number;
  skipped?: number;
  errors: { row: number; error: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  resourceLabel: string;
  fields: CsvImportField[];
  templateExampleRow: string[];
  templateFilename: string;
  onImport: (rows: Record<string, string>[]) => Promise<CsvImportResult>;
  onImported?: () => void;
};

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-]+/g, "");
}

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  resourceLabel,
  fields,
  templateExampleRow,
  templateFilename,
  onImport,
  onImported,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const close = () => {
    onOpenChange(false);
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setIsPending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const headerRow = fields.map((f) => f.label).join(",");
    const example = templateExampleRow
      .map((v) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v))
      .join(",");
    const csv = [headerRow, example].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const autoMap = (csvHeader: string): string => {
    const norm = normalizeHeader(csvHeader);
    for (const f of fields) {
      if (normalizeHeader(f.key) === norm) return f.key;
      if (normalizeHeader(f.label) === norm) return f.key;
      if (f.aliases?.some((a) => normalizeHeader(a) === norm)) return f.key;
    }
    return "skip";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        toast({ title: "Empty CSV", description: "Could not find any data rows.", variant: "destructive" });
        return;
      }
      const initialMap: Record<string, string> = {};
      parsed.headers.forEach((h) => {
        initialMap[h] = autoMap(h);
      });
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(initialMap);
      setResult(null);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string> = {};
    Object.entries(mapping).forEach(([csvHeader, fieldKey]) => {
      if (fieldKey && fieldKey !== "skip" && !mapped[fieldKey]) {
        mapped[fieldKey] = row[csvHeader] ?? "";
      }
    });
    return mapped;
  });

  const requiredFields = fields.filter((f) => f.required).map((f) => f.key);
  const mappedFieldKeys = new Set(Object.values(mapping));
  const missingRequired = requiredFields.filter((k) => !mappedFieldKeys.has(k));

  const handleConfirm = async () => {
    if (missingRequired.length > 0) return;
    setIsPending(true);
    try {
      const r = await onImport(mappedRows);
      setResult(r);
      onImported?.();
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-900 dark:text-green-300" data-testid="text-import-summary">
                  {result.imported} {resourceLabel}{result.imported !== 1 ? "s" : ""} imported successfully
                </p>
                {(result.skipped ?? 0) > 0 && (
                  <p className="text-sm text-green-800 dark:text-green-400 mt-0.5">
                    {result.skipped} duplicate{(result.skipped ?? 0) !== 1 ? "s" : ""} skipped
                  </p>
                )}
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped
                </p>
                <div className="rounded-lg border border-destructive/30 divide-y divide-border max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="px-3 py-2 text-sm">
                      <span className="font-medium">Row {e.row}:</span>{" "}
                      <span className="text-muted-foreground">{e.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={close} data-testid="button-import-done">Done</Button>
            </div>
          </div>
        ) : step === "upload" ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 border">
              <div className="flex-1">
                <p className="text-sm font-medium">Step 1 — Download the template</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Opens a CSV with the correct column headers and an example row.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="button-download-template">
                <Download className="h-4 w-4 mr-1.5" />
                Template
              </Button>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border space-y-3">
              <div>
                <p className="text-sm font-medium">Step 2 — Upload your CSV</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Required: {fields.filter((f) => f.required).map((f) => f.label).join(", ") || "—"}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-csv-file"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-select-csv">
                <Upload className="h-4 w-4 mr-1.5" />
                Select CSV File
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Preview — {rows.length} row{rows.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">
                {headers.length} column{headers.length !== 1 ? "s" : ""} detected
              </p>
            </div>

            <div className="rounded-lg border divide-y divide-border max-h-48 overflow-y-auto">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{header}</span>
                    <span className="text-xs text-muted-foreground truncate block">
                      e.g. {rows[0]?.[header] ? `"${String(rows[0][header]).slice(0, 40)}"` : "—"}
                    </span>
                  </div>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={mapping[header] ?? "skip"}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [header]: e.target.value }))
                    }
                    data-testid={`map-select-${header}`}
                  >
                    <option value="skip">— Skip —</option>
                    {fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                        {f.required ? " *" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <p className="text-xs text-destructive">
                ⚠ Map a column to:{" "}
                {missingRequired
                  .map((k) => fields.find((f) => f.key === k)?.label || k)
                  .join(", ")}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button
                disabled={missingRequired.length > 0 || mappedRows.length === 0 || isPending}
                onClick={handleConfirm}
                data-testid="button-confirm-import"
              >
                {isPending
                  ? "Importing..."
                  : `Import ${mappedRows.length} ${resourceLabel}${mappedRows.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
