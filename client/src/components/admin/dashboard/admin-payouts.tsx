import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowDownToLine, Banknote, CheckCircle, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminCurrency } from "@/lib/currency";

export function AdminPayoutsPanel() {
  const { toast } = useToast();
  const { format: fmtCurrency } = useAdminCurrency();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approved" | "rejected" | "paid">("approved");
  const [adminNote, setAdminNote] = useState("");
  const [paymentRef, setPaymentRef] = useState("");

  const {
    data: requests = [],
    isLoading,
    refetch,
  } = useQuery<any[]>({
    queryKey: ["/api/admin/payout-requests", statusFilter],
    queryFn: () =>
      fetch(`/api/admin/payout-requests?status=${statusFilter}`, {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
      adminNote: note,
      paymentReference,
    }: {
      id: string;
      status: string;
      adminNote?: string;
      paymentReference?: string;
    }) =>
      apiRequest("PATCH", `/api/admin/payout-requests/${id}`, {
        status,
        adminNote: note,
        paymentReference,
      }),
    onSuccess: () => {
      toast({ title: "Payout request updated" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-requests"] });
      setActionId(null);
      setAdminNote("");
      setPaymentRef("");
    },
    onError: (e: any) =>
      toast({
        title: "Failed to update",
        description: e.message,
        variant: "destructive",
      }),
  });

  function openAction(
    id: string,
    type: "approved" | "rejected" | "paid",
  ) {
    setActionId(id);
    setActionType(type);
    setAdminNote("");
    setPaymentRef("");
  }

  function submitAction() {
    if (!actionId) return;
    updateMutation.mutate({
      id: actionId,
      status: actionType,
      adminNote: adminNote || undefined,
      paymentReference: paymentRef || undefined,
    });
  }

  function statusBadge(s: string) {
    if (s === "pending")
      return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
    if (s === "approved")
      return <Badge className="bg-blue-100 text-blue-800">Approved</Badge>;
    if (s === "paid")
      return <Badge className="bg-emerald-100 text-emerald-800">Paid</Badge>;
    if (s === "rejected")
      return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  }

  const totalAmount = requests.reduce(
    (sum: number, r: any) => sum + Number(r.amount || 0),
    0,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                Provider Payout Requests
              </CardTitle>
              <CardDescription>
                Review, approve, and process provider withdrawal requests.
              </CardDescription>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["pending", "approved", "paid", "rejected"] as const).map(
                (s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={statusFilter === s ? "default" : "outline"}
                    onClick={() => setStatusFilter(s)}
                    className="capitalize text-xs h-7 px-2"
                    data-testid={`button-payout-filter-${s}`}
                  >
                    {s}
                  </Button>
                ),
              )}
            </div>
          </div>
          {requests.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {requests.length} request{requests.length !== 1 ? "s" : ""} ·
              Total: <strong>{fmtCurrency(totalAmount)}</strong>
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Banknote className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No {statusFilter} payout requests.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r: any) => (
                <div
                  key={r.id}
                  className="rounded-lg border p-4 space-y-3 bg-card"
                  data-testid={`card-payout-${r.id}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          {fmtCurrency(r.amount)}
                        </span>
                        {statusBadge(r.status)}
                        <Badge
                          variant="outline"
                          className="capitalize text-xs"
                        >
                          {r.method?.replace("_", " ")}
                        </Badge>
                        {r.country_code && (
                          <Badge variant="secondary" className="text-xs">
                            {r.country_code}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>{r.provider_name}</strong> · {r.provider_email}
                      </p>
                      {r.bank_name && (
                        <p className="text-xs text-muted-foreground">
                          Bank: {r.bank_name}
                          {r.account_holder ? ` · ${r.account_holder}` : ""}
                        </p>
                      )}
                      {r.notes && (
                        <p className="text-xs text-muted-foreground italic">
                          "{r.notes}"
                        </p>
                      )}
                      {r.admin_note && (
                        <p className="text-xs bg-amber-50 border border-amber-100 text-amber-800 rounded px-2 py-1 mt-1">
                          {r.admin_note}
                        </p>
                      )}
                      {r.payment_reference && (
                        <p className="text-xs text-emerald-700 mt-1">
                          Ref: {r.payment_reference}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Requested {new Date(r.created_at).toLocaleDateString()}
                        {r.reviewed_by_name
                          ? ` · Reviewed by ${r.reviewed_by_name}`
                          : ""}
                        {r.paid_at
                          ? ` · Paid ${new Date(r.paid_at).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {r.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs text-blue-700 border-blue-200"
                            onClick={() => openAction(r.id, "approved")}
                            data-testid={`button-approve-payout-${r.id}`}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />{" "}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs text-red-600 border-red-200"
                            onClick={() => openAction(r.id, "rejected")}
                            data-testid={`button-reject-payout-${r.id}`}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => openAction(r.id, "paid")}
                          data-testid={`button-mark-paid-payout-${r.id}`}
                        >
                          <Banknote className="h-3.5 w-3.5 mr-1" /> Mark Paid
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!actionId}
        onOpenChange={(o) => {
          if (!o) setActionId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approved"
                ? "Approve Payout Request"
                : actionType === "rejected"
                ? "Reject Payout Request"
                : "Mark Payout as Paid"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "paid"
                ? "Enter the payment reference so the provider can track it."
                : actionType === "rejected"
                ? "Optionally add a note explaining why this request was rejected."
                : "Approve this payout request. The provider will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {actionType === "paid" && (
              <div className="space-y-1.5">
                <Label htmlFor="payout-ref">
                  Payment Reference (optional)
                </Label>
                <Input
                  id="payout-ref"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. TXN-20240601-001"
                  data-testid="input-payout-reference"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="payout-note">
                Admin Note{" "}
                {actionType === "rejected" ? "(recommended)" : "(optional)"}
              </Label>
              <Textarea
                id="payout-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder={
                  actionType === "rejected"
                    ? "Reason for rejection…"
                    : "Internal note…"
                }
                rows={2}
                data-testid="input-payout-admin-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionId(null)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAction}
              disabled={updateMutation.isPending}
              className={
                actionType === "rejected"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : actionType === "paid"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : ""
              }
              data-testid="button-confirm-payout-action"
            >
              {updateMutation.isPending
                ? "Processing…"
                : actionType === "approved"
                ? "Approve"
                : actionType === "rejected"
                ? "Reject"
                : "Mark as Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
