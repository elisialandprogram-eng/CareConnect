import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";

const CONSENT_KEY = "gl_cookie_consent";
const CONSENT_VERSION = "1";

interface ConsentState {
  version: string;
  timestamp: string;
  accepted: {
    essential: true;
    functional: boolean;
    analytics: boolean;
  };
}

const T = {
  en: {
    dir: "ltr" as const,
    title: "Cookie Preferences",
    body: "We use cookies to keep the site working and to improve your experience.",
    essential: "Essential",
    essentialDesc: "Required for the site to work. Always active.",
    functional: "Functional",
    functionalDesc: "Remember your language, theme, and preferences.",
    analytics: "Analytics",
    analyticsDesc: "Help us understand how the site is used (anonymised).",
    acceptAll: "Accept All",
    rejectOptional: "Reject Optional",
    manage: "Manage",
    save: "Save Preferences",
    privacy: "Privacy Policy",
    cookies: "Cookie Policy",
  },
  hu: {
    dir: "ltr" as const,
    title: "Cookie beállítások",
    body: "Sütiket használunk az oldal működéséhez és a felhasználói élmény javításához.",
    essential: "Alapvető",
    essentialDesc: "Az oldal működéséhez szükséges. Mindig aktív.",
    functional: "Funkcionális",
    functionalDesc: "Megőrzi a nyelvet, témát és beállításokat.",
    analytics: "Analitika",
    analyticsDesc: "Segít megérteni az oldal használatát (anonimizálva).",
    acceptAll: "Összes elfogadása",
    rejectOptional: "Opcionálisak elutasítása",
    manage: "Beállítások",
    save: "Mentés",
    privacy: "Adatvédelmi irányelvek",
    cookies: "Cookie-k",
  },
  fa: {
    dir: "rtl" as const,
    title: "تنظیمات کوکی",
    body: "ما از کوکی‌ها برای عملکرد سایت و بهبود تجربه شما استفاده می‌کنیم.",
    essential: "ضروری",
    essentialDesc: "برای عملکرد سایت لازم است. همیشه فعال.",
    functional: "عملکردی",
    functionalDesc: "زبان، تم و تنظیمات شما را ذخیره می‌کند.",
    analytics: "تحلیلی",
    analyticsDesc: "به ما کمک می‌کند تا نحوه استفاده از سایت را بفهمیم (ناشناس).",
    acceptAll: "پذیرش همه",
    rejectOptional: "رد کوکی‌های اختیاری",
    manage: "مدیریت",
    save: "ذخیره تنظیمات",
    privacy: "سیاست حریم خصوصی",
    cookies: "سیاست کوکی",
  },
} as const;

type Lang = keyof typeof T;

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem("i18nextLng") || "";
    if (stored.startsWith("hu")) return "hu";
    if (stored.startsWith("fa")) return "fa";
  } catch {}
  return "en";
}

function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConsent(functional: boolean, analytics: boolean): void {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    accepted: { essential: true, functional, analytics },
  };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  } catch {}
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const consent = readConsent();
    if (!consent) {
      setLang(detectLang());
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const t = T[lang];

  const acceptAll = () => { writeConsent(true, true); setVisible(false); };
  const rejectOptional = () => { writeConsent(false, false); setVisible(false); };
  const savePreferences = () => { writeConsent(functional, analytics); setVisible(false); };

  return (
    <div
      dir={t.dir}
      className="fixed bottom-0 left-0 right-0 z-[100] bg-background border-t border-border shadow-2xl"
      role="dialog"
      aria-label={t.title}
      data-testid="cookie-consent-banner"
    >
      <div className="max-w-5xl mx-auto px-4 py-4">
        {!managing ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-0.5">{t.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t.body}{" "}
                <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
                  {t.privacy}
                </Link>
                {" · "}
                <Link href="/cookies" className="underline underline-offset-2 hover:text-foreground transition-colors">
                  {t.cookies}
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setManaging(true)} data-testid="cookie-btn-manage">
                {t.manage}
              </Button>
              <Button size="sm" variant="outline" onClick={rejectOptional} data-testid="cookie-btn-reject">
                {t.rejectOptional}
              </Button>
              <Button size="sm" onClick={acceptAll} data-testid="cookie-btn-accept">
                {t.acceptAll}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">{t.title}</p>
              <Button size="sm" variant="ghost" onClick={() => setManaging(false)} aria-label="Back" data-testid="cookie-btn-back">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-0 divide-y divide-border">
              <div className="flex items-center justify-between py-2.5">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-medium">{t.essential}</p>
                  <p className="text-xs text-muted-foreground">{t.essentialDesc}</p>
                </div>
                <Switch checked disabled aria-label={t.essential} />
              </div>

              <div className="flex items-center justify-between py-2.5">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-medium">{t.functional}</p>
                  <p className="text-xs text-muted-foreground">{t.functionalDesc}</p>
                </div>
                <Switch
                  checked={functional}
                  onCheckedChange={setFunctional}
                  aria-label={t.functional}
                  data-testid="cookie-switch-functional"
                />
              </div>

              <div className="flex items-center justify-between py-2.5">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-medium">{t.analytics}</p>
                  <p className="text-xs text-muted-foreground">{t.analyticsDesc}</p>
                </div>
                <Switch
                  checked={analytics}
                  onCheckedChange={setAnalytics}
                  aria-label={t.analytics}
                  data-testid="cookie-switch-analytics"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button size="sm" variant="outline" onClick={rejectOptional} data-testid="cookie-btn-reject-all">
                {t.rejectOptional}
              </Button>
              <Button size="sm" onClick={savePreferences} data-testid="cookie-btn-save">
                {t.save}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
