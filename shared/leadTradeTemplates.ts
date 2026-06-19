export type LeadTradeKey =
  | "hvac"
  | "electrical"
  | "plumbing"
  | "roofing"
  | "landscaping"
  | "general_contractor"
  | "it_field_service";

export type LeadFollowUpStep = {
  stepNumber: number;
  label: string;
  delayDays: number;
  channel: "sms" | "email";
  messageTemplate: string;
};

export type LeadTradeTemplate = {
  tradeKey: LeadTradeKey;
  tradeName: string;
  serviceCategories: string[];
  urgencyKeywords: string[];
  highValueKeywords: string[];
  disqualificationKeywords: string[];
  defaultLeadSources: string[];
  leadScoringModifiers: {
    urgencyKeywordBoost: number;
    highValueKeywordBoost: number;
    serviceCategoryBoost: number;
    disqualificationPenalty: number;
  };
  qualificationQuestions: string[];
  defaultSmsTemplate: string;
  defaultEmailSubject: string;
  defaultEmailTemplate: string;
  defaultFollowUpSequence: LeadFollowUpStep[];
  proposalStarterNotes: string[];
  dashboardLabelCopy: {
    hotLeads: string;
    needsContact: string;
    followUp: string;
  };
  exampleLeadText: string;
};

const COMMON_FOLLOW_UPS: LeadFollowUpStep[] = [
  {
    stepNumber: 1,
    label: "Day 1 follow-up",
    delayDays: 1,
    channel: "sms",
    messageTemplate: "Hi {name}, checking in on your {service} request. What time is best for a quick follow-up?",
  },
  {
    stepNumber: 2,
    label: "Day 3 reminder",
    delayDays: 3,
    channel: "email",
    messageTemplate: "Hi {name}, we still have your {service} request open. Reply with any details and we can help get the next step scheduled.",
  },
  {
    stepNumber: 3,
    label: "Day 7 final check-in",
    delayDays: 7,
    channel: "email",
    messageTemplate: "Hi {name}, should we keep your {service} request open? We can still help if you need service.",
  },
];

