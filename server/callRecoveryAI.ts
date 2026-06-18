import { errMsg } from "./errors";
import { storage } from "./storage";
import { markMissedCallLeadConverted, syncLeadFromMissedCallConversation } from "./callRecoveryLeadBridge";
import type { MissedCall, AiMessage } from "@shared/schema";
import { logger as rootLogger } from "./logger";

const log = rootLogger.child({ component: "call-recovery-ai" });

const SYSTEM_PROMPT = `You are an AI assistant for a service contractor business. A customer just called but couldn't reach the contractor. Your job is to help gather their service request details via SMS so the contractor can follow up.

You need to collect THREE pieces of information:
1. SERVICE TYPE - What kind of service do they need? (e.g., plumbing repair, electrical work, HVAC maintenance, etc.)
2. LOCATION - Where is the service needed? (address or general area description)
3. URGENCY - How urgent is this? (emergency/today, soon/this week, flexible/whenever available)

Guidelines:
- Be friendly, professional, and concise (this is SMS, keep messages short)
- Ask for ONE piece of information at a time
- If the caller provides multiple pieces of info in one message, acknowledge all of them
- Don't ask for information already provided
- When you have all three pieces, summarize what you collected and let them know the contractor will follow up
- Keep each response under 160 characters when possible (SMS length)

When you have gathered all three pieces of information, end your final message with the tag [COMPLETE] on its own line.
Also include a structured summary on the last line in this exact format:
[DATA]service_type|location|urgency[/DATA]
where urgency is one of: emergency, soon, flexible`;

interface ConversationResult {
  responseText: string;
  isComplete: boolean;
  serviceType?: string;
  location?: string;
  urgency?: string;
}

export async function processConversation(
  missedCallId: string,
  incomingMessage: string
): Promise<ConversationResult> {
  const missedCall = await storage.getMissedCall(missedCallId);
  if (!missedCall) {
    throw new Error("Missed call not found");
  }

  await storage.createAiMessage(missedCallId, "user", incomingMessage);

  const messages = await storage.getAiMessages(missedCallId);

  const openaiMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role as "system" | "assistant" | "user",
      content: m.content,
    })),
  ];

  const responseText = await callOpenAI(openaiMessages);

  await storage.createAiMessage(missedCallId, "assistant", responseText);

  const isComplete = responseText.includes("[COMPLETE]");
  let serviceType: string | undefined;
  let location: string | undefined;
  let urgency: string | undefined;

  if (isComplete) {
    const dataMatch = responseText.match(/\[DATA\](.*?)\[\/DATA\]/);
    if (dataMatch) {
      const parts = dataMatch[1].split("|");
      serviceType = parts[0]?.trim();
      location = parts[1]?.trim();
      urgency = parts[2]?.trim();
    }
  }

  const cleanResponse = responseText
    .replace(/\[COMPLETE\]\s*/g, "")
    .replace(/\[DATA\].*?\[\/DATA\]/g, "")
    .trim();

  try {
    const updatedMessages = await storage.getAiMessages(missedCallId);
    await syncLeadFromMissedCallConversation(missedCall, updatedMessages, {
      serviceType,
      location,
      urgency,
    });
  } catch (err) {
    log.warn({ err: errMsg(err), missedCallId }, "Failed to sync missed-call conversation to lead");
  }

  return {
    responseText: cleanResponse,
    isComplete,
    serviceType,
    location,
    urgency,
  };
}

export function generateInitialMessage(
  orgName: string,
  customTemplate?: string | null,
  opts?: { callerName?: string | null; orgPhone?: string | null }
): string {
  if (customTemplate && customTemplate.trim()) {
    const callerName = opts?.callerName?.trim() || "there";
    const orgPhone = opts?.orgPhone || orgName;
    return customTemplate
      .replace(/\{name\}/gi, callerName)
      .replace(/\{business\}/gi, orgName)
      .replace(/\{phone\}/gi, orgPhone)
      .replace(/\{business_name\}/gi, orgName)
      .replace(/\{org_name\}/gi, orgName);
  }
  return `Hi! This is an automated assistant for ${orgName}. We noticed you tried to reach us. How can we help? What service do you need today?`;
}

