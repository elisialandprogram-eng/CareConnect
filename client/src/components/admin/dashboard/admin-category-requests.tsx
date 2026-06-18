import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle, XCircle, Clock, ArrowRight, AlertTriangle, RefreshCw, Layers,
} from "lucide-react";

interface CategoryRequest {
  provider_id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string | null;
  provider_category?: string | null;
  provider_subcategory?: string | null;
  pending_provider_category: string;
  pending_provider_subcategory?: string | null;
  category_change_reason?: string | null;
  category_change_requested_at?: string | null;
  status: string;
  country_code?: string;
}

export function AdminCategoryRequests() {
  const { toast } = useToast();
  const [rejectDialog, setRejectDialog] = useState<{ providerId: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: requests = [], isLoading, refetch } = useQuery<CategoryRequest[]>({
    queryKey: ["/api/admin/category-requests"],
    staleTime: 30_000,
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ providerId, decision, reason }: { providerId: string; decision: "approve" | "reject"; reason?: string }) => {
      const res = await apiRequest("POST", `/api/admin/providers/${providerId}/approve-category-change`, { decision, reason });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Failed to process decision");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/category-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      refetch();
      setRejectDialog(null);
      setRejectReason("");
      toast({ title: vars.decision === "approve" ? "Category change approved" : "Category change rejected" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const handleApprove = (providerId: string) => {
    decisionMutation.mutate({ providerId, decision: "approve" });
  };

  const handleReject = () => {
    if (!rejectDialog) return;
    decisionMutation.mutate({ providerId: rejectDialog.providerId, decision: "reject", reason: rejectReason });
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-500" />
            Category Change Requests
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review provider requests to change their professional category after approval.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1" data-testid="count-category-requests">
          {requests.length} pending
        </Badge>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle className="h-12 w-12 text-emerald-400" />
            <p className="text-base font-medium">No pending category requests</p>
            <p className="text-sm text-muted-foreground">All category change requests have been reviewed.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const name = `${req.first_name ?? ""} ${req.last_name ?? ""}`.trim();
            const initials = `${req.first_name?.[0] ?? ""}${req.last_name?.[0] ?? ""}`.toUpperCase();

            return (
              <Card key={req.provider_id} className="overflow-hidden" data-testid={`card-category-request-${req.provider_id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={req.avatar_url ?? undefined} />
                      <AvatarFallback className="text-sm font-semibold bg-indigo-100 text-indigo-700">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-sm" data-testid={`text-provider-name-${req.provider_id}`}>{name}</p>
                          <p className="text-xs text-muted-foreground">{req.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(req.category_change_requested_at)}
                          {req.country_code && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">{req.country_code}</Badge>
                          )}
                        </div>
                      </div>

                      {/* Category change summary */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Current</span>
                          <span className="font-medium text-muted-foreground">
                            {req.provider_category || "Not set"}
                            {req.provider_subcategory && (
                              <span className="text-muted-foreground/60 ml-1">· {req.provider_subcategory}</span>
                            )}
                          </span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-3" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Requested</span>
                          <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                            {req.pending_provider_category}
                            {req.pending_provider_subcategory && (
                              <span className="ml-1 font-normal text-indigo-600/70">· {req.pending_provider_subcategory}</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {req.category_change_reason && (
                        <div className="mt-2 flex items-start gap-1.5 bg-muted/40 rounded-md px-3 py-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Reason: </span>{req.category_change_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={() => setRejectDialog({ providerId: req.provider_id, name })}
                      disabled={decisionMutation.isPending}
                      data-testid={`button-reject-${req.provider_id}`}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleApprove(req.provider_id)}
                      disabled={decisionMutation.isPending}
                      data-testid={`button-approve-${req.provider_id}`}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                      Approve Change
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => { if (!o) { setRejectDialog(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Category Change</DialogTitle>
            <DialogDescription>
              Rejecting the category change request for <strong>{rejectDialog?.name}</strong>. Optionally provide a reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Optional: explain why this category change is not approved..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            data-testid="input-reject-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={decisionMutation.isPending} data-testid="button-confirm-reject">
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
