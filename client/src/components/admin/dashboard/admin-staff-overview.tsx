import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarMD } from "@/components/ui/provider-image";
import { Search, Loader2 } from "lucide-react";

export function AdminStaffOverview() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const { data: staff = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/practitioners"],
  });
  const { data: _providersRaw } = useQuery<any>({
    queryKey: ["/api/admin/providers"],
  });
  const providers: any[] = Array.isArray(_providersRaw) ? _providersRaw : _providersRaw?.providers ?? [];

  const filtered = useMemo(
    () =>
      (staff || []).filter((p: any) => {
        if (providerFilter !== "all" && p.providerId !== providerFilter)
          return false;
        if (
          search &&
          !(p.fullName || "").toLowerCase().includes(search.toLowerCase()) &&
          !(p.providerName || "").toLowerCase().includes(search.toLowerCase()) &&
          !(p.email || "").toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [staff, search, providerFilter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.search_staff", "Search staff...")}
            className="pl-8"
            data-testid="input-staff-search"
          />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-56" data-testid="select-staff-provider">
            <SelectValue placeholder={t("admin.all_providers", "All providers")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("admin.all_providers", "All providers")}
            </SelectItem>
            {providers.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.businessName || p.user?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.no_staff", "No staff members found.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p: any) => (
            <Card
              key={p.id}
              className="hover-elevate"
              data-testid={`card-staff-${p.id}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <AvatarMD src={p.avatarUrl} name={p.fullName} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.role || t("admin.staff", "Staff")} · {p.providerName}
                  </p>
                  {p.email && (
                    <p className="text-xs text-muted-foreground truncate">
                      {p.email}
                    </p>
                  )}
                </div>
                <Badge variant={p.isActive ? "default" : "secondary"}>
                  {p.isActive
                    ? t("admin.active", "Active")
                    : t("admin.inactive", "Inactive")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
