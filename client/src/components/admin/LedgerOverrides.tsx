import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAdminCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Lock, Unlock, FileText, Search, AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface EscrowEntry {
  id: string;
  appointment_number: string;
  patient_name: string;
  provider_name: string;
  date: string;
  total_amount: string;
  payment_status: string;
  visit_type: string;
  country_code: string;
  created_at: string;
}

interface LedgerOverrideRow {
  id: string;
  admin_name: string;
  action: string;
  appointment_id: string | null;
  amount: string;
  reason: string;
  created_at: string;
  country_code: string | null;
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  escrow:    "bg-amber-100 text-amber-700 border-amber-200",
  partial:   "bg-orange-100 text-orange-700 border-orange-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
};

export function LedgerOverrides() {
  const { format: fmt } = useAdminCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EscrowEntry | null>(null);
  const [overrideAction, setOverrideAction] = useState("release_escrow");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: escrowRows = [], isLoading, refetch } = useQuery<EscrowEntry[]>({
    queryKey: ["/api/admin/financial/escrow-pending"],
  });

  const { data: overrideHistory = [] } = useQuery<LedgerOverrideRow[]>({
    queryKey: ["/api/admin/financial/ledger-overrides"],
  });

  const { mutate: submitOverride, isPending } = useMutation({
    mutationFn: async (payload: {
      appointmentId: string;
      action: string;
      amount: number | null;
      reason: string;
    }) => {
      const res = await apiRequest("POST", "/api/admin/financial/ledger-override", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ledger override applied", description: "Audit log entry created." });
      setSelected(null);
      setOverrideReason("");
      setOverrideAmount("");
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/financial/escrow-pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/financial/ledger-overrides"] });
    },
    onError: (err: Error) => {
      toast({ title: "Override failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = escrowRows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.appointment_number?.toLowerCase().includes(q) ||
      r.patient_name?.toLowerCase().includes(q) ||
      r.provider_name?.toLowerCase().includes(q)
    );
  });

  function openOverrideModal(entry: EscrowEntry) {
    setSelected(entry);
    setOverrideAction("release_escrow");
    setOverrideReason("");
    setOverrideAmount("");
  }

  function handleSubmit() {
    if (!selected) return;
    if (!overrideReason.trim()) {
      toast({ title: "A reason is required for every ledger override", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  }

  function handleConfirmed() {
    if (!selected) return;
    submitOverride({
      appointmentId: selected.id,
      action: overrideAction,
      amount: overrideAmount ? parseFloat(overrideAmount) : null,
      reason: overrideReason.trim(),
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Escrow Override & Ledger Adjustments
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manually release stuck escrows or apply platform fee splits. Every action is audit-logged.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-escrow">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Pending escrow table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Pending / Stuck Escrow Appointments</CardTitle>
              <CardDescription>Appointments with unresolved payment states eligible for manual intervention.</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name or number…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm w-56"
                data-testid="input-escrow-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Unlock className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">No stuck escrows found</p>
              <p className="text-xs mt-1">{search ? "Try a different search." : "All payments are resolved."}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group"
                  onClick={() => openOverrideModal(row)}
                  data-testid={`escrow-row-${row.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">{row.appointment_number}</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          PAYMENT_STATUS_COLORS[row.payment_status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                        )}
                      >
                        {row.payment_status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {row.patient_name} → {row.provider_name} · {row.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-semibold">{fmt(parseFloat(row.total_amount || "0"))}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Override History
          </CardTitle>
          <CardDescription>Recent manual ledger adjustments made by administrators.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {overrideHistory.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No overrides recorded yet.</p>
          ) : (
            <div className="divide-y">
              {overrideHistory.slice(0, 20).map((row) => (
                <div key={row.id} className="px-4 py-3 flex items-start justify-between gap-3" data-testid={`override-history-${row.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">{row.action.replace(/_/g, " ")}</Badge>
                      {row.appointment_id && (
                        <span className="text-xs text-muted-foreground font-mono">appt:{row.appointment_id.slice(0, 8)}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{row.reason}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">by {row.admin_name}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {row.amount && parseFloat(row.amount) !== 0 && (
                      <p className="text-sm font-semibold">{fmt(parseFloat(row.amount))}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override modal */}
      <Dialog open={!!selected && !confirmOpen} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-ledger-override">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Manual Ledger Override
            </DialogTitle>
            <DialogDescription>
              Appointment{" "}
              <span className="font-mono font-semibold">{selected?.appointment_number}</span> ·{" "}
              {selected?.patient_name} → {selected?.provider_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Override action</Label>
              <Select value={overrideAction} onValueChange={setOverrideAction}>
                <SelectTrigger data-testid="select-override-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="release_escrow">Release escrow to provider</SelectItem>
                  <SelectItem value="refund_patient">Full refund to patient</SelectItem>
                  <SelectItem value="partial_refund">Partial refund to patient</SelectItem>
                  <SelectItem value="fee_split_adjust">Adjust platform fee split</SelectItem>
                  <SelectItem value="void_charge">Void charge (no money moved)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(overrideAction === "partial_refund" || overrideAction === "fee_split_adjust") && (
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Amount (USD){" "}
                  <span className="text-muted-foreground font-normal">
                    · original: {fmt(parseFloat(selected?.total_amount || "0"))}
                  </span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-sm"
                  data-testid="input-override-amount"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">
                Administrative reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Describe the reason for this manual override (saved to audit log)…"
                className="min-h-[80px] text-sm"
                data-testid="textarea-override-reason"
              />
              {!overrideReason.trim() && (
                <p className="text-xs text-muted-foreground">Required — this is saved permanently in the audit log.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!overrideReason.trim() || isPending}
              className="gap-2"
              data-testid="button-submit-override"
            >
              {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ledger override</AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible and will be recorded in the permanent audit log.
              <br /><br />
              <strong>Action:</strong> {overrideAction.replace(/_/g, " ")}
              <br />
              <strong>Reason:</strong> {overrideReason}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmed}
              disabled={isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-override"
            >
              {isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
