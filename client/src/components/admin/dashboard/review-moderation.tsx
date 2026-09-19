import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Check, X, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  appointment_date: string;
  start_time: string;
  patient_first_name: string;
  patient_last_name: string;
  provider_first_name: string;
  provider_last_name: string;
  clinic_name: string | null;
};

export function ReviewModerationPanel() {
  const { t: translate } = useTranslation();
  const t = (key: string, options?: any): string =>
    String(translate(/^admin\.(review_moderation|category_requests|calendar\.|payouts|provider_wallets|provider_financials)/.test(key)
      ? key.replace(/^admin\./, "admin_dashboard.")
      : key, options));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const queryKey = ["/api/admin/reviews", status];
  const { data: reviews = [], isLoading, refetch } = useQuery<ReviewRow[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/reviews?status=${status}`, { credentials: "include" });
      if (!response.ok) throw new Error(t("admin.review_moderation.load_failed"));
      return response.json();
    },
  });

  const decision = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: "approved" | "rejected" }) => {
      const response = await apiRequest("PATCH", `/api/admin/reviews/${id}/status`, { status: nextStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      toast({ title: t("admin.review_moderation.updated") });
    },
    onError: (error: Error) => toast({ title: t("admin.review_moderation.update_failed"), description: error.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="panel-review-moderation">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{t("admin.review_moderation.title")}</CardTitle>
          <CardDescription>{t("admin.review_moderation.description")}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} aria-label={t("admin.review_moderation.refresh")}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? "default" : "outline"}
              onClick={() => setStatus(value)}
            >
              {t(`admin.review_moderation.${value}`)}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-lg" />)}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {status === "all"
              ? t("admin.review_moderation.no_reviews_all")
              : t("admin.review_moderation.no_reviews", { status: t(`admin.review_moderation.${status}`) })}
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {review.patient_first_name} {review.patient_last_name}
                       <span className="font-normal text-muted-foreground"> {t("admin.review_moderation.reviewed")} </span>
                      {review.provider_first_name} {review.provider_last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                       {review.appointment_date} {t("admin.review_moderation.at")} {review.start_time}
                    </p>
                  </div>
                  <Badge variant={review.status === "approved" ? "default" : review.status === "rejected" ? "destructive" : "secondary"}>
                     {t(`admin.review_moderation.${review.status}`)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-amber-500" aria-label={t("admin.review_moderation.stars_aria", { count: review.rating })}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} className={`h-4 w-4 ${index < review.rating ? "fill-current" : ""}`} />
                  ))}
                </div>
                {review.comment && <p className="text-sm whitespace-pre-wrap">{review.comment}</p>}
                {review.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decision.mutate({ id: review.id, nextStatus: "approved" })}
                      disabled={decision.isPending}
                    >
                      <Check className="me-1.5 h-4 w-4" /> {t("admin.review_moderation.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decision.mutate({ id: review.id, nextStatus: "rejected" })}
                      disabled={decision.isPending}
                    >
                      <X className="me-1.5 h-4 w-4" /> {t("admin.review_moderation.reject")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReviewModerationPanel;