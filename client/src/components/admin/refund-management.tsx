import { formatDate } from "@/lib/datetime";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminCurrency, formatInCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, CheckCircle, XCircle, RotateCcw, DollarSign, Search,
  AlertCircle, Clock, ChevronLeft, ChevronRight, Settings2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RefundRow {
  id: string;
  appointment_number: string | null;
  date: string;
  start_time: string;
  total_amount: string;
  refund_amount: string;
  refund_status: string | null;
  refund_notes: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  appt_status: string;
  country_code: string;
  display_currency: string | null;
  payment_status: string | null;
  visit_type: string | null;
  patient_id: string;
  patient_first: string | null;
  patient_last: string | null;
  patient_email: string | null;
  provider_name: string | null;
  service_name: string | null;
}

interface RefundRule {
  id: string;
  scenario: string;
  country_code: string;
  full_refund_hours: number;
  partial_refund_hours: number;
  partial_refund_percent: number;
  is_active: boolean;
  description: string | null;
}

// ─── Refund status badge ──────────────────────────────────────────────────────

function RefundStatusBadge({ status }: { status: string | null }) {
  if (status === "processed")
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Processed</Badge>;
  if (status === "pending")
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Pending</Badge>;
  if (status === "none")
    return <Badge className="bg-muted text-muted-foreground border-border text-xs">None</Badge>;
  return <Badge variant="secondary" className="text-xs">{status ?? "—"}</Badge>;
}

// ─── Process Refund Dialog ────────────────────────────────────────────────────

