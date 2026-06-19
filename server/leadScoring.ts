import type { Lead } from "@shared/schema";
import { getLeadTradeTemplate, type LeadTradeTemplate } from "@shared/leadTradeTemplates";

export type LeadUrgency = "low" | "normal" | "urgent" | "emergency";

export interface LeadScoreResult {
  score: number;
  urgency: LeadUrgency;
  breakdown: Record<string, number | string | boolean>;
  recommendedAction: string;
}

export type LeadScoreOptions = {
  tradeTemplateKey?: string | null;
  template?: LeadTradeTemplate | null;
};

type LeadScoreInput = Partial<Pick<
  Lead,
  "name" | "phone" | "email" | "address" | "serviceType" | "description" | "urgency" | "estimatedValue" | "source"
>>;

const EMERGENCY_PATTERNS = [
  /emergency/i,
  /asap/i,
  /\btoday\b/i,
  /no heat/i,
  /\bleak\b/i,
  /electrical hazard/i,
  /roof leak/i,
  /flood/i,
  /sparking/i,
  /burst pipe/i,
];

const HIGH_VALUE_PATTERNS = [
  /commercial/i,
  /\bpanel\b/i,
  /replacement/i,
  /full system/i,
  /roof replacement/i,
  /remodel/i,
  /renovation/i,
  /install/i,
  /upgrade/i,
];

const SPAM_PATTERNS = [
  /seo/i,
  /crypto/i,
  /casino/i,
  /backlink/i,
  /guest post/i,
  /loan/i,
  /viagra/i,
  /winner/i,
];

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function textForLead(lead: LeadScoreInput): string {
  return [
    lead.name,
    lead.serviceType,
    lead.description,
    lead.address,
    lead.source,
  ].filter(Boolean).join(" ");
}

function matchesAny(text: string, keywords: string[] = []): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function inferUrgency(lead: LeadScoreInput, text: string, template?: LeadTradeTemplate): LeadUrgency {
  if (lead.urgency === "emergency" || EMERGENCY_PATTERNS.some((p) => p.test(text))) return "emergency";
  if (template && lead.urgency !== "low" && matchesAny(text, template.urgencyKeywords).length > 0) return "emergency";
  if (lead.urgency === "urgent") return "urgent";
  if (lead.urgency === "low") return "low";
  return "normal";
}

export function scoreLead(lead: LeadScoreInput, options: LeadScoreOptions = {}): LeadScoreResult {
  const text = textForLead(lead);
  const template = options.template || getLeadTradeTemplate(options.tradeTemplateKey);
  const urgency = inferUrgency(lead, text, template);
  const breakdown: Record<string, number | string | boolean> = {};
  let score = 35;

  if (urgency === "emergency") {
    score += 35;
    breakdown.emergencyIntent = 35;
  } else if (urgency === "urgent") {
    score += 22;
    breakdown.urgentIntent = 22;
  } else if (urgency === "low") {
    score -= 8;
    breakdown.lowUrgency = -8;
  }

  if (lead.phone?.trim()) {
    score += 12;
    breakdown.phonePresent = 12;
  } else {
    score -= 15;
    breakdown.phoneMissing = -15;
  }

  if (lead.email?.trim()) {
    score += 6;
    breakdown.emailPresent = 6;
  }

  if (lead.address?.trim()) {
    score += 8;
    breakdown.addressPresent = 8;
  }

  if (lead.serviceType?.trim()) {
    score += 8;
    breakdown.serviceKnown = 8;
  } else {
    score -= 8;
    breakdown.serviceVague = -8;
  }

  if (HIGH_VALUE_PATTERNS.some((p) => p.test(text))) {
    score += 12;
    breakdown.highValueWork = 12;
  }

  const estimated = Number(lead.estimatedValue || 0);
  if (Number.isFinite(estimated) && estimated >= 1000) {
    score += 8;
    breakdown.estimatedValue = 8;
  }

  if (!lead.description?.trim() && !lead.serviceType?.trim()) {
    score -= 10;
    breakdown.vagueRequest = -10;
  }

  if (SPAM_PATTERNS.some((p) => p.test(text))) {
    score -= 45;
    breakdown.spamSignals = -45;
  }

  if (template) {
    const serviceMatches = matchesAny(text, template.serviceCategories);
    const urgencyMatches = matchesAny(text, template.urgencyKeywords);
    const valueMatches = matchesAny(text, template.highValueKeywords);
    const disqualificationMatches = matchesAny(text, template.disqualificationKeywords);

    breakdown.tradeTemplate = template.tradeKey;

    if (serviceMatches.length > 0) {
      score += template.leadScoringModifiers.serviceCategoryBoost;
      breakdown.tradeServiceCategory = template.leadScoringModifiers.serviceCategoryBoost;
      breakdown.tradeServiceMatched = serviceMatches[0];
    }

    if (urgencyMatches.length > 0) {
      score += template.leadScoringModifiers.urgencyKeywordBoost;
      breakdown.tradeUrgencyKeyword = template.leadScoringModifiers.urgencyKeywordBoost;
      breakdown.tradeUrgencyMatched = urgencyMatches[0];
    }

    if (valueMatches.length > 0) {
      score += template.leadScoringModifiers.highValueKeywordBoost;
      breakdown.tradeHighValueKeyword = template.leadScoringModifiers.highValueKeywordBoost;
      breakdown.tradeHighValueMatched = valueMatches[0];
    }

    if (disqualificationMatches.length > 0) {
      score += template.leadScoringModifiers.disqualificationPenalty;
      breakdown.tradeDisqualificationSignal = template.leadScoringModifiers.disqualificationPenalty;
      breakdown.tradeDisqualificationMatched = disqualificationMatches[0];
    }
  }

  const finalScore = clamp(score);
  let recommendedAction = "Review and qualify the lead.";
  if (finalScore >= 80) recommendedAction = "Contact immediately and move toward booking.";
  else if (finalScore >= 60) recommendedAction = "Follow up today and qualify scope.";
  else if (finalScore >= 35) recommendedAction = "Ask for missing details before booking.";
  else recommendedAction = "Screen for fit or mark lost/spam.";

  return {
    score: finalScore,
    urgency,
    breakdown: {
      ...breakdown,
      urgency,
      recommendedAction,
    },
    recommendedAction,
  };
}
