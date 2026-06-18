import type { AiMessage, Lead, MissedCall } from "@shared/schema";
import { scoreLead } from "./leadScoring";
import { storage } from "./storage";

function callRecoveryStatusToLeadStatus(status: MissedCall["status"]): string {
  if (status === "in_progress" || status === "recovered") return "contacted";
  return "new";
}

function normalizeCallUrgency(urgency?: string | null): "low" | "normal" | "urgent" | "emergency" {
  const value = (urgency || "").toLowerCase();
  if (value === "emergency") return "emergency";
  if (value === "soon" || value === "urgent" || value === "today") return "urgent";
  if (value === "flexible" || value === "low") return "low";
  return "normal";
}

function followUpAtForUrgency(urgency?: string | null): Date {
  const normalized = normalizeCallUrgency(urgency);
  const now = Date.now();
  if (normalized === "emergency" || normalized === "urgent") return new Date(now);
  if (normalized === "low") return new Date(now + 3 * 24 * 60 * 60 * 1000);
  return new Date(now + 24 * 60 * 60 * 1000);
}

function conversationSummary(messages: AiMessage[]): string {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);

  if (!userMessages.length) return "";
  return userMessages.slice(-3).join("\n");
}

function missedCallDescription(missedCall: MissedCall, messages: AiMessage[] = []): string {
  const summary = conversationSummary(messages);
  const parts = [
    missedCall.serviceType ? `Service: ${missedCall.serviceType}` : null,
    missedCall.location ? `Location: ${missedCall.location}` : null,
    missedCall.urgency ? `Urgency: ${missedCall.urgency}` : null,
    summary ? `Conversation:\n${summary}` : null,
    `Caller: ${missedCall.callerPhone}`,
    "Mirrored from Call Recovery AI missed-call workflow",
  ];
  return parts.filter(Boolean).join("\n");
}

function leadPayloadFromMissedCall(
  missedCall: MissedCall,
  messages: AiMessage[] = [],
  overrides: Partial<Lead> = {},
) {
  const payload = {
    source: "missed_call",
    sourceDetail: "Call Recovery AI",
    missedCallId: missedCall.id,
    phone: missedCall.callerPhone,
    name: missedCall.callerName || `Caller ${missedCall.callerPhone}`,
    status: callRecoveryStatusToLeadStatus(missedCall.status),
    serviceType: missedCall.serviceType || "",
    address: missedCall.location || "",
    description: missedCallDescription(missedCall, messages),
    urgency: normalizeCallUrgency(missedCall.urgency),
    preferredContact: "phone",
    aiSummary: conversationSummary(messages) || null,
    aiQualification: {
      serviceType: missedCall.serviceType || null,
      location: missedCall.location || null,
      urgency: missedCall.urgency || null,
      missedCallStatus: missedCall.status,
    },
    nextFollowUpAt: missedCall.status === "recovered" ? null : followUpAtForUrgency(missedCall.urgency),
    customerId: missedCall.customerId || null,
    jobId: missedCall.jobId || null,
    convertedAt: missedCall.customerId && missedCall.jobId ? missedCall.completedAt || new Date() : null,
    ...overrides,
  };
  const scored = scoreLead(payload);
  return {
    ...payload,
    urgency: scored.urgency,
    score: scored.score,
    scoreBreakdown: scored.breakdown,
  };
}

async function ensureConversionActivity(
  orgId: string,
  lead: Lead,
  customerId: string,
  jobId: string,
): Promise<void> {
  const activities = await storage.getLeadActivities(orgId, lead.id);
  const alreadyRecorded = activities.some(
    (activity) =>
      activity.type === "conversion" &&
      (activity.metadata as any)?.customerId === customerId &&
      (activity.metadata as any)?.jobId === jobId,
  );
  if (alreadyRecorded) return;

  await storage.createLeadActivity(orgId, lead.id, {
    type: "conversion",
    status: "converted",
    subject: "Call Recovery converted lead",
    body: "Call Recovery AI created or linked the customer and job.",
    metadata: { customerId, jobId, missedCallId: lead.missedCallId },
    createdBy: null,
  });
}

export async function ensureLeadForMissedCall(
  missedCall: MissedCall,
  messages: AiMessage[] = [],
  overrides: Partial<Lead> = {},
): Promise<Lead> {
  const existing = await storage.getLeadByMissedCall(missedCall.orgId, missedCall.id);
  const payload = leadPayloadFromMissedCall(missedCall, messages, overrides);

  if (existing) {
    const updated = await storage.updateLead(missedCall.orgId, existing.id, {
      ...payload,
      status: existing.status === "converted" ? "converted" : payload.status,
      customerId: existing.customerId || payload.customerId || null,
      jobId: existing.jobId || payload.jobId || null,
      convertedAt: existing.convertedAt || payload.convertedAt || null,
    } as Partial<Lead>);
    return updated || existing;
  }

  const created = await storage.createLead(missedCall.orgId, payload as any, null);
  await storage.createLeadActivity(missedCall.orgId, created.id, {
    type: "created",
    status: created.status,
    subject: "Missed call lead created",
    body: "Mirrored from Call Recovery AI missed-call workflow.",
    metadata: { missedCallId: missedCall.id },
    createdBy: null,
  });
  return created;
}

export async function syncLeadFromMissedCallConversation(
  missedCall: MissedCall,
  messages: AiMessage[],
  qualification?: { serviceType?: string; location?: string; urgency?: string },
): Promise<Lead> {
  return ensureLeadForMissedCall(missedCall, messages, {
    serviceType: qualification?.serviceType || missedCall.serviceType || "",
    address: qualification?.location || missedCall.location || "",
    urgency: normalizeCallUrgency(qualification?.urgency || missedCall.urgency),
    aiQualification: {
      serviceType: qualification?.serviceType || missedCall.serviceType || null,
      location: qualification?.location || missedCall.location || null,
      urgency: qualification?.urgency || missedCall.urgency || null,
      missedCallStatus: missedCall.status,
      messageCount: messages.length,
    },
    nextFollowUpAt: followUpAtForUrgency(qualification?.urgency || missedCall.urgency),
  } as Partial<Lead>);
}

export async function markMissedCallLeadConverted(
  missedCall: MissedCall,
  customerId: string,
  jobId: string,
  qualification?: { serviceType?: string; location?: string; urgency?: string },
): Promise<Lead> {
  const messages = await storage.getAiMessages(missedCall.id);
  const convertedLead = await ensureLeadForMissedCall(missedCall, messages, {
    status: "converted",
    customerId,
    jobId,
    convertedAt: missedCall.completedAt || new Date(),
    serviceType: qualification?.serviceType || missedCall.serviceType || "",
    address: qualification?.location || missedCall.location || "",
    urgency: normalizeCallUrgency(qualification?.urgency || missedCall.urgency),
    nextFollowUpAt: null,
  } as Partial<Lead>);

  const fresh = await storage.updateLead(missedCall.orgId, convertedLead.id, {
    status: "converted",
    customerId,
    jobId,
    convertedAt: convertedLead.convertedAt || new Date(),
    nextFollowUpAt: null,
  } as Partial<Lead>) || convertedLead;

  await ensureConversionActivity(missedCall.orgId, fresh, customerId, jobId);
  return fresh;
}
