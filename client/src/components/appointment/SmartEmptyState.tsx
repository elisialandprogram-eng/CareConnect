import { Calendar, CheckCircle2, XCircle, Clock, Heart, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

type EmptyContext =
  | "upcoming"
  | "completed"
  | "cancelled"
  | "past"
  | "provider_today"
  | "provider_pending"
  | "provider_history"
  | "provider_all"
  | "search";

interface Props {
  context: EmptyContext;
  hasFilter?: boolean;
  providerName?: string | null;
  className?: string;
}

const CONFIG: Record<EmptyContext, {
  icon: React.ReactNode;
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
  color: string;
  cta?: { labelKey: string; labelFallback: string; href: string; icon: React.ReactNode };
}> = {
  upcoming: {
    icon: <Calendar className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.upcoming_title",
    titleFallback: "No upcoming appointments",
    descriptionKey: "provider_sweep.empty.upcoming_description",
    descriptionFallback: "You don't have any scheduled appointments. Book a session with one of our verified healthcare providers.",
    color: "text-blue-500",
    cta: { labelKey: "provider_sweep.empty.find_provider", labelFallback: "Find a provider", href: "/providers", icon: <Plus className="h-4 w-4 mr-1" /> },
  },
  completed: {
    icon: <CheckCircle2 className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.completed_title",
    titleFallback: "No completed sessions yet",
    descriptionKey: "provider_sweep.empty.completed_description",
    descriptionFallback: "Your completed appointments will appear here after your first session.",
    color: "text-emerald-500",
    cta: { labelKey: "provider_sweep.empty.first_session", labelFallback: "Book your first session", href: "/providers", icon: <Plus className="h-4 w-4 mr-1" /> },
  },
  cancelled: {
    icon: <XCircle className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.cancelled_title",
    titleFallback: "No cancelled appointments",
    descriptionKey: "provider_sweep.empty.cancelled_description",
    descriptionFallback: "You have a clean record — no cancellations to show.",
    color: "text-rose-500",
  },
  past: {
    icon: <Clock className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.past_title",
    titleFallback: "No appointment history",
    descriptionKey: "provider_sweep.empty.past_description",
    descriptionFallback: "Your past appointments will appear here once you've had your first session.",
    color: "text-slate-400",
    cta: { labelKey: "provider_sweep.empty.book_session", labelFallback: "Book a session", href: "/providers", icon: <Plus className="h-4 w-4 mr-1" /> },
  },
  provider_today: {
    icon: <Calendar className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.provider_today_title",
    titleFallback: "No appointments today",
    descriptionKey: "provider_sweep.empty.provider_today_description",
    descriptionFallback: "Your schedule is clear for today. Enjoy the break, or check upcoming days.",
    color: "text-blue-500",
  },
  provider_pending: {
    icon: <Clock className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.provider_pending_title",
    titleFallback: "No pending requests",
    descriptionKey: "provider_sweep.empty.provider_pending_description",
    descriptionFallback: "All appointment requests have been reviewed. You're all caught up.",
    color: "text-amber-500",
  },
  provider_history: {
    icon: <Clock className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.provider_history_title",
    titleFallback: "No past appointments",
    descriptionKey: "provider_sweep.empty.provider_history_description",
    descriptionFallback: "Your appointment history will appear here after you complete your first session.",
    color: "text-slate-400",
  },
  provider_all: {
    icon: <Heart className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.provider_all_title",
    titleFallback: "No appointments yet",
    descriptionKey: "provider_sweep.empty.provider_all_description",
    descriptionFallback: "Your appointments will appear here once members start booking your services.",
    color: "text-rose-400",
  },
  search: {
    icon: <Search className="h-8 w-8" />,
    titleKey: "provider_sweep.empty.search_title",
    titleFallback: "No results found",
    descriptionKey: "provider_sweep.empty.search_description",
    descriptionFallback: "Try adjusting your filters or search term.",
    color: "text-slate-400",
  },
};

export function SmartEmptyState({ context, hasFilter, className = "" }: Props) {
  const { t } = useTranslation();
  const cfg = CONFIG[context];

  const title = hasFilter ? t("provider_sweep.empty.filtered_title", "No results match your filter") : t(cfg.titleKey, cfg.titleFallback);
  const description = hasFilter ? t("provider_sweep.empty.filtered_description", "Try clearing your filters to see all appointments.") : t(cfg.descriptionKey, cfg.descriptionFallback);

  return (
    <div
      className={`flex flex-col items-center justify-center py-16 text-center space-y-4 ${className}`}
      data-testid={`empty-state-${context}`}
    >
      <div className={`h-16 w-16 rounded-full bg-muted flex items-center justify-center ${cfg.color}`}>
        {cfg.icon}
      </div>
      <div className="space-y-1 max-w-xs">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {!hasFilter && cfg.cta && (
        <Button asChild data-testid={`empty-state-cta-${context}`}>
          <Link href={cfg.cta.href}>
            {cfg.cta.icon}
            {t(cfg.cta.labelKey, cfg.cta.labelFallback)}
          </Link>
        </Button>
      )}
      {hasFilter && (
        <p className="text-xs text-muted-foreground">
          {t("provider_sweep.empty.filtered_description", "Try clearing your filters to see all appointments.")}
        </p>
      )}
    </div>
  );
}
