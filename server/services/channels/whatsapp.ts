/**
 * WhatsApp channel adapter — Twilio WhatsApp Business API.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM (e.g. "whatsapp:+14155238886" — Twilio sandbox or your registered number)
 *
 * If credentials are not present this adapter logs a warning and returns
 * "skipped" so the rest of the notification fan-out still works.
 */
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_WHATSAPP_FROM;

export interface WhatsAppPayload {
  to: string; // E.164 number; will be prefixed with `whatsapp:`
  body: string;
}

export interface WhatsAppResult {
  status: "sent" | "skipped" | "failed";
  externalId?: string;
  error?: string;
}

export function isWhatsAppConfigured() {
  return !!(SID && TOKEN && FROM);
}

export async function sendWhatsApp(p: WhatsAppPayload): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) {
    console.warn("[whatsapp] Twilio WhatsApp creds not set — skipping WA to", p.to);
    return { status: "skipped", error: "TWILIO_WHATSAPP_FROM (or SID/TOKEN) missing" };
  }
  try {
    const to = p.to.startsWith("whatsapp:") ? p.to : `whatsapp:${p.to}`;
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
      },
      body: new URLSearchParams({ To: to, From: FROM!, Body: p.body }).toString(),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[whatsapp] Twilio error:", json);
      return { status: "failed", error: json?.message || `HTTP ${resp.status}` };
    }
    return { status: "sent", externalId: json?.sid };
  } catch (e: any) {
    console.error("[whatsapp] send failed:", e?.message || e);
    return { status: "failed", error: e?.message || String(e) };
  }
}
