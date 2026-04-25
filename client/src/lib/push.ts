// Web push subscription helper
import { apiRequest } from "./queryClient";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushCapability(): Promise<{ supported: boolean; configured: boolean; vapid: string | null }> {
  if (typeof window === "undefined") return { supported: false, configured: false, vapid: null };
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return { supported, configured: false, vapid: null };
  try {
    const r = await fetch("/api/push/vapid-public-key", { credentials: "include" });
    const j = await r.json();
    return { supported, configured: !!j.configured, vapid: j.key || null };
  } catch {
    return { supported, configured: false, vapid: null };
  }
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.warn("[push] sw register failed", e);
    return null;
  }
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  const cap = await getPushCapability();
  if (!cap.supported) return { ok: false, reason: "Push not supported in this browser" };
  if (!cap.configured || !cap.vapid) return { ok: false, reason: "Server not configured for push" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permission denied" };
  const reg = await ensureServiceWorker();
  if (!reg) return { ok: false, reason: "Service worker unavailable" };
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cap.vapid),
  });
  const json = sub.toJSON() as any;
  await apiRequest("POST", "/api/push/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent,
  });
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await apiRequest("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