function ProcessRefundDialog({
  refund,
  open,
  onOpenChange,
}: {
  refund: RefundRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { format: fmtMoney } = useAdminCurrency();
  const [action, setAction] = useState<"approve" | "reject" | "partial" | "manual">("approve");
  const [amount, setAmount] = useState(refund.refund_amount || "0");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/refunds/${refund.id}/process`, {
        action,
        amount: Number(amount),
        note: note.trim() || undefined,
      }).then(r => r.json()),
    onSuccess: (data) => {
      toast({
        title: action === "reject" ? "Refund declined" : "Refund processed",
        description: action === "reject" ? "No funds were moved." : `${fmtMoney(data.refundAmt)} issued to client wallet.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/refunds"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const totalPaid = Number(refund.total_amount || 0);
  const suggestedRefund = Number(refund.refund_amount || 0);
  const patientName = [refund.patient_first, refund.patient_last].filter(Boolean).join(" ") || refund.patient_email || "Unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid={`dialog-process-refund-${refund.id}`}>
        <DialogHeader>
          <DialogTitle>Process refund</DialogTitle>
          <DialogDescription>
            Appointment {refund.appointment_number ?? "#" + refund.id.slice(0, 8)} · {patientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 text-sm rounded-lg bg-muted/50 p-3">
            <span className="text-muted-foreground">Paid</span>
            <span className="font-medium text-right">{fmtMoney(totalPaid)}</span>
            <span className="text-muted-foreground">Policy refund</span>
            <span className="font-medium text-right">{fmtMoney(suggestedRefund)}</span>
            <span className="text-muted-foreground">Cancelled by</span>
            <span className="font-medium text-right capitalize">{refund.cancelled_by ?? "—"}</span>
          </div>

          {/* Action picker */}
          <div className="space-y-2">
            <Label>Action</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["approve", "partial", "manual", "reject"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => { setAction(a); if (a === "approve") setAmount(String(suggestedRefund)); }}
                  data-testid={`refund-action-${a}`}
                  className={`text-sm py-2 px-3 rounded-lg border-2 transition-all capitalize ${action === a ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/40"}`}
                >
                  {a === "approve" && "✓ Approve"}
                  {a === "partial" && "½ Partial"}
                  {a === "manual" && "✎ Manual"}
                  {a === "reject" && "✕ Reject"}
                </button>
              ))}
            </div>
          </div>

          {/* Amount override (partial / manual) */}
          {(action === "partial" || action === "manual") && (
            <div className="space-y-1.5">
              <Label>Refund amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  max={totalPaid}
                  step={0.01}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="pl-9"
                  data-testid="input-refund-amount-override"
                />
              </div>
              <p className="text-xs text-muted-foreground">Maximum: {fmtMoney(totalPaid)}</p>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Admin note <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              rows={2}
              placeholder="Reason or internal note..."
              value={note}
              onChange={e => setNote(e.target.value)}
              data-testid="textarea-refund-note"
            />
          </div>

          {action === "reject" && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>No funds will be moved. The client will be notified.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={mut.isPending}
            variant={action === "reject" ? "destructive" : "default"}
            onClick={() => mut.mutate()}
            data-testid="button-confirm-refund-process"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {action === "approve" && "Approve & send to wallet"}
            {action === "partial" && "Send partial refund"}
            {action === "manual" && "Send manual refund"}
            {action === "reject" && "Decline refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Refund Management Panel ──────────────────────────────────────────────────

export function RefundManagementPanel() {
  const { format: fmtMoney } = useAdminCurrency();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [countryFilter, setCountryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RefundRow | null>(null);

  const { data, isLoading } = useQuery<{ refunds: RefundRow[]; total: number }>({
    queryKey: ["/api/admin/refunds", statusFilter, countryFilter, search, page],
    queryFn: () => {
      const p = new URLSearchParams({ status: statusFilter, page: String(page) });
      if (countryFilter !== "all") p.set("country", countryFilter);
      if (search.trim()) p.set("q", search.trim());
      return fetch(`/api/admin/refunds?${p}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const refunds = data?.refunds ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const STATUS_OPTS = ["pending", "processed", "none", "all"];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <RotateCcw className="h-5 w-5 text-primary" />
            Refund operations center
          </CardTitle>
          <CardDescription>Review, approve, reject, or manually adjust refunds for cancelled appointments.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Status filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  data-testid={`filter-refund-${s}`}
                  className={`px-3 py-1 rounded-full text-xs font-medium border capitalize transition-all ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Country filter */}
            <Select value={countryFilter} onValueChange={v => { setCountryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-refund-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                <SelectItem value="HU">Hungary</SelectItem>
                <SelectItem value="IR">Iran</SelectItem>
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search appointment, client, provider..."
                className="pl-9 h-8 text-xs"
                data-testid="input-refund-search"
              />
            </div>

            <span className="text-xs text-muted-foreground ml-auto">{total} result{total !== 1 ? "s" : ""}</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : refunds.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No refunds match this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Appt #</th>
                    <th className="text-left px-4 py-3">Client</th>
                    <th className="text-left px-4 py-3">Provider</th>
                    <th className="text-left px-4 py-3">Service</th>
                    <th className="text-right px-4 py-3">Paid</th>
                    <th className="text-right px-4 py-3">Refund</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">By</th>
                    <th className="text-center px-4 py-3">Country</th>
                    <th className="text-center px-4 py-3">Date</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {refunds.map(r => {
                    const patientName = [r.patient_first, r.patient_last].filter(Boolean).join(" ") || r.patient_email || "—";
                    const cancelDate = r.cancelled_at ? formatDate(r.cancelled_at, { month: "short", day: "numeric" }) : "—";
                    return (
                      <tr key={r.id} className="hover:bg-muted/20" data-testid={`row-refund-${r.id}`}>
                        <td className="px-4 py-3 font-mono text-xs">{r.appointment_number ?? r.id.slice(0, 8)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-[140px]" title={patientName}>{patientName}</div>
                          <div className="text-xs text-muted-foreground">{r.patient_email}</div>
                        </td>
                        <td className="px-4 py-3 text-xs truncate max-w-[120px]">{r.provider_name ?? "—"}</td>
                        <td className="px-4 py-3 text-xs truncate max-w-[120px]">{r.service_name ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatInCurrency(Number(r.total_amount), r.display_currency ?? (r.country_code === "IR" ? "IRR" : "HUF"))}</td>
                        <td className="px-4 py-3 text-right font-mono">{r.refund_amount && Number(r.refund_amount) > 0 ? formatInCurrency(Number(r.refund_amount), r.display_currency ?? (r.country_code === "IR" ? "IRR" : "HUF")) : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <RefundStatusBadge status={r.refund_status} />
                        </td>
                        <td className="px-4 py-3 text-center text-xs capitalize">{r.cancelled_by ?? "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="outline" className="text-xs">{r.country_code}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-muted-foreground">{cancelDate}</td>
                        <td className="px-4 py-3">
                          {r.refund_status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs rounded-lg"
                              onClick={() => setSelected(r)}
                              data-testid={`button-process-refund-${r.id}`}
                            >
                              Review
                            </Button>
                          )}
                          {r.refund_status === "processed" && (
                            <span className="text-xs text-emerald-600 flex items-center gap-1">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Done
                            </span>
                          )}
                          {r.refund_notes && (
                            <p className="text-xs text-muted-foreground italic mt-0.5 max-w-[120px] truncate" title={r.refund_notes}>{r.refund_notes}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-4 border-t">
              <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
              <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Process dialog */}
      {selected && (
        <ProcessRefundDialog
          refund={selected}
          open={!!selected}
          onOpenChange={v => { if (!v) setSelected(null); }}
        />
      )}
    </div>
  );
}

// ─── Refund Rules Panel ───────────────────────────────────────────────────────

function RuleRow({ rule, onSave }: { rule: RefundRule; onSave: (id: string, patch: Partial<RefundRule>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...rule });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(rule.id, {
        full_refund_hours: Number(draft.full_refund_hours),
        partial_refund_hours: Number(draft.partial_refund_hours),
        partial_refund_percent: Number(draft.partial_refund_percent),
        is_active: draft.is_active,
        description: draft.description,
      } as any);
      setEditing(false);
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const scenarioLabel = {
    patient_cancel: "Client cancel",
    provider_cancel: "Provider cancel",
    no_show: "No-show",
    late_cancel: "Late cancel",
    service_failure: "Service failure",
  }[rule.scenario] ?? rule.scenario;

  return (
    <tr className={`border-b text-sm ${!rule.is_active ? "opacity-50" : ""}`} data-testid={`row-rule-${rule.id}`}>
      <td className="px-4 py-3 font-medium">{scenarioLabel}</td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-xs">{rule.country_code}</Badge>
      </td>
      {editing ? (
        <>
          <td className="px-4 py-3">
            <Input type="number" className="h-7 w-20 text-xs" value={draft.full_refund_hours} onChange={e => setDraft(d => ({ ...d, full_refund_hours: Number(e.target.value) }))} data-testid={`input-rule-full-${rule.id}`} />
          </td>
          <td className="px-4 py-3">
            <Input type="number" className="h-7 w-20 text-xs" value={draft.partial_refund_hours} onChange={e => setDraft(d => ({ ...d, partial_refund_hours: Number(e.target.value) }))} />
          </td>
          <td className="px-4 py-3">
            <Input type="number" min={0} max={100} className="h-7 w-20 text-xs" value={draft.partial_refund_percent} onChange={e => setDraft(d => ({ ...d, partial_refund_percent: Number(e.target.value) }))} />
          </td>
          <td className="px-4 py-3">
            <Switch checked={draft.is_active} onCheckedChange={v => setDraft(d => ({ ...d, is_active: v }))} className="scale-75" />
          </td>
          <td className="px-4 py-3">
            <Input className="h-7 text-xs w-40" value={draft.description ?? ""} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
          </td>
          <td className="px-4 py-3 flex gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDraft({ ...rule }); setEditing(false); }}>Cancel</Button>
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-3">{rule.full_refund_hours}h</td>
          <td className="px-4 py-3">{rule.partial_refund_hours}h</td>
          <td className="px-4 py-3">{rule.partial_refund_percent}%</td>
          <td className="px-4 py-3">
            {rule.is_active ? <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge> : <Badge variant="secondary" className="text-xs">Off</Badge>}
          </td>
          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{rule.description ?? "—"}</td>
          <td className="px-4 py-3">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)} data-testid={`button-edit-rule-${rule.id}`}>Edit</Button>
          </td>
        </>
      )}
    </tr>
  );
}

export function RefundRulesPanel() {
  const { toast } = useToast();
  const { data: rules = [], isLoading } = useQuery<RefundRule[]>({
    queryKey: ["/api/admin/refund-rules"],
  });

  const saveMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RefundRule> }) =>
      apiRequest("PUT", `/api/admin/refund-rules/${id}`, patch).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/refund-rules"] });
      toast({ title: "Rule saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings2 className="h-5 w-5 text-primary" />
          Refund policy rules
        </CardTitle>
        <CardDescription>
          Configurable time-based refund thresholds per scenario and country. These rules drive the auto-quote shown to clients and admins at cancellation time.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Scenario</th>
                  <th className="text-left px-4 py-3">Country</th>
                  <th className="text-left px-4 py-3">Full refund if &gt;</th>
                  <th className="text-left px-4 py-3">Partial refund if &gt;</th>
                  <th className="text-left px-4 py-3">Partial %</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onSave={(id, patch) => saveMut.mutateAsync({ id, patch })}
                  />
                ))}
                {rules.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No rules found. They will be seeded on next server restart.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
