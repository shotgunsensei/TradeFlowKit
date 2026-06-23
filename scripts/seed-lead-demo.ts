import { ensureLeadForMissedCall } from "../server/callRecoveryLeadBridge";
import { pool } from "../server/db";
import { scoreLead } from "../server/leadScoring";
import { storage } from "../server/storage";

type DemoLeadInput = {
  key: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  sourceDetail: string;
  status: string;
  serviceType: string;
  description: string;
  urgency: string;
  estimatedValue?: string;
  preferredContact?: string;
  preferredTime?: string;
  consentToSms?: boolean;
  nextFollowUpAt?: Date | null;
  lastContactedAt?: Date | null;
};

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function isDemoScenario(lead: { metadata: unknown }, key: string): boolean {
  return !!(
    lead.metadata &&
    typeof lead.metadata === "object" &&
    (lead.metadata as Record<string, unknown>).demoLeadSeed === true &&
    (lead.metadata as Record<string, unknown>).demoScenario === key
  );
}

async function createDemoLead(orgId: string, createdBy: string | null, input: DemoLeadInput) {
  const existing = (await storage.getLeads(orgId)).find((lead) => isDemoScenario(lead, input.key));
  if (existing) return existing;

  const payload = {
    source: input.source,
    sourceDetail: input.sourceDetail,
    status: input.status,
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    serviceType: input.serviceType,
    description: input.description,
    urgency: input.urgency,
    estimatedValue: input.estimatedValue || null,
    preferredContact: input.preferredContact || "phone",
    preferredTime: input.preferredTime || null,
    consentToSms: input.consentToSms ?? true,
    consentSource: input.consentToSms === false ? null : "demo_seed",
    nextFollowUpAt: input.nextFollowUpAt || null,
    lastContactedAt: input.lastContactedAt || null,
    metadata: {
      demoLeadSeed: true,
      demoScenario: input.key,
    },
  };
  const scored = scoreLead(payload);
  const lead = await storage.createLead(orgId, {
    ...payload,
    urgency: scored.urgency,
    score: scored.score,
    scoreBreakdown: scored.breakdown,
  } as any, createdBy);

  await storage.createLeadActivity(orgId, lead.id, {
    type: "created",
    status: lead.status,
    subject: "Demo lead captured",
    body: input.description,
    metadata: { demoLeadSeed: true, demoScenario: input.key },
    createdBy,
  });

  return lead;
}

async function ensureFollowupTasks(orgId: string, leadId: string) {
  const existing = await storage.getLeadFollowupTasks(orgId, leadId);
  if (existing.length > 0) return;

  await storage.createLeadFollowupTask(orgId, leadId, {
    stepNumber: 1,
    channel: "sms",
    dueAt: hoursFromNow(-3),
    status: "pending",
    messageTemplate: "Hi {name}, checking in on your {service} request. What time works for a quick follow-up?",
    lastAttemptAt: null,
    completedAt: null,
    error: null,
  });
  await storage.createLeadFollowupTask(orgId, leadId, {
    stepNumber: 2,
    channel: "email",
    dueAt: daysFromNow(1),
    status: "completed",
    messageTemplate: "Hi {name}, thanks for contacting {business}.",
    lastAttemptAt: hoursFromNow(-24),
    completedAt: hoursFromNow(-23),
    error: null,
  });
  await storage.createLeadFollowupTask(orgId, leadId, {
    stepNumber: 3,
    channel: "sms",
    dueAt: hoursFromNow(-1),
    status: "failed",
    messageTemplate: "Hi {name}, we still have your request open.",
    lastAttemptAt: hoursFromNow(-1),
    completedAt: null,
    error: "Demo failed follow-up attempt",
  });
}

