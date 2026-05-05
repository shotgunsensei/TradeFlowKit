import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@shared/schema";

interface StatusBadgeProps {
  status: string;
  type?: "job" | "quote" | "invoice";
}

const QUOTE_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const INVOICE_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  processing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  void: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export function StatusBadge({ status, type = "job" }: StatusBadgeProps) {
  let colorClass = "";
  let label = status;

  if (type === "job") {
    colorClass = JOB_STATUS_COLORS[status] || "";
    label = JOB_STATUS_LABELS[status] || status;
  } else if (type === "quote") {
    colorClass = QUOTE_COLORS[status] || "";
    label = status.charAt(0).toUpperCase() + status.slice(1);
  } else if (type === "invoice") {
    colorClass = INVOICE_COLORS[status] || "";
    label = status.charAt(0).toUpperCase() + status.slice(1);
  }

  return (
    <span
      data-testid={`badge-status-${status}`}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}