export function isQuietHours(quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = quietStart.split(":").map(Number);
  const [endH, endM] = quietEnd.split(":").map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

async function callOpenAI(
  messages: Array<{ role: "system" | "assistant" | "user"; content: string }>
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log.warn("OPENAI_API_KEY not set, using fallback response");
    return getFallbackResponse(messages);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.error({ err: errText }, "OpenAI API error");
      return getFallbackResponse(messages);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || getFallbackResponse(messages);
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "OpenAI call failed");
    return getFallbackResponse(messages);
  }
}

function getFallbackResponse(
  messages: Array<{ role: string; content: string }>
): string {
  const userMessages = messages.filter((m) => m.role === "user");
  const count = userMessages.length;

  if (count === 0) {
    return "Hi! What service do you need help with today?";
  }
  if (count === 1) {
    return "Got it! Can you tell me where this service is needed? (address or area)";
  }
  if (count === 2) {
    return "Thanks! How urgent is this - emergency, this week, or flexible timing?";
  }

  const lastMsg = userMessages[userMessages.length - 1]?.content || "";
  let urgencyVal = "flexible";
  if (/emergency|urgent|asap|today|now/i.test(lastMsg)) urgencyVal = "emergency";
  else if (/soon|week|few days/i.test(lastMsg)) urgencyVal = "soon";

  return `Thank you! I've noted your request. The contractor will follow up with you shortly.\n[COMPLETE]\n[DATA]general service|provided location|${urgencyVal}[/DATA]`;
}

export async function completeRecovery(
  missedCallId: string,
  serviceType: string,
  location: string,
  urgency: string
): Promise<{ customerId: string; jobId: string }> {
  const missedCall = await storage.getMissedCall(missedCallId);
  if (!missedCall) throw new Error("Missed call not found");

  const org = await storage.getOrg(missedCall.orgId);
  if (!org) throw new Error("Organization not found");

  const linkedLead = await storage.getLeadByMissedCall(missedCall.orgId, missedCall.id);
  if (missedCall.customerId && missedCall.jobId) {
    await markMissedCallLeadConverted(missedCall, missedCall.customerId, missedCall.jobId, {
      serviceType,
      location,
      urgency,
    });
    return { customerId: missedCall.customerId, jobId: missedCall.jobId };
  }
  if (linkedLead?.customerId && linkedLead.jobId && linkedLead.status === "converted") {
    await storage.updateMissedCall(missedCallId, {
      status: "recovered",
      serviceType,
      location,
      urgency,
      customerId: linkedLead.customerId,
      jobId: linkedLead.jobId,
      completedAt: missedCall.completedAt || new Date(),
    });
    return { customerId: linkedLead.customerId, jobId: linkedLead.jobId };
  }

  let existingCustomer = await findCustomerByPhone(missedCall.orgId, missedCall.callerPhone);

  let customerId: string;
  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const newCustomer = await storage.createCustomer(missedCall.orgId, {
      name: missedCall.callerName || `Caller ${missedCall.callerPhone}`,
      phone: missedCall.callerPhone,
      email: "",
      address: location,
      notes: "Auto-created from missed call recovery",
    });
    customerId = newCustomer.id;
  }

  const urgencyLabel = urgency === "emergency" ? "URGENT: " : urgency === "soon" ? "Priority: " : "";
  const job = await storage.createJob(
    missedCall.orgId,
    {
      title: `${urgencyLabel}${serviceType}`,
      description: `Service: ${serviceType}\nLocation: ${location}\nUrgency: ${urgency}\nCaller: ${missedCall.callerPhone}\n\nAuto-created from missed call recovery AI`,
      customerId,
      status: "lead",
    },
    null
  );

  await storage.updateMissedCall(missedCallId, {
    status: "recovered",
    serviceType,
    location,
    urgency,
    customerId,
    jobId: job.id,
    completedAt: new Date(),
  });

  await markMissedCallLeadConverted({
    ...missedCall,
    status: "recovered",
    serviceType,
    location,
    urgency,
    customerId,
    jobId: job.id,
    completedAt: new Date(),
  }, customerId, job.id, {
    serviceType,
    location,
    urgency,
  });

  return { customerId, jobId: job.id };
}

async function findCustomerByPhone(orgId: string, phone: string) {
  const allCustomers = await storage.getCustomers(orgId);
  const normalized = normalizePhone(phone);
  return allCustomers.find((c) => normalizePhone(c.phone || "") === normalized);
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
