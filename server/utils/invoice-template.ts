import { storage } from "../storage";

/**
 * Invoice template settings let admins customize the company branding that
 * appears on every generated PDF without code changes. Stored as key/value
 * rows in `platform_settings` under category="invoice_template" so we don't
 * have to migrate the schema for what is essentially a small JSON blob.
 */

export interface InvoiceTemplate {
  companyName: string;
  tagline: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  taxId: string;
  logoUrl: string;
  brandColorHex: string;
  accentColorHex: string;
  footerText: string;
  paymentInstructions: string;
  termsText: string;
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  companyName: "Golden Life",
  tagline: "Quality healthcare delivered.",
  addressLine1: "",
  addressLine2: "",
  city: "",
  country: "",
  email: "billing@goldenlife.health",
  phone: "",
  website: "goldenlife.health",
  taxId: "",
  logoUrl: "",
  brandColorHex: "#C9A227",
  accentColorHex: "#1E293B",
  footerText: "Thank you for choosing Golden Life. For questions about this invoice, contact billing@goldenlife.health.",
  paymentInstructions: "Please complete payment by the due date shown above.",
  termsText: "Payment is due within 7 days of the invoice date unless otherwise agreed.",
};

const KEY_PREFIX = "invoice_template.";
const CATEGORY = "invoice_template";

export async function loadInvoiceTemplate(): Promise<InvoiceTemplate> {
  try {
    const rows = await storage.getPlatformSettingsByCategory(CATEGORY);
    const out: any = { ...DEFAULT_INVOICE_TEMPLATE };
    for (const row of rows) {
      if (!row.key.startsWith(KEY_PREFIX)) continue;
      const field = row.key.slice(KEY_PREFIX.length) as keyof InvoiceTemplate;
      if (field in DEFAULT_INVOICE_TEMPLATE) {
        out[field] = row.value ?? "";
      }
    }
    return out as InvoiceTemplate;
  } catch (err) {
    console.warn("[invoice-template] load failed, using defaults:", err);
    return { ...DEFAULT_INVOICE_TEMPLATE };
  }
}

export async function saveInvoiceTemplate(patch: Partial<InvoiceTemplate>): Promise<InvoiceTemplate> {
  for (const [field, value] of Object.entries(patch)) {
    if (!(field in DEFAULT_INVOICE_TEMPLATE)) continue;
    const key = KEY_PREFIX + field;
    const stringValue = value == null ? "" : String(value);
    const existing = await storage.getPlatformSetting(key);
    if (existing) {
      await storage.updatePlatformSetting(key, stringValue);
    } else {
      await storage.createPlatformSetting({
        key,
        value: stringValue,
        category: CATEGORY,
      } as any);
    }
  }
  return loadInvoiceTemplate();
}

/** Convert "#RRGGBB" → [r,g,b] tuple. Falls back to the supplied default. */
export function hexToRgb(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex) return fallback;
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
