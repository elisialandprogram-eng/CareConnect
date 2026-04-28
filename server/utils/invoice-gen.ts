import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatHUF(value: any): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 Ft";
  return `${Math.round(n).toLocaleString("hu-HU")} Ft`;
}

function formatDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("hu-HU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(d);
  }
}

type RGB = [number, number, number];

const BRAND: RGB = [37, 99, 235];      // primary blue
const BRAND_DARK: RGB = [29, 78, 216];
const TEXT: RGB = [17, 24, 39];        // gray-900
const MUTED: RGB = [107, 114, 128];    // gray-500
const SUBTLE: RGB = [156, 163, 175];   // gray-400
const LINE: RGB = [229, 231, 235];     // gray-200
const BG_SOFT: RGB = [249, 250, 251];  // gray-50

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

export async function generateInvoicePDF(invoice: any, patient: any, provider: any, items: any[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as any;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 18; // page margin

  // ---------- TOP BRAND BAND ----------
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 6, "F");

  // ---------- HEADER ----------
  // Brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...TEXT);
  doc.text("Golden Life", M, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Healthcare Booking Platform", M, 27);
  doc.text("goldenlife.health", M, 32);

  // INVOICE title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...BRAND_DARK);
  doc.text("INVOICE", pageW - M, 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`#${invoice.invoiceNumber || ""}`, pageW - M, 28, { align: "right" });

  // Status pill (right side, under invoice number)
  const status = statusColors(invoice.status);
  const pillW = 26;
  const pillH = 7;
  const pillX = pageW - M - pillW;
  const pillY = 31;
  doc.setFillColor(...status.fill);
  doc.roundedRect(pillX, pillY, pillW, pillH, 3.5, 3.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...status.text);
  doc.text(status.label, pillX + pillW / 2, pillY + 4.8, { align: "center" });

  // Header divider
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, 44, pageW - M, 44);

  // ---------- META PANEL ----------
  const metaY = 52;
  const metaItems = [
    { label: "Issue date", value: formatDate(invoice.issueDate) },
    { label: "Due date", value: formatDate(invoice.dueDate) },
    { label: "Invoice no.", value: invoice.invoiceNumber || "—" },
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
  doc.roundedRect(billX, bfY, colWidth, 36, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...SUBTLE);
  doc.text("BILL TO", billX + 4, bfY + 6);

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

  // From panel
  doc.setFillColor(...BG_SOFT);
  doc.roundedRect(fromX, bfY, colWidth, 36, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...SUBTLE);
  doc.text("FROM", fromX + 4, bfY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  const providerName = provider?.businessName
    || [provider?.firstName, provider?.lastName].filter(Boolean).join(" ")
    || provider?.email
    || "Provider";
  doc.text(String(providerName), fromX + 4, bfY + 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  let fY = bfY + 19;
  if (provider?.email) { doc.text(String(provider.email), fromX + 4, fY); fY += 4.5; }
  if (provider?.phone) { doc.text(String(provider.phone), fromX + 4, fY); fY += 4.5; }
  if (provider?.address) { doc.text(String(provider.address), fromX + 4, fY); fY += 4.5; }
  const provCityLine = [provider?.zipCode, provider?.city].filter(Boolean).join(" ");
  if (provCityLine) doc.text(provCityLine, fromX + 4, fY);

  // ---------- ITEMS TABLE ----------
  const tableStartY = bfY + 46;

  const tableData = items.map((item) => [
    String(item.description || "Service"),
    String(item.quantity ?? 1),
    formatHUF(item.unitPrice),
    formatHUF(item.totalPrice),
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
      fillColor: [243, 244, 246] as any,
      textColor: [55, 65, 81] as any,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    alternateRowStyles: {
      fillColor: [252, 253, 254] as any,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "center", cellWidth: 18 },
      2: { halign: "right", cellWidth: 35 },
      3: { halign: "right", cellWidth: 35, fontStyle: "bold" },
    },
    didDrawPage: () => {
      // Re-draw the brand strip on each page
      doc.setFillColor(...BRAND);
      doc.rect(0, 0, pageW, 6, "F");
    },
  });

  let finalY = (doc as any).lastAutoTable?.finalY || tableStartY + 30;

  // Subtle bottom border for the table
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, finalY + 0.5, pageW - M, finalY + 0.5);

  // ---------- TOTALS PANEL ----------
  const totalsY = finalY + 6;
  const totalsW = 75;
  const totalsX = pageW - M - totalsW;

  const subtotal = Number(invoice.subtotal || 0);
  const tax = Number(invoice.taxAmount || 0);
  const total = Number(invoice.totalAmount || 0);

  // Subtotal & tax rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Subtotal", totalsX + 4, totalsY + 5);
  doc.setTextColor(...TEXT);
  doc.text(formatHUF(subtotal), totalsX + totalsW - 4, totalsY + 5, { align: "right" });

  doc.setTextColor(...MUTED);
  doc.text("Tax", totalsX + 4, totalsY + 11);
  doc.setTextColor(...TEXT);
  doc.text(formatHUF(tax), totalsX + totalsW - 4, totalsY + 11, { align: "right" });

  // Total — highlighted bar
  const totalBarY = totalsY + 16;
  doc.setFillColor(...BRAND);
  doc.roundedRect(totalsX, totalBarY, totalsW, 11, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL DUE", totalsX + 4, totalBarY + 7);
  doc.setFontSize(13);
  doc.text(formatHUF(total), totalsX + totalsW - 4, totalBarY + 7.2, { align: "right" });

  // Payment status note (left side)
  if ((invoice.status || "").toLowerCase() === "paid") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(22, 101, 52);
    doc.text("Payment received — thank you!", M, totalsY + 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("This invoice has been paid in full.", M, totalsY + 16);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    doc.text("Payment instructions", M, totalsY + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(
      `Please complete your payment by ${formatDate(invoice.dueDate)}.`,
      M,
      totalsY + 11
    );
    doc.text("You can pay through the Golden Life app under My invoices.", M, totalsY + 16);
  }

  // ---------- FOOTER ----------
  const footerY = pageH - 14;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, footerY - 4, pageW - M, footerY - 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Golden Life · Healthcare Booking Platform", M, footerY);
  doc.text("goldenlife.health · support@goldenlife.health", pageW - M, footerY, { align: "right" });

  doc.setTextColor(...SUBTLE);
  doc.setFontSize(7);
  doc.text(
    `Generated on ${formatDate(new Date())} · Invoice #${invoice.invoiceNumber || ""}`,
    pageW / 2,
    footerY + 4,
    { align: "center" }
  );

  return Buffer.from(doc.output("arraybuffer"));
}
