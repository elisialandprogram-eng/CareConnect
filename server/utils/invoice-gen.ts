import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { DEFAULT_INVOICE_TEMPLATE, hexToRgb, type InvoiceTemplate } from "./invoice-template";

type CurrencyConfig = {
  code: string;
  locale: string;
  symbol: string;
  position: "prefix" | "suffix";
  fractionDigits: number;
};

const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
  USD: { code: "USD", locale: "en-US", symbol: "$", position: "prefix", fractionDigits: 2 },
  EUR: { code: "EUR", locale: "en-IE", symbol: "EUR ", position: "prefix", fractionDigits: 2 },
  GBP: { code: "GBP", locale: "en-GB", symbol: "GBP ", position: "prefix", fractionDigits: 2 },
  HUF: { code: "HUF", locale: "hu-HU", symbol: " Ft", position: "suffix", fractionDigits: 0 },
  IRR: { code: "IRR", locale: "fa-IR", symbol: " IRR", position: "suffix", fractionDigits: 0 },
};

function getCurrency(code: string | null | undefined): CurrencyConfig {
  if (!code) return CURRENCY_CONFIGS.USD;
  return CURRENCY_CONFIGS[String(code).toUpperCase()] ?? CURRENCY_CONFIGS.USD;
}

function makeFormatter(code: string | null | undefined) {
  const cfg = getCurrency(code);
  return (value: any): string => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return cfg.position === "prefix" ? `${cfg.symbol}0` : `0${cfg.symbol}`;
    const formatted = n.toLocaleString(cfg.locale, {
      minimumFractionDigits: cfg.fractionDigits,
      maximumFractionDigits: cfg.fractionDigits,
    });
    return cfg.position === "prefix" ? `${cfg.symbol}${formatted}` : `${formatted}${cfg.symbol}`;
  };
}

function formatDate(d: any, locale = "en-US"): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(d);
  }
}

type RGB = [number, number, number];

// Golden Life palette — warm gold + deep navy
const BRAND: RGB = [201, 162, 39];        // gold
const BRAND_DARK: RGB = [162, 124, 9];    // deep gold
const ACCENT: RGB = [30, 41, 59];         // slate-800 (deep navy)
const TEXT: RGB = [17, 24, 39];           // gray-900
const MUTED: RGB = [107, 114, 128];       // gray-500
const SUBTLE: RGB = [156, 163, 175];      // gray-400
const LINE: RGB = [229, 231, 235];        // gray-200
const BG_SOFT: RGB = [250, 247, 237];     // soft cream

/**
 * Convert an admin-supplied logo URL into a data URL + image format that
 * jsPDF can embed via `addImage`. Supports:
 *   - data:image/(png|jpeg|jpg);base64,…  (returned as-is, parsed for format)
 *   - http(s)://…                          (fetched server-side; png/jpeg only)
 * Returns null on any failure so the PDF still renders without a logo.
 */
async function resolveLogoData(
  logoUrl: string | null | undefined,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  const raw = (logoUrl || "").trim();
  if (!raw) return null;

  // Already a data URL — pull the format out of the MIME type.
  if (raw.startsWith("data:")) {
    const m = raw.match(/^data:image\/(png|jpeg|jpg)(;base64)?,/i);
    if (!m) return null;
    const fmt = m[1].toLowerCase() === "png" ? "PNG" : "JPEG";
    return { dataUrl: raw, format: fmt as "PNG" | "JPEG" };
  }

  // Remote URL — fetch and inline. Cap at ~3MB to avoid memory issues.
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const res = await fetch(raw);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let format: "PNG" | "JPEG";
    if (ct.includes("png")) format = "PNG";
    else if (ct.includes("jpeg") || ct.includes("jpg")) format = "JPEG";
    else return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 3 * 1024 * 1024) return null;
    const mime = format === "PNG" ? "image/png" : "image/jpeg";
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, format };
  } catch {
    return null;
  }
}

function statusColors(status: string): { fill: RGB; text: RGB; label: string } {
  const s = (status || "due").toLowerCase();
  if (s === "paid") {
    return { fill: [220, 252, 231], text: [22, 101, 52], label: "PAID" };
  }
  if (s === "overdue") {
    return { fill: [254, 226, 226], text: [153, 27, 27], label: "OVERDUE" };
  }
  if (s === "refunded") {
    return { fill: [243, 244, 246], text: [55, 65, 81], label: "REFUNDED" };
  }
  if (s === "cancelled" || s === "canceled" || s === "void") {
    return { fill: [243, 244, 246], text: [55, 65, 81], label: s.toUpperCase() };
  }
  return { fill: [254, 243, 199], text: [146, 64, 14], label: "DUE" };
}

