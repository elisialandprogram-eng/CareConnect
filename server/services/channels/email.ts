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

export async function sendEmail(p: EmailPayload): Promise<EmailResult> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", p.to);
    return { status: "skipped", error: "RESEND_API_KEY missing" };
  }
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: p.to,
      subject: p.subject,
      html: p.html,
      attachments: p.attachments as any,
    });
    return { status: "sent", externalId: (result as any)?.data?.id };
  } catch (e: any) {
    console.error("[email] send failed:", e?.message || e);
    return { status: "failed", error: e?.message || String(e) };
  }
}

export function isEmailConfigured() {
  return !!resend;
}
