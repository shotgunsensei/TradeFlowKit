export const LEAD_CONVERSION_CENTER_MODULE = {
  moduleKey: "lead_conversion_center",
  displayName: "Lead Conversion Center",
  shortDescription:
    "Capture every lead, respond faster, and convert opportunities into booked jobs.",
  category: "Growth",
  statusLabels: {
    notSetUp: "Not Set Up",
    demo: "Demo Mode",
    dryRun: "Dry-Run",
    live: "Live",
    needsAttention: "Needs Attention",
  },
  valueBullets: [
    "Capture website, call, and manual leads",
    "Prioritize hot leads automatically",
    "Track follow-ups before they fall through the cracks",
    "Convert qualified leads into customers and jobs",
    "Connect webhook, website, and automation sources",
    "Keep outreach controlled with dry-run/live safety",
  ],
} as const;

export type ModuleKey = typeof LEAD_CONVERSION_CENTER_MODULE.moduleKey;
