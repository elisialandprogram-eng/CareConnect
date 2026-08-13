import { storage } from "../storage";
import { generateInvoicePDF } from "./invoice-gen";
import { loadInvoiceTemplate } from "./invoice-template";
import { Resend } from "resend";
import { round2 } from "../lib/math";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = "GoldenLife <no-reply@goldenlife.health>";

export interface CreateInvoiceResult {
  created: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  reason?: string;
}

export async function createInvoiceForAppointment(appointmentId: string): Promise<CreateInvoiceResult> {
  const booking = await storage.getAppointment(appointmentId);
  if (!booking) {
    return { created: false, reason: "appointment_not_found" };
  }
  if (booking.invoiceGenerated) {
    return { created: false, reason: "already_generated" };
  }

  const appointment = await storage.getAppointmentWithDetails(booking.id);
  if (!appointment) {
    return { created: false, reason: "appointment_details_not_found" };
  }

  const payment = await storage.getPaymentByAppointment(booking.id);
  const invoiceStatus = ["paid", "partially_refunded", "refunded", "disputed"].includes(String(payment?.status))
    ? "paid"
    : "due";

  // Resolve currency from the immutable appointment snapshot. Invoice
  // generation is a read-only consumer of the booking financial contract.
  const invoiceCurrency =
    (booking as any).bookingCurrency
    || (booking as any).booking_currency
    || (booking as any).displayCurrency
    || (booking as any).display_currency
    || payment?.displayCurrency
    || payment?.currency
    || "USD";

  // `totalAmount`, `taxAmount`, and pricingBreakdown are booking-time values.
  // Never load the current service, tax settings, or pricing rules here.
  const _snapshotDisplayAmt = (booking as any).displayAmount || (booking as any).display_amount;
  const _snapshotRate = (booking as any).exchangeRateUsed || (booking as any).exchange_rate_used;
  const _exchangeRate = _snapshotRate ? Number(_snapshotRate) : 1;

  const invoiceNumber = `INV-${Date.now()}-${booking.id.slice(0, 4)}`.toUpperCase();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const pricingSnapshot = ((booking as any).pricingBreakdown
    || (booking as any).pricing_breakdown
    || {}) as Record<string, any>;
  const invoiceDisplayTotal = _snapshotDisplayAmt
    ? String(round2(Number(_snapshotDisplayAmt)).toFixed(2))
    : String(round2(Number(booking.totalAmount || pricingSnapshot.patientPayable || pricingSnapshot.total || 0)).toFixed(2));
  const snapshotTax = Number(
    (booking as any).taxAmount
    ?? (booking as any).tax_amount
    ?? pricingSnapshot.tax
    ?? 0,
  );
  const taxAmount = round2(snapshotTax).toFixed(2);
  const subtotal = round2(Math.max(0, Number(invoiceDisplayTotal) - snapshotTax)).toFixed(2);

  const invoice = await storage.createInvoice(
    {
      appointmentId: booking.id,
      patientId: booking.patientId,
      providerId: booking.providerId,
      invoiceNumber,
      dueDate,
      subtotal,
      taxAmount,
      totalAmount: invoiceDisplayTotal,
      status: invoiceStatus,
      currency: invoiceCurrency,
      countryCode: (booking as any).countryCode || "HU",
    } as any,
    [
      {
        invoiceId: "",
        description: appointment.service?.name || "Healthcare Service",
        quantity: 1,
        unitPrice: invoiceDisplayTotal,
        totalPrice: invoiceDisplayTotal,
        practitionerId: null,
      },
    ],
  );

  if (resend && appointment.patient?.email) {
    try {
      const invoiceWithRef = {
        ...invoice,
        appointmentNumber: (booking as any).appointmentNumber || null,
      };
      const template = await loadInvoiceTemplate();
      // Convert wallet amount (stored in USD) to the invoice display currency
      // using the same exchange rate snapshotted at booking time.
      const _rawWalletUSD = Number((booking as any).walletAmountUsed ?? 0);
      const _walletDisplay = _rawWalletUSD > 0
        ? String(round2(_rawWalletUSD * _exchangeRate))
        : "0.00";
      const enrichedInvoiceRef = {
        ...invoiceWithRef,
        platformFee: (booking as any).platformFeeAmount ?? "0.00",
        serviceTaxRate: (booking as any).serviceTaxRate ?? "0.00",
        serviceTaxAmount: (booking as any).serviceTaxAmount ?? "0.00",
        platformTaxRate: (booking as any).platformTaxRate ?? "0.00",
        platformTaxAmount: (booking as any).platformTaxAmount ?? "0.00",
        promoDiscount: (booking as any).promoDiscount ?? "0.00",
        promoCode: (booking as any).promoCode ?? null,
        packageDiscountAmount: (booking as any).packageDiscountAmount ?? "0.00",
        membershipLabel: (booking as any).packageIdUsed ? "Member discount" : null,
        walletAmountUsed: _walletDisplay,
        appointmentDate: booking.date ?? null,
        visitType: booking.visitType ?? null,
      };
      const pdfBuffer = await generateInvoicePDF(enrichedInvoiceRef, appointment.patient, appointment.provider, [
        {
          description: appointment.service?.name || "Healthcare Service",
          quantity: 1,
          unitPrice: invoiceDisplayTotal,
          totalPrice: invoiceDisplayTotal,
        },
      ], { template });

      const statusLine =
        invoiceStatus === "paid"
          ? "Thank you — your payment has been received."
          : "This invoice is due. Please complete payment at your earliest convenience.";

      await resend.emails.send({
        from: FROM_EMAIL,
        to: appointment.patient.email,
        subject: `Invoice ${invoiceNumber}${(booking as any).appointmentNumber ? ' — Appt. ' + (booking as any).appointmentNumber : ''} - GoldenLife`,
        text: `Dear ${appointment.patient.firstName},\n\nPlease find attached the invoice for your recent appointment${(booking as any).appointmentNumber ? ' (' + (booking as any).appointmentNumber + ')' : ''} with ${appointment.provider?.user?.firstName || "your provider"}.\n\n${statusLine}\n\n— Golden Life`,
        attachments: [
          {
            filename: `invoice-${invoiceNumber}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
    } catch (mailErr) {
      console.error("[invoice-helper] failed to send invoice email:", mailErr);
    }
  }

  return { created: true, invoiceId: invoice.id, invoiceNumber };
}
