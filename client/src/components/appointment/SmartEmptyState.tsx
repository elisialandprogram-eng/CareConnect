import { Calendar, CheckCircle2, XCircle, Clock, Heart, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

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
  title: string;
  description: string;
  color: string;
  cta?: { label: string; href: string; icon: React.ReactNode };
}> = {
  upcoming: {
    icon: <Calendar className="h-8 w-8" />,
    title: "No upcoming appointments",
    description: "You don't have any scheduled appointments. Book a session with one of our verified healthcare providers.",
    color: "text-blue-500",
    cta: { label: "Find a provider", href: "/providers", icon: <Plus className="h-4 w-4 mr-1" /> },
  },
  completed: {
    icon: <CheckCircle2 className="h-8 w-8" />,
    title: "No completed sessions yet",
    description: "Your completed appointments will appear here after your first session.",
    color: "text-emerald-500",
    cta: { label: "Book your first session", href: "/providers", icon: <Plus className="h-4 w-4 mr-1" /> },
  },
  cancelled: {
    icon: <XCircle className="h-8 w-8" />,
    title: "No cancelled appointments",
    description: "You have a clean record — no cancellations to show.",
    color: "text-rose-500",
  },
  past: {
    icon: <Clock className="h-8 w-8" />,
    title: "No appointment history",
    description: "Your past appointments will appear here once you've had your first session.",
    color: "text-slate-400",
    cta: { label: "Book a session", href: "/providers", icon: <Plus className="h-4 w-4 mr-1" /> },
  },
  provider_today: {
    icon: <Calendar className="h-8 w-8" />,
    title: "No appointments today",
    description: "Your schedule is clear for today. Enjoy the break, or check upcoming days.",
    color: "text-blue-500",
  },
  provider_pending: {
    icon: <Clock className="h-8 w-8" />,
    title: "No pending requests",
    description: "All appointment requests have been reviewed. You're all caught up.",
    color: "text-amber-500",
  },
  provider_history: {
    icon: <Clock className="h-8 w-8" />,
    title: "No past appointments",
    description: "Your appointment history will appear here after you complete your first session.",
    color: "text-slate-400",
  },
  provider_all: {
    icon: <Heart className="h-8 w-8" />,
    title: "No appointments yet",
    description: "Your appointments will appear here once patients start booking your services.",
    color: "text-rose-400",
  },
  search: {
    icon: <Search className="h-8 w-8" />,
    title: "No results found",
    description: "Try adjusting your filters or search term.",
    color: "text-slate-400",
  },
};

export function SmartEmptyState({ context, hasFilter, className = "" }: Props) {
  const cfg = CONFIG[context];

  const title = hasFilter ? "No results match your filter" : cfg.title;
  const description = hasFilter ? "Try clearing your filters to see all appointments." : cfg.description;

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
            {cfg.cta.label}
          </Link>
        </Button>
      )}
      {hasFilter && (
        <p className="text-xs text-muted-foreground">
          Clear filters to see all appointments
        </p>
      )}
    </div>
  );
}
