import { jsPDF } from "jspdf";
import "jspdf-autotable";

export async function generateInvoicePDF(invoice: any, patient: any, provider: any, items: any[]) {
  const doc = new jsPDF() as any;
  
  // Header
  doc.setFontSize(20);
  doc.text("INVOICE", 105, 20, { align: "center" });
  
  doc.setFontSize(10);
  doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 20, 40);
  doc.text(`Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, 20, 45);
  doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 20, 50);
  
  // Patient Info
  doc.setFontSize(12);
  doc.text("Bill To:", 20, 65);
  doc.setFontSize(10);
  doc.text(`${patient.firstName} ${patient.lastName}`, 20, 72);
  doc.text(patient.email, 20, 77);
  if (patient.address) doc.text(patient.address, 20, 82);
  
  // Provider Info
  doc.setFontSize(12);
  doc.text("From:", 120, 65);
  doc.setFontSize(10);
  doc.text(provider.firstName + " " + provider.lastName, 120, 72);
  doc.text(provider.email, 120, 77);
  
  // Table
  const tableData = items.map(item => [
    item.description,
    item.quantity.toString(),
    `$${Number(item.unitPrice).toFixed(2)}`,
    `$${Number(item.totalPrice).toFixed(2)}`
  ]);
  
  doc.autoTable({
    startY: 95,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [41, 128, 185] }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 150;
  
  // Totals
  doc.text(`Subtotal: $${Number(invoice.subtotal).toFixed(2)}`, 140, finalY + 20);
  doc.text(`Tax: $${Number(invoice.taxAmount).toFixed(2)}`, 140, finalY + 25);
  doc.setFontSize(12);
  doc.text(`Total: $${Number(invoice.totalAmount).toFixed(2)}`, 140, finalY + 35);
  
  return Buffer.from(doc.output("arraybuffer"));
}
