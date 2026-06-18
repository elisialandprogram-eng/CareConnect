import { formatInCurrency } from "@/lib/currency";
import { CheckCircle2, Star, FileText, RefreshCw, MessageSquare, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface Props {
  appointmentId: string;
  serviceId?: string | null;
  providerId?: string | null;
  visitType?: string;
  providerName?: string | null;
  hasReview?: boolean;
  invoiceGenerated?: boolean;
  prescriptionsCount?: number;
  totalAmount?: number | string | null;
  currency?: string;
  className?: string;
}

export function PostAppointmentSummary({
  appointmentId,
  serviceId,
  providerId,
  visitType,
  providerName,
  hasReview,
  invoiceGenerated,
  prescriptionsCount = 0,
  totalAmount,
  className = "",
}: Props) {
  const total = Number(totalAmount ?? 0);

  return (
    <div
      className={`rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-4 ${className}`}
      data-testid="post-appointment-summary"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h4 className="font-semibold text-emerald-900 dark:text-emerald-200">Session Completed</h4>
          {providerName && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">with {providerName}</p>
          )}
        </div>
      </div>

      {/* Summary items */}
      <div className="grid grid-cols-2 gap-2">
        {total > 0 && (
          <div className="rounded-lg bg-white dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="font-semibold text-sm">
              {formatInCurrency(total ?? 0, currency ?? "USD")}
            </p>
          </div>
        )}
        {prescriptionsCount > 0 && (
          <div className="rounded-lg bg-white dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">Prescriptions</p>
            <p className="font-semibold text-sm">{prescriptionsCount}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!hasReview && (
          <Button size="sm" variant="default" asChild className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" data-testid="button-post-leave-review">
            <Link href={`/review/${appointmentId}`}>
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Leave a review
            </Link>
          </Button>
        )}
        {providerId && (
          <Button size="sm" variant="outline" asChild data-testid="button-post-rebook">
            <Link href={`/book?providerId=${providerId}${serviceId ? `&serviceId=${serviceId}` : ""}&visitType=${visitType ?? "clinic"}`}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Book again
            </Link>
          </Button>
        )}
        {invoiceGenerated && (
          <Button size="sm" variant="outline" asChild data-testid="button-post-invoice">
            <a href={`/api/invoices/by-appointment/${appointmentId}/download`} target="_blank" rel="noreferrer">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Download invoice
            </a>
          </Button>
        )}
        {providerId && (
          <Button size="sm" variant="ghost" asChild data-testid="button-post-message">
            <Link href="/messages">
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Message provider
            </Link>
          </Button>
        )}
      </div>

      {!hasReview && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <Heart className="h-3 w-3" />
          Your feedback helps others choose the right care
        </p>
      )}
    </div>
  );
}
