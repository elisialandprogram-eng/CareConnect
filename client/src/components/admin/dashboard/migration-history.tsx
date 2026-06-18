import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, Loader2 } from "lucide-react";

type CountryMigrationRow = {
  id: string;
  createdAt: string | null;
  targetUserId: string | null;
  targetUserEmail: string | null;
  targetUserName: string | null;
  fromCountry: string | null;
  toCountry: string | null;
  counts: Record<string, number> | null;
  reason: string | null;
  performedById: string | null;
  performedByEmail: string | null;
  performedByName: string | null;
};

const COUNT_LABELS: Record<string, string> = {
  users: "Users",
  providers: "Provider profiles",
  services: "Services",
  serviceRequests: "Service requests",
  appointmentsAsPatient: "Appts (as patient)",
  appointmentsAsProvider: "Appts (as provider)",
  invoices: "Invoices",
  payments: "Payments",
};

export function MigrationHistory() {
  const { t } = useTranslation();
  const [country, setCountry] = useState<"all" | "HU" | "IR">("all");
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery<CountryMigrationRow[]>({
    queryKey: ["/api/admin/country-migrations"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const filtered = (rows || []).filter((r) => {
    if (
      country !== "all" &&
      r.toCountry !== country &&
      r.fromCountry !== country
    )
      return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        r.targetUserEmail,
        r.targetUserName,
        r.performedByEmail,
        r.performedByName,
        r.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalRowsTouched = (counts: Record<string, number> | null) =>
    counts
      ? Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0)
      : 0;

  return (
    <Card data-testid="card-migration-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {t("admin.migration_history_title", "Country migration history")}
        </CardTitle>
        <CardDescription>
          {t(
            "admin.migration_history_desc",
            "Every cross-country user migration performed by a global admin, with the operator, the reason, and the row counts touched.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">
              {t("admin.migration_filter_country", "Country")}
            </Label>
            <Select
              value={country}
              onValueChange={(v) => setCountry(v as any)}
            >
              <SelectTrigger
                className="w-32 h-8"
                data-testid="select-migration-country"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all", "All")}</SelectItem>
                <SelectItem value="HU">HU</SelectItem>
                <SelectItem value="IR">IR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "admin.migration_search_ph",
                "Search by user, operator, or reason…",
              )}
              className="h-8"
              data-testid="input-migration-search"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {filtered.length}/{rows?.length || 0}
          </div>
        </div>

        <ScrollArea className="h-[600px]">
          {filtered.length === 0 ? (
            <div
              className="p-8 text-center text-muted-foreground"
              data-testid="text-migration-empty"
            >
              {t(
                "admin.migration_history_empty",
                "No migrations recorded yet.",
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((r) => {
                const total = totalRowsTouched(r.counts);
                return (
                  <div
                    key={r.id}
                    className="py-4 space-y-2"
                    data-testid={`row-migration-${r.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {r.fromCountry || "?"}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge className="font-mono">{r.toCountry || "?"}</Badge>
                      <span
                        className="text-sm font-medium"
                        data-testid={`text-migration-target-${r.id}`}
                      >
                        {r.targetUserName || "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.targetUserEmail || ""}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {r.createdAt
                          ? new Date(r.createdAt).toLocaleString()
                          : "—"}
                      </span>
                    </div>

                    {r.reason && (
                      <div className="text-sm bg-muted/40 border rounded p-2">
                        <span className="text-muted-foreground text-xs">
                          {t("admin.migration_reason_label", "Reason")}:{" "}
                        </span>
                        <span data-testid={`text-migration-reason-${r.id}`}>
                          {r.reason}
                        </span>
                      </div>
                    )}

                    {r.counts && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge
                          variant="secondary"
                          data-testid={`text-migration-total-${r.id}`}
                        >
                          {t("admin.migration_total_rows", "Total rows touched")}:{" "}
                          <span className="font-mono ml-1">{total}</span>
                        </Badge>
                        {Object.entries(r.counts).map(([k, v]) =>
                          Number(v) > 0 ? (
                            <Badge key={k} variant="outline">
                              {COUNT_LABELS[k] || k}:{" "}
                              <span className="font-mono ml-1">{v}</span>
                            </Badge>
                          ) : null,
                        )}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      {t("admin.migration_performed_by", "By")}:{" "}
                      <span className="font-medium">
                        {r.performedByName ||
                          r.performedByEmail ||
                          r.performedById?.slice(0, 8) ||
                          "—"}
                      </span>
                      {r.performedByEmail && r.performedByName ? (
                        <>
                          {" "}
                          &middot; {r.performedByEmail}
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
