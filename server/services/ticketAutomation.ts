/**
 * ticketAutomation.ts — Module 6: Support Automation
 *
 * Provides:
 *  - Auto-categorization of tickets by keyword analysis of subject + description
 *  - Auto-priority tagging based on urgency signals
 *  - Routing suggestions (which team/admin type should handle the ticket)
 *  - FAQ recommendation (top matching FAQs from the faqs table)
 */

import { pool } from "../db";

// ── Category definitions ─────────────────────────────────────────────────────

interface CategoryRule {
  category: string;
  label: string;
  keywords: string[];
  defaultPriority: "low" | "medium" | "high" | "urgent";
  routeTo: string;   // human-readable routing suggestion
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "billing",
    label: "Billing & Payments",
    keywords: ["payment", "invoice", "charge", "refund", "billing", "paid", "fee", "price", "cost", "wallet", "credit", "debit", "receipt", "overcharged", "double charged"],
    defaultPriority: "high",
    routeTo: "Finance & Billing team",
  },
  {
    category: "booking",
    label: "Booking & Appointments",
    keywords: ["booking", "appointment", "schedule", "cancel", "reschedule", "slot", "availability", "session", "visit", "rebook", "no-show", "missed"],
    defaultPriority: "medium",
    routeTo: "Operations team",
  },
  {
    category: "refund",
    label: "Refund Request",
    keywords: ["refund", "money back", "return", "reimburse", "reimbursement", "chargeback", "dispute"],
    defaultPriority: "high",
    routeTo: "Finance & Billing team",
  },
  {
    category: "provider",
    label: "Provider Issue",
    keywords: ["provider", "specialist", "therapist", "late", "unprofessional", "rude", "didn't show", "no show", "quality", "complaint about"],
    defaultPriority: "high",
    routeTo: "Provider Relations team",
  },
  {
    category: "technical",
    label: "Technical Issue",
    keywords: ["error", "bug", "crash", "not working", "broken", "loading", "app", "website", "login", "password", "reset", "otp", "code", "page", "slow", "stuck", "500", "404"],
    defaultPriority: "medium",
    routeTo: "Technical Support team",
  },
  {
    category: "account",
    label: "Account & Profile",
    keywords: ["account", "profile", "email", "phone", "update", "change", "delete", "data", "privacy", "gdpr", "verification", "kyc", "document", "blocked", "suspended"],
    defaultPriority: "medium",
    routeTo: "Customer Support team",
  },
  {
    category: "medical",
    label: "Medical Inquiry",
    keywords: ["prescription", "diagnosis", "test result", "report", "medical record", "health", "medication", "allergy", "condition"],
    defaultPriority: "medium",
    routeTo: "Clinical Operations team",
  },
  {
    category: "emergency",
    label: "Emergency / Urgent",
    keywords: ["emergency", "urgent", "critical", "life", "danger", "severe", "serious", "immediate", "asap", "right now", "now"],
    defaultPriority: "urgent",
    routeTo: "On-call Senior Support",
  },
];

// ── Priority urgency signals ──────────────────────────────────────────────────

const URGENCY_KEYWORDS = ["urgent", "emergency", "critical", "asap", "immediately", "right now", "life", "danger", "not working at all", "completely broken"];
const DOWNGRADE_KEYWORDS = ["question", "how to", "wondering", "curious", "when will", "general"];

// ── Core categorization ──────────────────────────────────────────────────────

export interface TicketClassification {
  category: string;
  categoryLabel: string;
  suggestedPriority: "low" | "medium" | "high" | "urgent";
  routingAdvice: string;
  confidence: number;   // 0-1
  matchedKeywords: string[];
}

function tokenize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

export function classifyTicket(subject: string, description: string): TicketClassification {
  const fullText = tokenize(`${subject} ${description}`);

  let bestMatch: { rule: CategoryRule; hits: number; words: string[] } | null = null;

  for (const rule of CATEGORY_RULES) {
    const hits = rule.keywords.filter(kw => fullText.includes(kw));
    if (hits.length > 0 && (!bestMatch || hits.length > bestMatch.hits)) {
      bestMatch = { rule, hits: hits.length, words: hits };
    }
  }

  // Determine priority: start from category default, then apply urgency signals
  let priority: "low" | "medium" | "high" | "urgent" = bestMatch?.rule.defaultPriority ?? "medium";

  const hasUrgency = URGENCY_KEYWORDS.some(kw => fullText.includes(kw));
  const hasDowngrade = DOWNGRADE_KEYWORDS.some(kw => fullText.includes(kw));

  if (hasUrgency) priority = "urgent";
  else if (hasDowngrade && priority === "medium") priority = "low";

  const confidence = bestMatch
    ? Math.min(1, bestMatch.hits / Math.max(3, bestMatch.rule.keywords.length * 0.3))
    : 0;

  return {
    category: bestMatch?.rule.category ?? "general",
    categoryLabel: bestMatch?.rule.label ?? "General Inquiry",
    suggestedPriority: priority,
    routingAdvice: bestMatch?.rule.routeTo ?? "Customer Support team",
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords: bestMatch?.words ?? [],
  };
}

// ── FAQ recommendation ───────────────────────────────────────────────────────

export interface FaqMatch {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  relevanceScore: number;
}

export async function recommendFaqs(
  subject: string,
  description: string,
  limit = 5,
): Promise<FaqMatch[]> {
  try {
    const { rows: allFaqs } = await pool.query<{
      id: string; question: string; answer: string; category: string | null;
    }>(
      `SELECT id, question, answer, category FROM faqs WHERE is_published = true ORDER BY sort_order`,
    );

    const queryTokens = new Set(
      tokenize(`${subject} ${description}`)
        .split(/\s+/)
        .filter(t => t.length > 3),
    );

    const scored = allFaqs.map(faq => {
      const faqText = tokenize(`${faq.question} ${faq.answer}`);
      const faqTokens = faqText.split(/\s+/).filter(t => t.length > 3);
      const matches = faqTokens.filter(t => queryTokens.has(t));
      const relevanceScore = queryTokens.size > 0
        ? matches.length / Math.sqrt(queryTokens.size)
        : 0;
      return { ...faq, relevanceScore: Math.round(relevanceScore * 100) / 100 };
    });

    return scored
      .filter(f => f.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  } catch (err) {
    console.error("[ticketAutomation] recommendFaqs failed:", (err as Error).message);
    return [];
  }
}

// ── Bulk categorize uncategorized tickets ────────────────────────────────────

export async function autoCategorizePendingTickets(): Promise<number> {
  try {
    const { rows } = await pool.query<{
      id: string; subject: string; description: string;
    }>(
      `SELECT id, subject, description FROM support_tickets
       WHERE (category IS NULL OR category = '')
         AND status NOT IN ('resolved', 'closed')
       LIMIT 100`,
    );

    if (!rows.length) return 0;

    let updated = 0;
    for (const ticket of rows) {
      const cls = classifyTicket(ticket.subject, ticket.description);
      if (cls.category === "general" && cls.confidence === 0) continue;
      await pool.query(
        `UPDATE support_tickets
           SET category = $1, priority = $2, updated_at = NOW()
         WHERE id = $3`,
        [cls.category, cls.suggestedPriority, ticket.id],
      );
      updated++;
    }
    return updated;
  } catch (err) {
    console.error("[ticketAutomation] autoCategorizePendingTickets failed:", (err as Error).message);
    return 0;
  }
}
