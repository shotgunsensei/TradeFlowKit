export type LeadDemoFocus = "capture" | "score" | "hot" | "followup" | "message" | "convert";

export type LeadDemoWalkthroughStep = {
  title: string;
  outcome: string;
  detail: string;
  focus: LeadDemoFocus;
  actionLabel: string;
};

export const LEAD_DEMO_WALKTHROUGH_STEPS: LeadDemoWalkthroughStep[] = [
  {
    title: "A new lead comes in",
    outcome: "Capture every lead before it gets missed.",
    detail: "Website forms, missed calls, source links, and manual entries all land in the same lead list.",
    focus: "capture",
    actionLabel: "Show capture",
  },
  {
    title: "TradeFlowKit scores it",
    outcome: "Know whether the request needs attention now.",
    detail: "The score looks at urgency, service type, value signals, and trade-specific language.",
    focus: "score",
    actionLabel: "Show scoring",
  },
  {
    title: "Hot leads rise to the top",
    outcome: "Know who to call first.",
    detail: "Urgent and high-intent leads appear in the operator dashboard before routine work.",
    focus: "hot",
    actionLabel: "Show hot leads",
  },
  {
    title: "Follow-ups are scheduled",
    outcome: "Follow up before leads go cold.",
    detail: "Due and overdue follow-ups stay visible so office staff can keep the pipeline moving.",
    focus: "followup",
    actionLabel: "Show follow-ups",
  },
  {
    title: "Dry-run messages are prepared",
    outcome: "Review outreach safely before going live.",
    detail: "Messages are logged in dry-run mode and only send when the org explicitly enables live messaging.",
    focus: "message",
    actionLabel: "Show messaging",
  },
  {
    title: "Qualified leads convert into customers and jobs",
    outcome: "Turn a good lead into the lead-to-cash workflow.",
    detail: "Conversion creates or reuses a customer and opens a job lead without replacing quotes, invoices, or payments.",
    focus: "convert",
    actionLabel: "Show conversion",
  },
];

export const LEAD_FIRST_RUN_CHECKLIST = [
  "Choose trade template",
  "Add business details",
  "Create lead capture form",
  "Connect first lead source",
  "Review templates",
  "Confirm dry-run/live mode",
  "Create first lead",
] as const;
