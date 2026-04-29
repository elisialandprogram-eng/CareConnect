import { storage } from "../storage";
import { generateInvoicePDF } from "./invoice-gen";
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

  const invoiceNumber = `INV-${Date.now()}-${booking.id.slice(0, 4)}`.toUpperCase();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const invoice = await storage.createInvoice(
    {
      appointmentId: booking.id,
      patientId: booking.patientId,
      providerId: booking.providerId,
      invoiceNumber,
      dueDate,
      subtotal: booking.totalAmount,
      taxAmount: "0.00",
      totalAmount: booking.totalAmount,
      status: invoiceStatus,
    },
    [
      {
        invoiceId: "",
        description: appointment.service?.name || "Healthcare Service",
        quantity: 1,
        unitPrice: booking.totalAmount,
        totalPrice: booking.totalAmount,
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
      const pdfBuffer = await generateInvoicePDF(invoiceWithRef, appointment.patient, appointment.provider, [
        {
          description: appointment.service?.name || "Healthcare Service",
          quantity: 1,
          unitPrice: booking.totalAmount,
          totalPrice: booking.totalAmount,
        },
      ]);

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
