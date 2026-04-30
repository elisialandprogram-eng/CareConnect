import { storage } from "../storage";
import { generateInvoicePDF } from "./invoice-gen";
import { loadInvoiceTemplate } from "./invoice-template";
import { computeFinalPrice } from "../lib/pricing";
import { Resend } from "resend";

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
  const invoiceStatus = payment?.status === "completed" ? "paid" : "due";

  // Resolve currency from provider profile (falls back to USD inside the PDF).
  const invoiceCurrency = (appointment.provider as any)?.currency
    || payment?.currency
    || "USD";

  const invoiceNumber = `INV-${Date.now()}-${booking.id.slice(0, 4)}`.toUpperCase();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  // Recompute the price breakdown so the invoice carries an accurate tax line.
  // We fall back to the stored totalAmount if the service/sub-service is missing.
  const totalAmount = booking.totalAmount;
  let subtotal = totalAmount;
  let taxAmount = "0.00";
  try {
    const svc = (appointment as any).service ?? null;
    const subSvc = svc?.subServiceId ? await storage.getSubService(svc.subServiceId) : null;
    if (svc || subSvc) {
      const breakdown = computeFinalPrice({
        subService: subSvc ? {
          basePrice: subSvc.basePrice,
          platformFee: subSvc.platformFee,
          taxPercentage: subSvc.taxPercentage,
          pricingType: subSvc.pricingType,
          durationMinutes: subSvc.durationMinutes,
        } : null,
        service: svc ? {
          price: svc.price,
          duration: svc.duration,
          platformFeeOverride: svc.platformFeeOverride,
          homeVisitFee: svc.homeVisitFee,
          clinicFee: svc.clinicFee,
          telemedicineFee: svc.telemedicineFee,
          emergencyFee: svc.emergencyFee,
        } : null,
        visitType: (booking.visitType || "clinic") as "online" | "home" | "clinic",
        sessions: 1,
      });
      // The stored totalAmount on the appointment is authoritative (may include
      // promo discount applied at booking time). Derive tax from the same ratio
      // so the breakdown stays consistent.
      const total = Number(totalAmount);
      const computedTotal = breakdown.total > 0 ? breakdown.total : total;
      const taxRatio = computedTotal > 0 ? breakdown.tax / computedTotal : 0;
      const taxNum = Math.round(total * taxRatio * 100) / 100;
      taxAmount = taxNum.toFixed(2);
      subtotal = (total - taxNum).toFixed(2);
    }
  } catch (priceErr) {
    console.warn("[invoice-helper] could not recompute breakdown, using flat total:", priceErr);
  }

  const invoice = await storage.createInvoice(
    {
      appointmentId: booking.id,
      patientId: booking.patientId,
      providerId: booking.providerId,
      invoiceNumber,
      dueDate,
      subtotal,
      taxAmount,
      totalAmount,
      status: invoiceStatus,
      currency: invoiceCurrency,
      countryCode: (booking as any).countryCode || "HU",
    } as any,
    [
      {
        invoiceId: "",
        description: appointment.service?.name || "Healthcare Service",
        quantity: 1,
        unitPrice: subtotal,
        totalPrice: subtotal,
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
      const pdfBuffer = await generateInvoicePDF(invoiceWithRef, appointment.patient, appointment.provider, [
        {
          description: appointment.service?.name || "Healthcare Service",
          quantity: 1,
          unitPrice: booking.totalAmount,
          totalPrice: booking.totalAmount,
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