async function ensureFailedDryRunActivity(orgId: string, leadId: string, createdBy: string | null) {
  const existing = await storage.getLeadActivities(orgId, leadId);
  if (existing.some((activity) => (
    activity.metadata &&
    typeof activity.metadata === "object" &&
    (activity.metadata as Record<string, unknown>).demoScenario === "first-client-hvac-rooftop" &&
    (activity.metadata as Record<string, unknown>).demoFailedDryRun === true
  ))) return;

  await storage.createLeadActivity(orgId, leadId, {
    type: "message",
    channel: "sms",
    direction: "outbound",
    subject: "Demo dry-run SMS blocked",
    body: "Prepared message was blocked in demo because the lead needs consent review before live SMS.",
    status: "blocked",
    error: "Demo blocked dry-run message activity",
    metadata: {
      demoLeadSeed: true,
      demoScenario: "first-client-hvac-rooftop",
      demoFailedDryRun: true,
      mode: "blocked",
      dryRun: true,
      reason: "missing_sms_consent",
    },
    createdBy,
  });
}

async function seedMissedCallLead(orgId: string, createdBy: string | null) {
  const existing = (await storage.getLeads(orgId)).find((lead) => isDemoScenario(lead, "missed-call-recovery"));
  if (existing) return existing;

  const missedCall = await storage.createMissedCall(orgId, {
    callerName: "Morgan Missedcall",
    callerPhone: "555-414-0106",
    twilioCallSid: `demo-lead-${orgId}`,
  });
  const lead = await ensureLeadForMissedCall(missedCall, {
    name: "Morgan Missedcall",
    serviceType: "No-heat furnace callback",
    urgency: "urgent",
    description: "Demo missed-call recovery lead created from a caller who did not reach the office.",
    aiSummary: "Caller needs a furnace callback today and prefers SMS follow-up.",
  });
  await storage.updateLead(orgId, lead.id, {
    score: 78,
    status: "contacted",
    lastContactedAt: hoursFromNow(-2),
    metadata: { demoLeadSeed: true, demoScenario: "missed-call-recovery" },
  } as any);
  await storage.createLeadActivity(orgId, lead.id, {
    type: "ai_summary",
    status: "contacted",
    subject: "AI summary",
    body: "Missed-call caller needs a furnace callback today and prefers SMS follow-up.",
    metadata: { demoLeadSeed: true, demoScenario: "missed-call-recovery" },
    createdBy,
  });
  return storage.getLead(orgId, lead.id);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed lead demo data in production.");
  }
  const orgId = argValue("org-id");
  const createdBy = argValue("user-id") || null;
  if (!orgId) {
    throw new Error("Missing --org-id. Usage: npm run seed:lead-demo -- --org-id=<org_id> [--user-id=<user_id>]");
  }

  const org = await storage.getOrg(orgId);
  if (!org) throw new Error(`Org not found: ${orgId}`);

  await storage.upsertLeadSettings(orgId, {
    autoRespond: true,
    followUpEnabled: true,
    hotLeadThreshold: 75,
    dryRun: true,
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your request about {service}. What is the best time to follow up?",
    defaultEmailSubject: "Thanks for contacting {business}",
    defaultEmailTemplate: "Hi {name}, thanks for reaching out about {service}. We received your request and will follow up shortly.",
  });
  await storage.ensureDefaultLeadCaptureForm(orgId);

  const scenarios: DemoLeadInput[] = [
    {
      key: "emergency-hvac",
      name: "Avery Johnson",
      phone: "555-414-0100",
      email: "avery.demo@example.com",
      address: "104 Maple Ridge Rd",
      source: "website_form",
      sourceDetail: "Demo Website Form",
      status: "new",
      serviceType: "Emergency HVAC no cooling",
      description: "AC is out, house is 88 degrees, elderly parent at home. Needs same-day service.",
      urgency: "emergency",
      estimatedValue: "650",
      nextFollowUpAt: hoursFromNow(1),
    },
    {
      key: "commercial-electrical",
      name: "Brightside Market",
      phone: "555-414-0101",
      email: "facilities.demo@example.com",
      address: "220 Commerce Ave",
      source: "manual",
      sourceDetail: "Demo Office Intake",
      status: "qualified",
      serviceType: "Commercial electrical panel upgrade",
      description: "Business needs a panel upgrade quote before expanding refrigeration equipment.",
      urgency: "urgent",
      estimatedValue: "7800",
      lastContactedAt: hoursFromNow(-4),
      nextFollowUpAt: daysFromNow(1),
    },
    {
      key: "plumbing-overdue",
      name: "Riley Chen",
      phone: "555-414-0102",
      email: "riley.demo@example.com",
      address: "18 Cedar Ct",
      source: "website_form",
      sourceDetail: "Demo Website Form",
      status: "follow_up",
      serviceType: "Plumbing leak under sink",
      description: "Slow leak under kitchen sink. Asked for a callback yesterday.",
      urgency: "urgent",
      estimatedValue: "425",
      lastContactedAt: daysFromNow(-1),
      nextFollowUpAt: hoursFromNow(-3),
    },
    {
      key: "roofing-estimate",
      name: "Jordan Patel",
      phone: "555-414-0103",
      email: "jordan.demo@example.com",
      address: "77 Hilltop Dr",
      source: "manual",
      sourceDetail: "Demo Referral",
      status: "contacted",
      serviceType: "Roofing estimate",
      description: "Looking for a roof replacement estimate after storm damage.",
      urgency: "normal",
      estimatedValue: "12400",
      lastContactedAt: hoursFromNow(-3),
      nextFollowUpAt: daysFromNow(2),
    },
    {
      key: "landscaping-normal",
      name: "Sam Rivera",
      phone: "555-414-0104",
      email: "sam.demo@example.com",
      address: "9 Garden Way",
      source: "manual",
      sourceDetail: "Demo Walk-In",
      status: "new",
      serviceType: "Landscaping quote",
      description: "Wants spring cleanup and monthly maintenance pricing.",
      urgency: "normal",
      estimatedValue: "900",
      nextFollowUpAt: daysFromNow(3),
    },
    {
      key: "first-client-hvac-rooftop",
      name: "Northgate Fitness",
      phone: "555-414-0108",
      email: "manager.demo@example.com",
      address: "510 Industrial Pkwy",
      source: "website_form",
      sourceDetail: "First Client Deployment Demo",
      status: "qualified",
      serviceType: "Commercial rooftop HVAC unit replacement",
      description: "Commercial gym has intermittent cooling on a rooftop unit and wants a replacement quote before peak season.",
      urgency: "urgent",
      estimatedValue: "18500",
      preferredContact: "email",
      consentToSms: false,
      lastContactedAt: hoursFromNow(-6),
      nextFollowUpAt: hoursFromNow(-2),
    },
    {
      key: "converted-water-heater",
      name: "Taylor Brooks",
      phone: "555-414-0105",
      email: "taylor.demo@example.com",
      address: "33 River St",
      source: "manual",
      sourceDetail: "Demo Converted Lead",
      status: "qualified",
      serviceType: "Water heater replacement",
      description: "Qualified lead converted into a customer and job.",
      urgency: "urgent",
      estimatedValue: "2100",
      lastContactedAt: daysFromNow(-2),
    },
    {
      key: "lost-garage-door",
      name: "Casey Morgan",
      phone: "555-414-0107",
      email: "casey.demo@example.com",
      address: "410 Bay St",
      source: "manual",
      sourceDetail: "Demo Closed Lead",
      status: "lost",
      serviceType: "Garage door repair",
      description: "Demo lead closed as lost after the customer chose another provider.",
      urgency: "low",
      estimatedValue: "350",
      lastContactedAt: daysFromNow(-5),
    },
  ];

  const created = [];
  for (const scenario of scenarios) {
    const lead = await createDemoLead(orgId, createdBy, scenario);
    created.push(lead);
    if (scenario.key === "plumbing-overdue") await ensureFollowupTasks(orgId, lead.id);
    if (scenario.key === "first-client-hvac-rooftop") {
      await ensureFollowupTasks(orgId, lead.id);
      await ensureFailedDryRunActivity(orgId, lead.id, createdBy);
    }
    if (scenario.key === "converted-water-heater" && lead.status !== "converted") {
      await storage.convertLeadToCustomerAndJob(orgId, lead.id, { createdBy });
    }
  }
  await seedMissedCallLead(orgId, createdBy);

  console.log(`Seeded Lead Conversion Center demo data for org ${org.name} (${org.id}).`);
  console.log("Demo seed is idempotent by metadata.demoScenario.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
