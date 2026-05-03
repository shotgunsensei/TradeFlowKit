function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV<T>(rows: T[], columns: { header: string; value: (row: T) => unknown }[]): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(",");
  const dataLines = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
