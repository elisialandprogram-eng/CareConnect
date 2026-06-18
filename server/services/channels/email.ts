/**
 * Email channel adapter.
 *
 * Wraps the existing Resend client. If RESEND_API_KEY is not configured this
 * adapter logs a warning and reports a "skipped" delivery — it never throws so
 * upstream code can fan-out to other channels safely.
 *
 * To enable in production: set RESEND_API_KEY (and optionally GOLDENLIFE_FROM_EMAIL).
 */
import { Resend } from "resend";

const FROM_EMAIL = process.env.GOLDENLIFE_FROM_EMAIL || "GoldenLife <no-reply@goldenlife.health>";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

export interface EmailResult {
  status: "sent" | "skipped" | "failed";
  externalId?: string;
  error?: string;
}

/**
 * Retry helper with exponential back-off.
 * Delays: 500 ms → 1 s → 2 s (3 attempts total).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt)));
      }
    }
  }
  throw lastErr;
}

export async function sendEmail(p: EmailPayload): Promise<EmailResult> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", p.to);
    return { status: "skipped", error: "RESEND_API_KEY missing" };
  }
  try {
    const result = await withRetry(() =>
      resend!.emails.send({
        from: FROM_EMAIL,
        to: p.to,
        subject: p.subject,
        html: p.html,
        attachments: p.attachments as any,
      })
    );
    return { status: "sent", externalId: (result as any)?.data?.id };
  } catch (e: any) {
    console.error("[email] send failed after retries:", e?.message || e);
    return { status: "failed", error: e?.message || String(e) };
  }
}

export function isEmailConfigured() {
  return !!resend;
}
