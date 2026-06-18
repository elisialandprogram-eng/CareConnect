/**
 * SMS channel adapter — Twilio.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER (E.164, e.g. +14155551234)
 *
 * If credentials are not present this adapter logs a warning and returns
 * "skipped" so the rest of the notification fan-out still works.
 */
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;

export interface SmsPayload {
  to: string; // E.164
  body: string;
}

export interface SmsResult {
  status: "sent" | "skipped" | "failed";
  externalId?: string;
  error?: string;
}

export function isSmsConfigured() {
  return !!(SID && TOKEN && FROM);
}

export async function sendSms(p: SmsPayload): Promise<SmsResult> {
  if (!isSmsConfigured()) {
    console.warn("[sms] Twilio creds not set — skipping SMS to", p.to);
    return { status: "skipped", error: "TWILIO_* env vars missing" };
  }
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
      },
      body: new URLSearchParams({ To: p.to, From: FROM!, Body: p.body }).toString(),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[sms] Twilio error:", json);
      return { status: "failed", error: json?.message || `HTTP ${resp.status}` };
    }
    return { status: "sent", externalId: json?.sid };
  } catch (e: any) {
    console.error("[sms] send failed:", e?.message || e);
    return { status: "failed", error: e?.message || String(e) };
  }
}
