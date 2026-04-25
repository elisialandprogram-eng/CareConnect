/**
 * Web Push channel adapter (VAPID).
 *
 * To send fully encrypted Web Push payloads in production, install the
 * `web-push` npm package and replace the body of `sendPush` with
 *   webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
 *   webpush.sendNotification(subscription, JSON.stringify(payload))
 *
 * This adapter currently:
 *   - exposes the public VAPID key for client subscription
 *   - persists subscriptions
 *   - returns "skipped" if VAPID keys are not configured (no server-side push)
 *   - logs a warning explaining how to enable encrypted push
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT (e.g. "mailto:admin@goldenlife.health")
 */
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
}

export function isPushConfigured() {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

let warnedOnce = false;

export async function sendPush(_sub: PushSubscription, _payload: PushPayload): Promise<PushResult> {
  if (!isPushConfigured()) {
    if (!warnedOnce) {
      console.warn(
        "[push] VAPID keys not set — skipping web push. " +
        "Generate keys with `npx web-push generate-vapid-keys` and set " +
        "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT."
      );
      warnedOnce = true;
    }
    return { status: "skipped", error: "VAPID keys missing" };
  }
  // Production: install `web-push` and call webpush.sendNotification.
  // Returning "skipped" until that package is added to package.json.
  if (!warnedOnce) {
    console.warn(
      "[push] VAPID keys present but `web-push` package not installed. " +
      "Install it and replace this stub to actually deliver encrypted payloads."
    );
    warnedOnce = true;
  }
  return { status: "skipped", error: "web-push package not installed" };
}
