import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Zap, ShieldAlert, ShieldCheck, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CircuitBreakerState {
  frozen: boolean;
  reason: string | null;
  frozenAt: string | null;
  frozenBy: string | null;
  frozenByName: string | null;
}

export function SystemBreaker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"freeze" | "unfreeze" | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, refetch } = useQuery<CircuitBreakerState>({
    queryKey: ["/api/admin/system/circuit-breaker"],
    refetchInterval: 30_000,
  });

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: async ({ frozen, reason }: { frozen: boolean; reason: string }) => {
      const res = await apiRequest("POST", "/api/admin/system/circuit-breaker", { frozen, reason });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({
        title: vars.frozen ? "⚠ Platform frozen" : "Platform restored",
        description: vars.frozen
          ? "All new bookings and withdrawals are now blocked."
          : "Normal operations have resumed.",
        variant: vars.frozen ? "destructive" : "default",
      });
      setConfirmOpen(false);
      setPendingAction(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system/circuit-breaker"] });
    },
    onError: () => {
      toast({ title: "Failed to update circuit breaker", variant: "destructive" });
    },
  });

  const frozen = data?.frozen ?? false;

  function openConfirm(action: "freeze" | "unfreeze") {
    setPendingAction(action);
    setReason("");
    setConfirmOpen(true);
  }

  function handleConfirm() {
    if (!pendingAction) return;
    if (pendingAction === "freeze" && !reason.trim()) {
      toast({ title: "A reason is required to freeze the platform", variant: "destructive" });
      return;
    }
    toggle({ frozen: pendingAction === "freeze", reason: reason.trim() });
  }

  return (
    <>
      <div className="space-y-6">
        {/* Status banner */}
        <div
          className={cn(
            "rounded-2xl border-2 p-6 transition-all",
            frozen
              ? "border-red-400 bg-red-50 dark:bg-red-950/20 dark:border-red-700"
              : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-700"
          )}
          data-testid="circuit-breaker-status-banner"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "h-14 w-14 rounded-2xl flex items-center justify-center shadow-md",
                  frozen ? "bg-red-500" : "bg-emerald-500"
                )}
              >
                {frozen ? (
                  <ShieldAlert className="h-7 w-7 text-white" />
                ) : (
                  <ShieldCheck className="h-7 w-7 text-white" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <span
                    className={cn(
                      "text-xl font-bold tracking-tight",
                      frozen ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {frozen ? "PLATFORM FROZEN" : "SYSTEM ACTIVE"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                      frozen
                        ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300"
                    )}
                    data-testid="badge-system-status"
                  >
                    {frozen ? "● FROZEN" : "● LIVE"}
                  </span>
                </div>
                <p className={cn("text-sm", frozen ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {frozen
                    ? "New bookings and wallet withdrawals are currently blocked."
                    : "All platform operations are running normally."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-breaker"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              </Button>
              {frozen ? (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  disabled={isPending}
                  onClick={() => openConfirm("unfreeze")}
                  data-testid="button-unfreeze-platform"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Restore Operations
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-2"
                  disabled={isPending}
                  onClick={() => openConfirm("freeze")}
                  data-testid="button-freeze-platform"
                >
                  <Zap className="h-4 w-4" />
                  EMERGENCY FREEZE
                </Button>
              )}
            </div>
          </div>

          {frozen && data?.reason && (
            <div className="mt-4 rounded-xl border border-red-200 bg-white/60 dark:bg-red-900/10 dark:border-red-800 p-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Freeze reason</p>
              <p className="text-sm text-red-800 dark:text-red-300">{data.reason}</p>
            </div>
          )}
        </div>

        {/* Freeze metadata */}
        {frozen && (data?.frozenAt || data?.frozenByName) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.frozenAt && (
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="py-4 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Frozen at</p>
                    <p className="text-sm font-medium">{new Date(data.frozenAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {data.frozenByName && (
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="py-4 flex items-center gap-3">
                  <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Frozen by</p>
                    <p className="text-sm font-medium">{data.frozenByName}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* What gets blocked */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              What the emergency freeze blocks
            </CardTitle>
            <CardDescription>
              When activated, the following operations are immediately rejected platform-wide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "New appointment bookings", desc: "Patients cannot book any new slots" },
                { label: "Wallet withdrawals", desc: "Provider payout requests are blocked" },
                { label: "Slot reservations", desc: "Real-time slot holds are prevented" },
                { label: "New payment charges", desc: "Stripe charges for bookings are halted" },
              ].map(({ label, desc }) => (
                <div
                  key={label}
                  className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5"
                >
                  <div className={cn("mt-0.5 h-2 w-2 rounded-full flex-shrink-0", frozen ? "bg-red-500" : "bg-muted-foreground/40")} />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingAction === "freeze" ? (
                <><Zap className="h-5 w-5 text-red-500" /> Emergency Platform Freeze</>
              ) : (
                <><ShieldCheck className="h-5 w-5 text-emerald-500" /> Restore Platform Operations</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "freeze"
                ? "This will immediately block all new bookings and wallet withdrawals platform-wide. All in-progress operations are unaffected."
                : "This will restore normal platform operations. Patients will be able to book and providers can request payouts again."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="breaker-reason" className="text-sm font-medium">
              {pendingAction === "freeze" ? "Reason for freeze" : "Reason for restoration"}
              {pendingAction === "freeze" && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id="breaker-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                pendingAction === "freeze"
                  ? "e.g. Suspicious payment pattern detected — investigating..."
                  : "e.g. Investigation complete — operations restored"
              }
              className="min-h-[72px] text-sm"
              data-testid="textarea-breaker-reason"
            />
            {pendingAction === "freeze" && !reason.trim() && (
              <p className="text-xs text-red-500">A reason is required to freeze the platform.</p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isPending || (pendingAction === "freeze" && !reason.trim())}
              className={cn(
                pendingAction === "freeze"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              )}
              data-testid="button-confirm-breaker-action"
            >
              {isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {pendingAction === "freeze" ? "Freeze Platform" : "Restore Operations"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
