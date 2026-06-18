import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { Link } from "wouter";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  Crown, Shield, CheckCircle2, XCircle, PauseCircle, PlayCircle,
  RefreshCw, AlertTriangle, ChevronRight, Loader2, Star, Clock, Calendar,
  ToggleLeft, ToggleRight, ArrowRight, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:    { label: "Active",    color: "bg-emerald-100 text-emerald-800 border-emerald-200",  icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> },
  paused:    { label: "Paused",    color: "bg-amber-100 text-amber-800 border-amber-200",        icon: <PauseCircle  className="h-4 w-4 text-amber-600"   /> },
  expired:   { label: "Expired",   color: "bg-slate-100 text-slate-600 border-slate-200",        icon: <Clock        className="h-4 w-4 text-slate-500"   /> },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-200",              icon: <XCircle      className="h-4 w-4 text-red-600"     /> },
  pending:   { label: "Pending",   color: "bg-blue-100 text-blue-700 border-blue-200",           icon: <Clock        className="h-4 w-4 text-blue-600"    /> },
};

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "d MMM yyyy");
}


export default function MembershipDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: packages = [], isLoading } = useQuery<any[]>({
    queryKey: QK.myPackages(),
  });

  const [usageOpenId, setUsageOpenId] = useState<string | null>(null);

  const { data: usage = [], isLoading: usageLoading } = useQuery<any[]>({
    queryKey: QK.userPackageUsage(usageOpenId ?? ""),
    enabled: !!usageOpenId,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: QK.myPackages() });
  }

  const pauseMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/user-packages/${id}/pause`),
    onSuccess: () => { invalidate(); toast({ title: "Membership paused" }); },
    onError: (e: any) => toast({ title: "Failed to pause", description: e.message, variant: "destructive" }),
  });

  const resumeMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/user-packages/${id}/resume`),
    onSuccess: () => { invalidate(); toast({ title: "Membership resumed" }); },
    onError: (e: any) => toast({ title: "Failed to resume", description: e.message, variant: "destructive" }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/user-packages/${id}/cancel-renewal`),
    onSuccess: () => { invalidate(); toast({ title: "Auto-renewal cancelled" }); },
    onError: (e: any) => toast({ title: "Failed to cancel renewal", description: e.message, variant: "destructive" }),
  });

  const autoRenewMut = useMutation({
    mutationFn: ({ id, autoRenew }: { id: string; autoRenew: boolean }) =>
      apiRequest("PATCH", `/api/user-packages/${id}/auto-renew`, { autoRenew }),
    onSuccess: (_, { autoRenew }) => {
      invalidate();
      toast({ title: autoRenew ? "Auto-renew enabled" : "Auto-renew disabled" });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  const active   = packages.filter(p => p.status === "active");
  const paused   = packages.filter(p => p.status === "paused");
  const inactive = packages.filter(p => !["active", "paused"].includes(p.status));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Memberships</h1>
            <p className="text-muted-foreground text-sm">Manage your healthcare plans and benefits</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/packages">
            <Package className="h-4 w-4 mr-2" />
            Browse plans
          </Link>
        </Button>
      </div>

      {packages.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Crown className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-semibold text-lg mb-1">No memberships yet</p>
            <p className="text-muted-foreground text-sm mb-4">
              Unlock exclusive benefits and discounts with a Golden Life membership.
            </p>
            <Button asChild>
              <Link href="/packages">View available plans <ArrowRight className="h-4 w-4 ml-2" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active + Paused */}
      {[...active, ...paused].map(up => (
        <PlanCard
          key={up.id}
          up={up}
          usageOpen={usageOpenId === up.id}
          usageLoading={usageLoading}
          usage={usageOpenId === up.id ? usage : []}
          onToggleUsage={() => setUsageOpenId(usageOpenId === up.id ? null : up.id)}
          onPause={() => pauseMut.mutate(up.id)}
          onResume={() => resumeMut.mutate(up.id)}
          onCancelRenewal={() => cancelMut.mutate(up.id)}
          onToggleAutoRenew={(v) => autoRenewMut.mutate({ id: up.id, autoRenew: v })}
          isPausing={pauseMut.isPending}
          isResuming={resumeMut.isPending}
          isCancelling={cancelMut.isPending}
          isAutoRenewPending={autoRenewMut.isPending}
        />
      ))}

      {/* Past plans */}
      {inactive.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Past plans</h2>
          <div className="space-y-3">
            {inactive.map(up => (
              <PlanCard key={up.id} up={up} past />
            ))}
          </div>
        </div>
      )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function BenefitBar({ label, used, total }: { label: string; used: number; total: number | null }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const overUsed = total && used > total;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className={overUsed ? "text-destructive font-semibold" : "text-muted-foreground"}>
          {used}{total ? ` / ${total}` : " used"}
        </span>
      </div>
      {total && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overUsed ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PlanCard({
  up, past = false,
  usageOpen, usageLoading, usage,
  onToggleUsage, onPause, onResume, onCancelRenewal, onToggleAutoRenew,
  isPausing, isResuming, isCancelling, isAutoRenewPending,
}: {
  up: any; past?: boolean;
  usageOpen?: boolean; usageLoading?: boolean; usage?: any[];
  onToggleUsage?: () => void;
  onPause?: () => void; onResume?: () => void; onCancelRenewal?: () => void;
  onToggleAutoRenew?: (v: boolean) => void;
  isPausing?: boolean; isResuming?: boolean; isCancelling?: boolean; isAutoRenewPending?: boolean;
}) {
  const cfg = STATUS_CONFIG[up.status] ?? STATUS_CONFIG.pending;
  const expiresAt = up.expiresAt ? new Date(up.expiresAt) : null;
  const isExpiringSoon = expiresAt && !isPast(expiresAt) &&
    (expiresAt.getTime() - Date.now()) < 7 * 86400_000;
  const benefits: any[] = up.benefits ?? [];

  return (
    <Card className={past ? "opacity-70" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{up.package?.name ?? "Membership Plan"}</CardTitle>
              {up.package?.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{up.package.description}</p>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>
            {cfg.icon}{cfg.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Activated</p>
            <p className="font-medium">{fmtDate(up.activatedAt ?? up.purchasedAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Expires</p>
            <p className={`font-medium ${isExpiringSoon ? "text-amber-600" : ""}`}>
              {fmtDate(up.expiresAt)}
              {isExpiringSoon && <span className="text-xs ml-1">({formatDistanceToNow(expiresAt!)})</span>}
            </p>
          </div>
          {(up as any).pausedAt && (
            <div>
              <p className="text-muted-foreground text-xs">Paused on</p>
              <p className="font-medium">{fmtDate((up as any).pausedAt)}</p>
            </div>
          )}
          {(up as any).cancelledAt && (
            <div>
              <p className="text-muted-foreground text-xs">Cancelled on</p>
              <p className="font-medium">{fmtDate((up as any).cancelledAt)}</p>
            </div>
          )}
        </div>

        {isExpiringSoon && up.status === "active" && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Expiring soon — renew to avoid service interruption.
          </div>
        )}

        {/* Benefits tracker */}
        {benefits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Benefits</p>
            <div className="space-y-2">
              {benefits.map((b: any) => (
                <div key={b.id} className="flex items-center gap-2 text-sm">
                  <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>{b.description ?? b.benefitType}</span>
                  {b.allowancePerPeriod && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {b.allowancePerPeriod} / {b.periodUnit ?? "period"}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Usage history */}
        {!past && onToggleUsage && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              onClick={onToggleUsage}
            >
              <Clock className="h-3.5 w-3.5" />
              {usageOpen ? "Hide" : "Show"} usage history
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${usageOpen ? "rotate-90" : ""}`} />
            </button>
            {usageOpen && (
              <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-1">
                {usageLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />}
                {!usageLoading && (usage ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center">No usage recorded yet</p>
                )}
                {(usage ?? []).map((u: any) => (
                  <div key={u.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{fmtDate(u.createdAt)}</span>
                    <span className="font-medium capitalize">{u.benefitType?.replace(/_/g, " ") ?? "—"}</span>
                    <span className="text-muted-foreground">{u.description ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        {!past && (
          <>
            <Separator />
            <div className="flex flex-wrap items-center gap-3">
              {/* Auto-renew toggle */}
              {(up.status === "active" || up.status === "paused") && onToggleAutoRenew && (
                <div className="flex items-center gap-2">
                  <Switch
                    id={`ar-${up.id}`}
                    checked={!!(up as any).autoRenew}
                    onCheckedChange={onToggleAutoRenew}
                    disabled={isAutoRenewPending}
                  />
                  <Label htmlFor={`ar-${up.id}`} className="text-sm cursor-pointer">
                    {(up as any).autoRenew ? (
                      <span className="flex items-center gap-1"><ToggleRight className="h-4 w-4 text-primary" />Auto-renew on</span>
                    ) : (
                      <span className="flex items-center gap-1"><ToggleLeft className="h-4 w-4 text-muted-foreground" />Auto-renew off</span>
                    )}
                  </Label>
                </div>
              )}

              <div className="flex gap-2 ml-auto">
                {up.status === "active" && onPause && (
                  <Button variant="outline" size="sm" onClick={onPause} disabled={isPausing}>
                    {isPausing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PauseCircle className="h-4 w-4 mr-1.5" />}
                    Pause
                  </Button>
                )}
                {up.status === "paused" && onResume && (
                  <Button variant="outline" size="sm" onClick={onResume} disabled={isResuming}>
                    {isResuming ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
                    Resume
                  </Button>
                )}
                {["active", "paused"].includes(up.status) && onCancelRenewal && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onCancelRenewal} disabled={isCancelling}>
                    {isCancelling ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Renewal badge */}
        {!past && up.status === "active" && (up as any).autoRenew && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">
            <RefreshCw className="h-3 w-3" />
            Auto-renewal active{expiresAt ? ` — renews ${fmtDate(expiresAt)}` : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