export interface GenerateInvoiceOptions {
  template?: Partial<InvoiceTemplate>;
}

export async function generateInvoicePDF(
  invoice: any,
  patient: any,
  provider: any,
  items: any[],
  options: GenerateInvoiceOptions = {},
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as any;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 18; // page margin

  // Merge template overrides with defaults so callers may pass a partial.
  const tpl: InvoiceTemplate = { ...DEFAULT_INVOICE_TEMPLATE, ...(options.template || {}) };

  // Resolve currency: invoice > provider > USD
  const currencyCode = invoice?.currency || provider?.currency || "USD";
  const fmt = makeFormatter(currencyCode);
  const cfg = getCurrency(currencyCode);

  // Resolve brand colors from template (with defaults).
  const BRAND_RGB = hexToRgb(tpl.brandColorHex, BRAND);
  const ACCENT_RGB = hexToRgb(tpl.accentColorHex, ACCENT);
  // Slightly darker variant of the brand for the "INVOICE" headline.
  const BRAND_DARK_RGB: RGB = [
    Math.max(0, Math.round(BRAND_RGB[0] * 0.78)),
    Math.max(0, Math.round(BRAND_RGB[1] * 0.78)),
    Math.max(0, Math.round(BRAND_RGB[2] * 0.78)),
  ];

  // ---------- TOP BRAND BAND ----------
  doc.setFillColor(...BRAND_RGB);
  doc.rect(0, 0, pageW, 8, "F");
  doc.setFillColor(...ACCENT_RGB);
  doc.rect(0, 8, pageW, 1.5, "F");

  // ---------- LOGO (optional) ----------
  // Render a logo to the left of the company name when the template provides
  // one. Supports data: URLs (uploaded straight from the admin UI) and
  // remote http(s) URLs (fetched and inlined here).
  const logoData = await resolveLogoData(tpl.logoUrl);
  let textOffsetX = M;
  if (logoData) {
    try {
      // Reserve a 16x16 mm box at the top-left, vertically centered with the
      // company name baseline at y=24.
      const LOGO_BOX = 16;
      const logoY = 14;
      doc.addImage(logoData.dataUrl, logoData.format, M, logoY, LOGO_BOX, LOGO_BOX);
      textOffsetX = M + LOGO_BOX + 4;
    } catch (err) {
      console.warn("[invoice-gen] failed to render logo:", err);
    }
  }

  // ---------- HEADER ----------
  // Brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...ACCENT_RGB);
  doc.text(tpl.companyName || "Golden Life", textOffsetX, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (tpl.tagline) doc.text(tpl.tagline, textOffsetX, 29);
  const contactBits = [tpl.website, tpl.email, tpl.phone].filter(Boolean).join("  ·  ");
  if (contactBits) doc.text(contactBits, textOffsetX, 34);

  // INVOICE title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...BRAND_DARK_RGB);
  doc.text("INVOICE", pageW - M, 24, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`#${invoice.invoiceNumber || ""}`, pageW - M, 30, { align: "right" });

  // Status pill
  const status = statusColors(invoice.status);
  const pillW = 26;
  const pillH = 7;
  const pillX = pageW - M - pillW;
  const pillY = 33;
  doc.setFillColor(...status.fill);
  doc.roundedRect(pillX, pillY, pillW, pillH, 3.5, 3.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...status.text);
  doc.text(status.label, pillX + pillW / 2, pillY + 4.8, { align: "center" });

  // Header divider
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, 46, pageW - M, 46);

  // ---------- META PANEL ----------
  const metaY = 54;
  const metaItems = [
    { label: "Issue date", value: formatDate(invoice.issueDate || new Date(), cfg.locale) },
    { label: "Due date", value: formatDate(invoice.dueDate, cfg.locale) },
    { label: "Invoice no.", value: invoice.invoiceNumber || "—" },
    ...(invoice.appointmentNumber ? [{ label: "Appt. ref.", value: invoice.appointmentNumber }] : []),
  ];
  const colW = (pageW - 2 * M) / metaItems.length;
  metaItems.forEach((m, i) => {
    const x = M + i * colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SUBTLE);
    doc.text(m.label.toUpperCase(), x, metaY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(m.value, x, metaY + 5.5);
  });

  // ---------- BILL TO / FROM ----------
  const bfY = metaY + 18;
  const colWidth = (pageW - 2 * M - 6) / 2;
  const billX = M;
  const fromX = M + colWidth + 6;

  // Bill To panel
  doc.setFillColor(...BG_SOFT);
  doc.roundedRect(billX, bfY, colWidth, 38, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_DARK_RGB);
  doc.text("BILL TO  ·  PATIENT", billX + 4, bfY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  const patientName = [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || patient?.email || "Patient";
  doc.text(patientName, billX + 4, bfY + 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  let pY = bfY + 19;
  if (patient?.email) { doc.text(String(patient.email), billX + 4, pY); pY += 4.5; }
  if (patient?.phone) { doc.text(String(patient.phone), billX + 4, pY); pY += 4.5; }
  if (patient?.address) { doc.text(String(patient.address), billX + 4, pY); pY += 4.5; }
  const cityLine = [patient?.zipCode, patient?.city].filter(Boolean).join(" ");
  if (cityLine) doc.text(cityLine, billX + 4, pY);

  // Provider panel
  doc.setFillColor(...BG_SOFT);
  doc.roundedRect(fromX, bfY, colWidth, 38, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_DARK_RGB);
  doc.text("PROVIDER", fromX + 4, bfY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  const providerName = provider?.businessName
    || [provider?.firstName, provider?.lastName].filter(Boolean).join(" ").trim()
    || [provider?.user?.firstName, provider?.user?.lastName].filter(Boolean).join(" ").trim()
    || provider?.email
    || provider?.user?.email
    || "Provider";
  doc.text(String(providerName), fromX + 4, bfY + 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  let fY = bfY + 19;
  const providerEmail = provider?.email || provider?.user?.email;
  const providerPhone = provider?.phone || provider?.user?.phone;
  if (providerEmail) { doc.text(String(providerEmail), fromX + 4, fY); fY += 4.5; }
  if (providerPhone) { doc.text(String(providerPhone), fromX + 4, fY); fY += 4.5; }
  if (provider?.licenseNumber) {
    doc.text(`License: ${provider.licenseNumber}`, fromX + 4, fY); fY += 4.5;
  }
  if (provider?.address) { doc.text(String(provider.address), fromX + 4, fY); fY += 4.5; }
  const provCityLine = [provider?.zipCode, provider?.city].filter(Boolean).join(" ");
  if (provCityLine) doc.text(provCityLine, fromX + 4, fY);

  // ---------- APPOINTMENT REF ROW ----------
  let appointmentRefY = bfY + 44;
  if (invoice.appointmentDate || invoice.appointmentNumber || invoice.visitType) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(M, appointmentRefY, pageW - 2 * M, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...SUBTLE);
    doc.text("APPOINTMENT", M + 4, appointmentRefY + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    const refParts = [
      invoice.appointmentNumber ? `Ref. ${invoice.appointmentNumber}` : null,
      invoice.appointmentDate ? formatDate(invoice.appointmentDate, cfg.locale) : null,
      invoice.visitType ? `${String(invoice.visitType).charAt(0).toUpperCase()}${String(invoice.visitType).slice(1)} visit` : null,
    ].filter(Boolean).join("   ·   ");
    if (refParts) doc.text(refParts, M + 4, appointmentRefY + 8.5);
    appointmentRefY += 12;
  } else {
    appointmentRefY = bfY + 44;
  }

  // ---------- ITEMS TABLE ----------
  const tableStartY = appointmentRefY + 4;

  const tableData = items.map((item) => [
    String(item.description || "Service"),
    String(item.quantity ?? 1),
    fmt(item.unitPrice),
    fmt(item.totalPrice),
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [["Description", "Qty", "Unit price", "Amount"]],
    body: tableData,
    theme: "plain",
    margin: { left: M, right: M },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: TEXT as any,
      lineWidth: 0,
    },
    headStyles: {
      fillColor: ACCENT as any,
      textColor: [255, 255, 255] as any,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    alternateRowStyles: {
      fillColor: [252, 250, 245] as any,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "center", cellWidth: 18 },
      2: { halign: "right", cellWidth: 35 },
      3: { halign: "right", cellWidth: 35, fontStyle: "bold" },
    },
    didDrawPage: () => {
      // Re-draw the brand strip on each page
      doc.setFillColor(...BRAND_RGB);
      doc.rect(0, 0, pageW, 8, "F");
      doc.setFillColor(...ACCENT_RGB);
      doc.rect(0, 8, pageW, 1.5, "F");
    },
  });

  let finalY = (doc as any).lastAutoTable?.finalY || tableStartY + 30;

  // Subtle bottom border for the table
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, finalY + 0.5, pageW - M, finalY + 0.5);

  // ---------- TOTALS PANEL ----------
  const totalsY = finalY + 6;
  const totalsW = 78;
  const totalsX = pageW - M - totalsW;

  const subtotal = Number(invoice.subtotal || 0);
  const tax = Number(invoice.taxAmount || 0);
  const platformFee = Number(invoice.platformFee || 0);
  const discount = Number(invoice.discount || 0);
  const total = Number(invoice.totalAmount || 0);

  let rowY = totalsY + 5;
  const rowStep = 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Subtotal", totalsX + 4, rowY);
  doc.setTextColor(...TEXT);
  doc.text(fmt(subtotal), totalsX + totalsW - 4, rowY, { align: "right" });
  rowY += rowStep;

  if (platformFee > 0) {
    doc.setTextColor(...MUTED);
    doc.text("Platform fee", totalsX + 4, rowY);
    doc.setTextColor(...TEXT);
    doc.text(fmt(platformFee), totalsX + totalsW - 4, rowY, { align: "right" });
    rowY += rowStep;
  }

  if (discount > 0) {
    doc.setTextColor(...MUTED);
    doc.text("Discount", totalsX + 4, rowY);
    doc.setTextColor(22, 101, 52);
    doc.text(`-${fmt(discount)}`, totalsX + totalsW - 4, rowY, { align: "right" });
    rowY += rowStep;
  }

  doc.setTextColor(...MUTED);
  doc.text("Tax", totalsX + 4, rowY);
  doc.setTextColor(...TEXT);
  doc.text(fmt(tax), totalsX + totalsW - 4, rowY, { align: "right" });
  rowY += rowStep + 1;

  // Total — highlighted bar (gold)
  const totalBarY = rowY;
  doc.setFillColor(...BRAND_RGB);
  doc.roundedRect(totalsX, totalBarY, totalsW, 12, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(status.label === "PAID" ? "TOTAL PAID" : "TOTAL DUE", totalsX + 4, totalBarY + 7.5);
  doc.setFontSize(13);
  doc.text(fmt(total), totalsX + totalsW - 4, totalBarY + 7.7, { align: "right" });

  // Payment status / instructions panel (left side)
  const isPaid = (invoice.status || "").toLowerCase() === "paid";
  if (isPaid) {
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(M, totalsY, totalsW - 2, 22, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(22, 101, 52);
    doc.text("Payment received", M + 4, totalsY + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Thank you — this invoice has", M + 4, totalsY + 14);
    doc.text("been paid in full.", M + 4, totalsY + 18);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    doc.text("Payment instructions", M, totalsY + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(
      `Please complete payment by ${formatDate(invoice.dueDate, cfg.locale)}.`,
      M,
      totalsY + 11
    );
    // Wrap admin-supplied payment instructions to fit the column.
    const instr = (tpl.paymentInstructions || "").trim();
    if (instr) {
      const wrapped = doc.splitTextToSize(instr, totalsW - 4) as string[];
      wrapped.slice(0, 2).forEach((line, i) => {
        doc.text(line, M, totalsY + 16 + i * 4.5);
      });
    }
  }

  // ---------- FOOTER ----------
  const footerY = pageH - 14;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, footerY - 4, pageW - M, footerY - 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  // Use template footer text if present, fall back to legacy line.
  const leftFooter = (tpl.footerText || `${tpl.companyName} · Healthcare Booking Platform`).trim();
  // Hard truncate to one line — autoTable handles longer content.
  const leftFitted = doc.splitTextToSize(leftFooter, pageW - 2 * M - 80)[0] || leftFooter;
  doc.text(leftFitted, M, footerY);
  const rightFooter = [tpl.website, tpl.email].filter(Boolean).join(" · ");
  if (rightFooter) doc.text(rightFooter, pageW - M, footerY, { align: "right" });

  doc.setTextColor(...SUBTLE);
  doc.setFontSize(7);
  doc.text(
    `Generated on ${formatDate(new Date(), cfg.locale)} · Invoice #${invoice.invoiceNumber || ""} · Currency: ${cfg.code}`,
    pageW / 2,
    footerY + 4,
    { align: "center" }
  );

  return Buffer.from(doc.output("arraybuffer"));
}
