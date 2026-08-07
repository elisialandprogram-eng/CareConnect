import { formatDateTime } from "@/lib/datetime";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAdminCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function AdminWallets() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState<string>("");

  const { data: rawWallets, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/wallets"],
  });
  const wallets: any[] = Array.isArray(rawWallets)
    ? rawWallets
    : rawWallets?.wallets ?? [];

  const { data: txs } = useQuery<any[]>({
    queryKey: ["/api/admin/wallets", selectedUserId, "transactions"],
    enabled: !!selectedUserId,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const n = Number(adjustAmount);
      if (!Number.isFinite(n) || n === 0)
        throw new Error("Amount must be a non-zero number");
      if (!adjustReason.trim()) throw new Error("Reason is required");
      const res = await apiRequest(
        "POST",
        `/api/admin/wallets/${selectedUserId}/adjust`,
        { amount: n, reason: adjustReason.trim() },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t("admin_wallets.adjust_success", "Adjustment applied"),
      });
      setAdjustAmount("");
      setAdjustReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/wallets", selectedUserId, "transactions"],
      });
    },
    onError: (e: Error) => {
      toast({
        title: t("admin_wallets.adjust_failed", "Adjustment failed"),
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const { format: fmt } = useAdminCurrency();

  const filtered = wallets.filter((w: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      w.user?.email?.toLowerCase().includes(q) ||
      w.user?.firstName?.toLowerCase().includes(q) ||
      w.user?.lastName?.toLowerCase().includes(q) ||
      w.userId?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin_wallets.title", "User Wallets")}</CardTitle>
          <CardDescription>
            {t(
              "admin_wallets.desc",
              "Browse balances and inspect transactions.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder={t(
              "admin_wallets.search_placeholder",
              "Search by email or name…",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3"
            data-testid="input-admin-wallet-search"
          />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("common.loading", "Loading…")}
            </p>
          ) : !filtered.length ? (
            <p className="text-sm text-muted-foreground">
              {t("admin_wallets.empty", "No wallets yet.")}
            </p>
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <ul className="divide-y">
                {filtered.map((w: any) => (
                  <li
                    key={w.id}
                    className={`flex items-center justify-between py-2 px-2 cursor-pointer rounded hover:bg-muted ${
                      selectedUserId === w.userId ? "bg-muted" : ""
                    }`}
                    onClick={() => setSelectedUserId(w.userId)}
                    data-testid={`row-admin-wallet-${w.userId}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {w.user?.firstName || ""} {w.user?.lastName || ""}{" "}
                        <span className="text-muted-foreground">
                          {w.user?.email}
                        </span>
                      </p>
                      {w.isFrozen && (
                        <Badge variant="destructive" className="mt-1">
                          {t("admin.frozen")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmt(w.balance)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("admin_wallets.detail_title", "Wallet Detail")}
          </CardTitle>
          <CardDescription>
            {selectedUserId
              ? t(
                  "admin_wallets.detail_desc",
                  "Adjust balance and review history.",
                )
              : t("admin_wallets.select_prompt", "Select a wallet to manage.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedUserId && (
            <>
              <div className="space-y-2">
                <Label htmlFor="adj-amount">
                  {t(
                    "admin_wallets.amount_label",
                    "Amount (negative to debit)",
                  )}
                </Label>
                <Input
                  id="adj-amount"
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 5000 or -2500"
                  data-testid="input-admin-wallet-amount"
                />
                <Label htmlFor="adj-reason">
                  {t("admin_wallets.reason_label", "Reason (audit trail)")}
                </Label>
                <Input
                  id="adj-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={t(
                    "admin_wallets.reason_placeholder",
                    "Why this adjustment?",
                  )}
                  data-testid="input-admin-wallet-reason"
                />
                <Button
                  className="w-full"
                  onClick={() => adjustMutation.mutate()}
                  disabled={adjustMutation.isPending}
                  data-testid="button-admin-wallet-adjust"
                >
                  {adjustMutation.isPending
                    ? t("admin_wallets.adjusting", "Applying…")
                    : t("admin_wallets.adjust_cta", "Apply adjustment")}
                </Button>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">
                  {t("admin_wallets.history", "Transactions")}
                </h4>
                {!txs?.length ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin_wallets.no_tx", "No transactions yet.")}
                  </p>
                ) : (
                  <ScrollArea className="h-[260px] pr-3">
                    <ul className="divide-y text-sm">
                      {txs.map((tx: any) => (
                        <li key={tx.id} className="py-2">
                          <div className="flex justify-between">
                            <span>{tx.type}</span>
                            <span
                              className={
                                Number(tx.amount) >= 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }
                            >
                              {Number(tx.amount) >= 0 ? "+" : ""}
                              {fmt(tx.amount)}
                            </span>
                          </div>
                          {tx.description && (
                            <p className="text-xs text-muted-foreground">
                              {tx.description}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            {tx.createdAt
                              ? formatDateTime(tx.createdAt)
                              : ""}{" "}
                            · bal {fmt(tx.balanceAfter)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function BroadcastPanel() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [channels, setChannels] = useState<string[]>(["in_app", "email"]);

  const { data: history } = useQuery<any[]>({
    queryKey: ["/api/admin/broadcasts"],
  });

  const send = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/broadcasts", {
        title,
        message,
        audience,
        channels,
      }),
    onSuccess: (r: any) => {
      toast({
        title: "Broadcast queued",
        description: `Will be sent to ${r?.recipientCount ?? 0} users`,
      });
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
    },
    onError: (e: any) =>
      toast({
        title: "Broadcast failed",
        description: e?.message,
        variant: "destructive",
      }),
  });

  const toggle = (c: string) =>
    setChannels(
      channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c],
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.broadcast_title")}</CardTitle>
        <CardDescription>{t("admin.broadcast_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          data-testid="input-broadcast-title"
          placeholder={t("admin.broadcast_subject_placeholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          data-testid="input-broadcast-message"
          rows={4}
          placeholder={t("admin.broadcast_body_placeholder")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger
              className="w-48"
              data-testid="select-broadcast-audience"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.audience_all")}</SelectItem>
              <SelectItem value="patients">
                {t("admin.audience_patients")}
              </SelectItem>
              <SelectItem value="providers">
                {t("admin.audience_providers")}
              </SelectItem>
            </SelectContent>
          </Select>
          {(["in_app", "email", "sms", "whatsapp", "push"] as const).map(
            (c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`checkbox-channel-${c}`}
                  checked={channels.includes(c)}
                  onChange={() => toggle(c)}
                />
                {c}
              </label>
            ),
          )}
          <Button
            data-testid="button-send-broadcast"
            disabled={!title || !message || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Sending..." : "Send broadcast"}
          </Button>
        </div>
        {history && history.length > 0 && (
          <div className="pt-3 border-t mt-3">
            <p className="text-sm font-medium mb-2">
              {t("admin.recent_broadcasts")}
            </p>
            <div className="space-y-1 max-h-48 overflow-auto">
              {history.slice(0, 10).map((b) => (
                <div
                  key={b.id}
                  className="text-xs flex justify-between gap-2 border-b pb-1"
                  data-testid={`row-broadcast-${b.id}`}
                >
                  <span className="font-medium truncate">{b.title}</span>
                  <span className="text-muted-foreground shrink-0">
                    {b.audience} · {b.recipientCount ?? 0} recipients ·{" "}
                    {b.createdAt
                      ? formatDateTime(b.createdAt)
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DeliveryLogsPanel() {
  const { t } = useTranslation();
  const { data: logs } = useQuery<any[]>({
    queryKey: ["/api/admin/notification-logs"],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.notification_log")}</CardTitle>
        <CardDescription>{t("admin.notification_log_desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-xs space-y-1 max-h-80 overflow-auto">
          {logs && logs.length > 0 ? (
            logs.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-12 gap-2 border-b py-1"
                data-testid={`row-log-${l.id}`}
              >
                <span className="col-span-2 font-mono text-[10px]">
                  {l.channel}
                </span>
                <span className="col-span-3">{l.eventKey}</span>
                <span
                  className={`col-span-2 ${
                    l.status === "sent"
                      ? "text-green-600"
                      : l.status === "skipped"
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {l.status}
                </span>
                <span
                  className="col-span-3 truncate"
                  title={l.errorMessage || ""}
                >
                  {l.errorMessage || ""}
                </span>
                <span className="col-span-2 text-muted-foreground">
                  {l.createdAt ? formatDateTime(l.createdAt) : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No deliveries yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
