/**
 * Web Push channel adapter (VAPID).
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY   — base64url-encoded public key
 *   VAPID_PRIVATE_KEY  — base64url-encoded private key
 *   VAPID_SUBJECT      — e.g. "mailto:admin@goldenlife.health"
 *
 * Generate keys once with:
 *   npx web-push generate-vapid-keys
 */
import webpush from "web-push";
import type { PushSubscription } from "@shared/schema";

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@goldenlife.health";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

export interface PushResult {
  status: "sent" | "skipped" | "failed";
  error?: string;
  expired?: boolean;
}

export function isPushConfigured() {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

let vapidInitialized = false;

function ensureVapidInit() {
  if (vapidInitialized) return;
  if (!isPushConfigured()) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidInitialized = true;
}

// Attempt to initialize on module load if keys are present.
try { ensureVapidInit(); } catch { /* will retry on first send */ }

export async function sendPush(sub: PushSubscription, payload: PushPayload): Promise<PushResult> {
  if (!isPushConfigured()) {
    return { status: "skipped", error: "VAPID keys not configured" };
  }

  ensureVapidInit();

  const subscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.authKey,
    },
  };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    icon: payload.icon ?? "/logo.png",
    tag: payload.tag ?? "goldenlife",
  });

  try {
    await webpush.sendNotification(subscription, body, {
      TTL: 3600,
      urgency: "normal",
    });
    return { status: "sent" };
  } catch (err: any) {
    // 404 / 410 = subscription expired / unregistered → caller should clean up
    const isExpired = err?.statusCode === 404 || err?.statusCode === 410;
    if (isExpired) {
      return { status: "failed", error: "Subscription expired", expired: true };
    }
    return { status: "failed", error: err?.message ?? String(err) };
  }
}