export const LEAD_TRADE_TEMPLATES: LeadTradeTemplate[] = [
  {
    tradeKey: "hvac",
    tradeName: "HVAC",
    serviceCategories: ["No cooling", "No heat", "System replacement", "Maintenance", "Ductwork", "Thermostat", "Commercial rooftop unit"],
    urgencyKeywords: ["no cooling", "no heat", "emergency", "asap", "same day", "commercial rooftop down"],
    highValueKeywords: ["system replacement", "full system", "commercial rooftop", "ductwork", "install"],
    disqualificationKeywords: ["seo", "wholesale leads", "warranty scam"],
    defaultLeadSources: ["Website Form", "Missed Call", "Google Business Profile", "Referral"],
    leadScoringModifiers: { urgencyKeywordBoost: 14, highValueKeywordBoost: 12, serviceCategoryBoost: 6, disqualificationPenalty: -35 },
    qualificationQuestions: ["Is the system heating/cooling at all?", "Is this residential or commercial?", "How old is the current system?", "Is same-day service needed?"],
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your HVAC request about {service}. What is the best time to follow up?",
    defaultEmailSubject: "We received your HVAC service request",
    defaultEmailTemplate: "Hi {name}, thanks for reaching out about {service}. We will review the HVAC details and follow up shortly to help get you scheduled.",
    defaultFollowUpSequence: COMMON_FOLLOW_UPS,
    proposalStarterNotes: ["Confirm equipment type and age.", "Ask whether repair or replacement is preferred.", "Capture model/serial photos if available."],
    dashboardLabelCopy: { hotLeads: "No heat/no cooling calls", needsContact: "HVAC leads to call now", followUp: "HVAC follow-ups due" },
    exampleLeadText: "Examples: no cooling, no heat, system replacement, maintenance call.",
  },
  {
    tradeKey: "electrical",
    tradeName: "Electrical",
    serviceCategories: ["Panel upgrade", "No power", "Outlet/switch", "Generator", "EV charger", "Commercial wiring", "Emergency electrical"],
    urgencyKeywords: ["no power", "sparking", "burning smell", "emergency electrical", "breaker tripping", "hazard"],
    highValueKeywords: ["panel upgrade", "generator", "ev charger", "commercial wiring", "service upgrade"],
    disqualificationKeywords: ["seo", "backlink", "cheap leads"],
    defaultLeadSources: ["Website Form", "Missed Call", "Referral", "Builder Partner"],
    leadScoringModifiers: { urgencyKeywordBoost: 14, highValueKeywordBoost: 12, serviceCategoryBoost: 6, disqualificationPenalty: -35 },
    qualificationQuestions: ["Is there active sparking or burning smell?", "Is power out to the whole property or one circuit?", "Is a permit likely needed?", "What panel amperage is installed now?"],
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your electrical request about {service}. Is there any active hazard right now?",
    defaultEmailSubject: "We received your electrical service request",
    defaultEmailTemplate: "Hi {name}, thanks for contacting us about {service}. We will review the electrical details and follow up with the safest next step.",
    defaultFollowUpSequence: COMMON_FOLLOW_UPS,
    proposalStarterNotes: ["Confirm active hazards before scheduling.", "Ask for panel photos.", "Note permit or utility coordination needs."],
    dashboardLabelCopy: { hotLeads: "Electrical hazards and upgrades", needsContact: "Electrical leads to call now", followUp: "Electrical follow-ups due" },
    exampleLeadText: "Examples: no power, panel upgrade, EV charger, generator install.",
  },
  {
    tradeKey: "plumbing",
    tradeName: "Plumbing",
    serviceCategories: ["Leak", "Water heater", "Drain clog", "Sewer line", "Burst pipe", "Fixture install", "Emergency plumbing"],
    urgencyKeywords: ["leak", "burst pipe", "flood", "no water", "sewer backup", "emergency plumbing"],
    highValueKeywords: ["water heater", "sewer line", "repiping", "tankless", "main line"],
    disqualificationKeywords: ["seo", "backlink", "lead resale"],
    defaultLeadSources: ["Website Form", "Missed Call", "Referral", "Property Manager"],
    leadScoringModifiers: { urgencyKeywordBoost: 14, highValueKeywordBoost: 10, serviceCategoryBoost: 6, disqualificationPenalty: -35 },
    qualificationQuestions: ["Is water actively leaking?", "Can the customer shut off water?", "Is the issue inside, outside, or at the main line?", "Is this residential or commercial?"],
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your plumbing request about {service}. Is water actively leaking right now?",
    defaultEmailSubject: "We received your plumbing request",
    defaultEmailTemplate: "Hi {name}, thanks for reaching out about {service}. We will review the plumbing details and follow up shortly.",
    defaultFollowUpSequence: COMMON_FOLLOW_UPS,
    proposalStarterNotes: ["Confirm shutoff status.", "Capture photos of leak or fixture.", "Ask about access and cleanup needs."],
    dashboardLabelCopy: { hotLeads: "Leaks and urgent plumbing", needsContact: "Plumbing leads to call now", followUp: "Plumbing follow-ups due" },
    exampleLeadText: "Examples: leak, burst pipe, water heater, sewer line, drain clog.",
  },
  {
    tradeKey: "roofing",
    tradeName: "Roofing",
    serviceCategories: ["Roof leak", "Storm damage", "Replacement", "Inspection", "Insurance claim", "Metal roof", "Shingle repair"],
    urgencyKeywords: ["roof leak", "water coming in", "storm damage", "tarp", "emergency"],
    highValueKeywords: ["replacement", "insurance claim", "metal roof", "full roof", "commercial roof"],
    disqualificationKeywords: ["seo", "hail leads", "backlink"],
    defaultLeadSources: ["Website Form", "Missed Call", "Referral", "Storm Campaign"],
    leadScoringModifiers: { urgencyKeywordBoost: 12, highValueKeywordBoost: 14, serviceCategoryBoost: 6, disqualificationPenalty: -35 },
    qualificationQuestions: ["Is water actively entering the home?", "Was there recent storm damage?", "Is insurance involved?", "What roof type is installed now?"],
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your roofing request about {service}. Is water actively coming in?",
    defaultEmailSubject: "We received your roofing request",
    defaultEmailTemplate: "Hi {name}, thanks for reaching out about {service}. We will review the roofing details and follow up with next steps.",
    defaultFollowUpSequence: COMMON_FOLLOW_UPS,
    proposalStarterNotes: ["Ask for interior/exterior photos.", "Confirm insurance claim status.", "Note roof age and material."],
    dashboardLabelCopy: { hotLeads: "Leaks and storm damage", needsContact: "Roofing leads to call now", followUp: "Roofing follow-ups due" },
    exampleLeadText: "Examples: roof leak, storm damage, replacement, insurance claim.",
  },
  {
    tradeKey: "landscaping",
    tradeName: "Landscaping",
    serviceCategories: ["Mowing", "Cleanup", "Drainage", "Hardscape", "Sod", "Irrigation", "Commercial maintenance"],
    urgencyKeywords: ["drainage issue", "flooding yard", "irrigation leak", "event deadline"],
    highValueKeywords: ["hardscape", "commercial maintenance", "sod", "irrigation", "retaining wall"],
    disqualificationKeywords: ["seo", "backlink", "cheap leads"],
    defaultLeadSources: ["Website Form", "Referral", "Neighborhood Group", "Property Manager"],
    leadScoringModifiers: { urgencyKeywordBoost: 8, highValueKeywordBoost: 12, serviceCategoryBoost: 6, disqualificationPenalty: -35 },
    qualificationQuestions: ["Is this a one-time job or recurring maintenance?", "What is the approximate property size?", "Is there a target completion date?", "Are photos or plans available?"],
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your landscaping request about {service}. What is the best time to follow up?",
    defaultEmailSubject: "We received your landscaping request",
    defaultEmailTemplate: "Hi {name}, thanks for reaching out about {service}. We will review the details and follow up shortly.",
    defaultFollowUpSequence: COMMON_FOLLOW_UPS,
    proposalStarterNotes: ["Confirm property size.", "Ask for photos or plan sketches.", "Clarify recurring vs one-time work."],
    dashboardLabelCopy: { hotLeads: "High-value landscaping requests", needsContact: "Landscaping leads to call now", followUp: "Landscaping follow-ups due" },
    exampleLeadText: "Examples: hardscape, drainage, sod, irrigation, commercial maintenance.",
  },
  {
    tradeKey: "general_contractor",
    tradeName: "General Contractor",
    serviceCategories: ["Remodel", "Addition", "Repair", "Renovation", "Deck", "Kitchen", "Bathroom", "Structural"],
    urgencyKeywords: ["structural", "water damage", "unsafe", "urgent repair", "storm damage"],
    highValueKeywords: ["addition", "kitchen", "bathroom", "remodel", "renovation", "structural", "whole home"],
    disqualificationKeywords: ["seo", "backlink", "loan offer"],
    defaultLeadSources: ["Website Form", "Referral", "Partner", "Missed Call"],
    leadScoringModifiers: { urgencyKeywordBoost: 10, highValueKeywordBoost: 14, serviceCategoryBoost: 6, disqualificationPenalty: -35 },
    qualificationQuestions: ["What is the desired budget range?", "Is design or permitting already started?", "What timeline does the customer need?", "Is the property occupied?"],
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your project request about {service}. What is the best time to discuss scope?",
    defaultEmailSubject: "We received your project request",
    defaultEmailTemplate: "Hi {name}, thanks for reaching out about {service}. We will review the project details and follow up to qualify scope and next steps.",
    defaultFollowUpSequence: COMMON_FOLLOW_UPS,
    proposalStarterNotes: ["Clarify budget and timeline.", "Ask about plans, permits, and decision makers.", "Capture must-have scope items."],
    dashboardLabelCopy: { hotLeads: "High-value project leads", needsContact: "Project leads to call now", followUp: "Project follow-ups due" },
    exampleLeadText: "Examples: remodel, addition, kitchen, bathroom, deck, structural repair.",
  },
  {
    tradeKey: "it_field_service",
    tradeName: "IT Field Service / MSP Field Service",
    serviceCategories: ["Network outage", "Workstation issue", "Server issue", "Cabling", "Firewall/VPN", "Microsoft 365", "Onsite support"],
    urgencyKeywords: ["network outage", "server down", "vpn down", "no internet", "urgent onsite", "business down"],
    highValueKeywords: ["firewall", "cabling", "microsoft 365", "server", "network upgrade", "managed service"],
    disqualificationKeywords: ["seo", "crypto", "guest post", "backlink"],
    defaultLeadSources: ["Website Form", "Missed Call", "Referral", "Client Portal"],
    leadScoringModifiers: { urgencyKeywordBoost: 14, highValueKeywordBoost: 12, serviceCategoryBoost: 6, disqualificationPenalty: -35 },
    qualificationQuestions: ["How many users or devices are affected?", "Is the business currently down?", "Is remote access available?", "Is onsite dispatch required?"],
    defaultSmsTemplate: "Hi {name}, this is {business}. We received your IT support request about {service}. Is the business currently down?",
    defaultEmailSubject: "We received your IT field service request",
    defaultEmailTemplate: "Hi {name}, thanks for reaching out about {service}. We will review the support details and follow up with the next step.",
    defaultFollowUpSequence: COMMON_FOLLOW_UPS,
    proposalStarterNotes: ["Confirm affected users and urgency.", "Capture site address and access notes.", "Ask whether remote support was already attempted."],
    dashboardLabelCopy: { hotLeads: "Outages and onsite dispatch", needsContact: "IT service leads to call now", followUp: "IT follow-ups due" },
    exampleLeadText: "Examples: network outage, server issue, cabling, firewall/VPN, Microsoft 365.",
  },
];

export function getLeadTradeTemplate(tradeKey?: string | null): LeadTradeTemplate | undefined {
  if (!tradeKey) return undefined;
  return LEAD_TRADE_TEMPLATES.find((template) => template.tradeKey === tradeKey);
}

export function isLeadTradeKey(value: string | null | undefined): value is LeadTradeKey {
  return !!getLeadTradeTemplate(value);
}
