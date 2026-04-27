import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Star, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import type { AppointmentWithDetails } from "@shared/schema";

export default function ReviewPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  const { data: appointments, isLoading: appointmentsLoading } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/patient"],
    enabled: !!user,
  });

  const appointment = useMemo(
    () => appointments?.find((a) => a.id === id),
    [appointments, id],
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!appointment) throw new Error("Appointment not found");
      if (rating < 1) throw new Error(t("review.rating_required", "Please select a star rating"));
      const response = await apiRequest("POST", "/api/reviews", {
        appointmentId: appointment.id,
        providerId: appointment.providerId,
        rating,
        comment: comment.trim(),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("review.thanks_title", "Thanks for your review!"),
        description: t("review.thanks_desc", "Your feedback helps other patients."),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/patient"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      navigate("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: t("review.submit_failed", "Could not submit review"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading || appointmentsLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12 max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>{t("review.not_found_title", "Appointment not found")}</CardTitle>
              <CardDescription>
                {t("review.not_found_desc", "We couldn't find this appointment in your history.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" data-testid="button-back-dashboard">
                <Link href="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("common.back", "Back to dashboard")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  if (appointment.status !== "completed") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12 max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>{t("review.not_completed_title", "Review unavailable")}</CardTitle>
              <CardDescription>
                {t(
                  "review.not_completed_desc",
                  "You can only review appointments that have been completed.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" data-testid="button-back-dashboard">
                <Link href="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("common.back", "Back to dashboard")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const provider = appointment.provider;
  const providerUser = provider?.user;
  const providerName = providerUser
    ? `${providerUser.firstName ?? ""} ${providerUser.lastName ?? ""}`.trim()
    : t("review.your_provider", "Your provider");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-2xl">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="mb-4"
          data-testid="button-back-dashboard"
        >
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("common.back", "Back")}
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle data-testid="text-review-title">
              {t("review.title", "Leave a review")}
            </CardTitle>
            <CardDescription>
              {t(
                "review.description",
                "Share your experience to help others find the right provider.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 rounded-md border p-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={providerUser?.avatarUrl || undefined} />
                <AvatarFallback>
                  {providerUser?.firstName?.charAt(0) ?? ""}
                  {providerUser?.lastName?.charAt(0) ?? ""}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium" data-testid="text-provider-name">
                  {providerName}
                </p>
                {provider?.specialization && (
                  <p className="text-sm text-muted-foreground truncate">
                    {provider.specialization}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {appointment.date} · {appointment.startTime}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">
                {t("review.rating_label", "Your rating")}
              </p>
              <div
                className="flex items-center gap-1"
                onMouseLeave={() => setHover(0)}
                role="radiogroup"
                aria-label="rating"
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = (hover || rating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      className="p-1"
                      onMouseEnter={() => setHover(star)}
                      onClick={() => setRating(star)}
                      aria-label={`${star} stars`}
                      data-testid={`star-${star}`}
                    >
                      <Star
                        className={`h-8 w-8 ${
                          filled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="review-comment" className="text-sm font-medium">
                {t("review.comment_label", "Comment (optional)")}
              </label>
              <Textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t(
                  "review.comment_placeholder",
                  "Tell others what worked well, what to expect…",
                )}
                rows={5}
                className="mt-2"
                data-testid="input-comment"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => navigate("/dashboard")}
                data-testid="button-cancel-review"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || rating < 1}
                data-testid="button-submit-review"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("review.submitting", "Submitting…")}
                  </>
                ) : (
                  t("review.submit", "Submit review")
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
