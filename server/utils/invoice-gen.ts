import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatHUF(value: any): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 Ft";
  return `${Math.round(n).toLocaleString("hu-HU")} Ft`;
}

export async function generateInvoicePDF(invoice: any, patient: any, provider: any, items: any[]) {
  const doc = new jsPDF() as any;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text("INVOICE", 105, 22, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("Golden Life — Healthcare Booking", 105, 29, { align: "center" });

  // Invoice meta
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 20, 44);
  const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : new Date();
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date();
  doc.text(`Issue Date: ${issueDate.toLocaleDateString("hu-HU")}`, 20, 50);
  doc.text(`Due Date:   ${dueDate.toLocaleDateString("hu-HU")}`, 20, 56);

  doc.setFontSize(11);
  doc.text(`Status: ${(invoice.status || "due").toUpperCase()}`, 150, 44);

  // Patient
  doc.setFontSize(11);
  doc.text("Bill To:", 20, 70);
  doc.setFontSize(10);
  const patientLines = [
    [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || "Patient",
    patient?.email || "",
    patient?.address || "",
    [patient?.zipCode, patient?.city].filter(Boolean).join(" "),
  ].filter(Boolean);
  patientLines.forEach((line, i) => doc.text(String(line), 20, 76 + i * 5));

  // Provider
  doc.setFontSize(11);
  doc.text("From:", 120, 70);
  doc.setFontSize(10);
  const providerLines = [
    [provider?.firstName, provider?.lastName].filter(Boolean).join(" ") || "Provider",
    provider?.email || "",
    provider?.address || "",
    [provider?.zipCode, provider?.city].filter(Boolean).join(" "),
  ].filter(Boolean);
  providerLines.forEach((line, i) => doc.text(String(line), 120, 76 + i * 5));

  // Items table
  const tableData = items.map((item) => [
    item.description,
    String(item.quantity ?? 1),
    formatHUF(item.unitPrice),
    formatHUF(item.totalPrice),
  ]);

  autoTable(doc, {
    startY: 110,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { halign: "center", cellWidth: 20 },
      2: { halign: "right", cellWidth: 35 },
      3: { halign: "right", cellWidth: 35 },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 150;

  // Totals
  doc.setFontSize(10);
  doc.text("Subtotal:", 130, finalY + 12, { align: "right" });
  doc.text(formatHUF(invoice.subtotal), 185, finalY + 12, { align: "right" });

  doc.text("Tax:", 130, finalY + 18, { align: "right" });
  doc.text(formatHUF(invoice.taxAmount), 185, finalY + 18, { align: "right" });

  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text("Total:", 130, finalY + 28, { align: "right" });
  doc.text(formatHUF(invoice.totalAmount), 185, finalY + 28, { align: "right" });

  // Footer note
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const footerNote =
    invoice.status === "paid"
      ? "Thank you — your payment has been received."
      : "Please complete payment by the due date above.";
  doc.text(footerNote, 105, finalY + 45, { align: "center" });
  doc.text("Golden Life · goldenlife.health", 105, finalY + 51, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
