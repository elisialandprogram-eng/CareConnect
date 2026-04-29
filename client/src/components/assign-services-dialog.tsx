import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";

interface Category { id: string; name: string; slug: string; isActive?: boolean | null }
interface CatalogService { id: string; categoryId?: string | null; name: string; isActive?: boolean | null }
interface SubServiceRow {
  id: string;
  name: string;
  category: string;
  catalogServiceId?: string | null;
  basePrice?: string | null;
  durationMinutes?: number | null;
  isActive?: boolean | null;
}
interface ServiceRow { id: string; subServiceId?: string | null }

interface Props {
  providerId: string;
  trigger: React.ReactNode;
  onAssigned?: () => void;
}

export function AssignServicesDialog({ providerId, trigger, onAssigned }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: open,
  });
  const { data: catalogServices = [] } = useQuery<CatalogService[]>({
    queryKey: ["/api/catalog-services"],
    enabled: open,
  });
  const { data: subServices = [] } = useQuery<SubServiceRow[]>({
    queryKey: ["/api/sub-services"],
    enabled: open,
  });
  const { data: providerServices = [] } = useQuery<ServiceRow[]>({
    queryKey: [`/api/admin/providers/${providerId}/services`],
    enabled: open,
  });

  const alreadyAssigned = useMemo(() => {
    return new Set(providerServices.map((s) => s.subServiceId).filter(Boolean) as string[]);
  }, [providerServices]);

  // Group: category(slug) -> catalogService(id|null) -> subService[]
  const tree = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byCatSlug = new Map<string, Map<string | null, SubServiceRow[]>>();
    for (const sub of subServices) {
      if (sub.isActive === false) continue;
      if (term && !sub.name.toLowerCase().includes(term)) continue;
      const inner = byCatSlug.get(sub.category) ?? new Map<string | null, SubServiceRow[]>();
      const groupKey = sub.catalogServiceId ?? null;
      const arr = inner.get(groupKey) ?? [];
      arr.push(sub);
      inner.set(groupKey, arr);
      byCatSlug.set(sub.category, inner);
    }
    const catNameBySlug = new Map(categories.map((c) => [c.slug, c.name]));
    const groupNameById = new Map(catalogServices.map((cs) => [cs.id, cs.name]));
    const out: { categorySlug: string; categoryName: string; groups: { id: string; name: string; subs: SubServiceRow[] }[] }[] = [];
    for (const [slug, inner] of byCatSlug.entries()) {
      const groups: { id: string; name: string; subs: SubServiceRow[] }[] = [];
      for (const [groupId, subs] of inner.entries()) {
        groups.push({
          id: groupId ?? `__none__:${slug}`,
          name: groupId ? (groupNameById.get(groupId) ?? t("admin.uncategorized", "Uncategorized")) : t("admin.uncategorized", "Uncategorized"),
          subs: subs.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
      groups.sort((a, b) => a.name.localeCompare(b.name));
      out.push({
        categorySlug: slug,
        categoryName: catNameBySlug.get(slug) ?? slug,
        groups,
      });
    }
    out.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    return out;
  }, [subServices, categories, catalogServices, search, t]);

  const toggleSub = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectAllInGroup = (subs: SubServiceRow[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of subs) {
        if (alreadyAssigned.has(s.id)) continue;
        if (checked) next.add(s.id);
        else next.delete(s.id);
      }
      return next;
    });
  };

  const assignMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", `/api/admin/providers/${providerId}/assign-services`, {
        subServiceIds: ids,
      });
      return res.json();
    },
    onSuccess: (data: { assignedCount: number; skippedCount: number }) => {
      toast({
        title: t("admin.services_assigned", "Services assigned"),
        description: t("admin.services_assigned_desc", "{{a}} added, {{s}} skipped", {
          a: data.assignedCount,
          s: data.skippedCount,
        }),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/providers/${providerId}/services`] });
      onAssigned?.();
      setSelected(new Set());
      setOpen(false);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: t("admin.assign_failed", "Assignment failed"), description: e?.message });
    },
  });

  const totalSelected = selected.size;
  const totalAvailable = subServices.filter((s) => !alreadyAssigned.has(s.id) && s.isActive !== false).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{t("admin.assign_services_title", "Assign services from catalog")}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.search_services", "Search services…")}
              className="pl-9"
              data-testid="input-assign-search"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2" data-testid="text-assign-summary">
            {t("admin.assign_summary", "{{n}} selected · {{m}} available", {
              n: totalSelected,
              m: totalAvailable,
            })}
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6" data-testid="scroll-assign-tree">
          {tree.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-10" data-testid="empty-assign-tree">
              {t("admin.no_catalog_services", "No services in the catalog match your search.")}
            </div>
          )}
          <div className="space-y-3 pb-4">
            {tree.map((cat) => {
              const catKey = `cat:${cat.categorySlug}`;
              const catExpanded = expanded.has(catKey) || search.trim().length > 0;
              const allSubs = cat.groups.flatMap((g) => g.subs);
              const assignableInCat = allSubs.filter((s) => !alreadyAssigned.has(s.id));
              const allSelected = assignableInCat.length > 0 && assignableInCat.every((s) => selected.has(s.id));
              return (
                <div key={catKey} className="border rounded-lg" data-testid={`assign-category-${cat.categorySlug}`}>
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-t-lg">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-semibold flex-1 text-left"
                      onClick={() => toggleGroup(catKey)}
                      data-testid={`button-toggle-category-${cat.categorySlug}`}
                    >
                      {catExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {cat.categoryName}
                      <Badge variant="outline" className="ml-1">{allSubs.length}</Badge>
                    </button>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(c) => selectAllInGroup(allSubs, !!c)}
                      disabled={assignableInCat.length === 0}
                      data-testid={`checkbox-select-all-${cat.categorySlug}`}
                    />
                  </div>
                  {catExpanded && (
                    <div className="p-2 space-y-2">
                      {cat.groups.map((g) => (
                        <div key={g.id} className="pl-2">
                          <div className="text-xs font-medium text-muted-foreground py-1">{g.name}</div>
                          <ul className="space-y-1">
                            {g.subs.map((sub) => {
                              const isAssigned = alreadyAssigned.has(sub.id);
                              const checked = selected.has(sub.id);
                              return (
                                <li
                                  key={sub.id}
                                  className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/40"
                                  data-testid={`row-subservice-${sub.id}`}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleSub(sub.id)}
                                    disabled={isAssigned}
                                    data-testid={`checkbox-subservice-${sub.id}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm truncate">{sub.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {sub.basePrice ? `$${sub.basePrice}` : "—"}
                                      {sub.durationMinutes ? ` · ${sub.durationMinutes}m` : ""}
                                    </div>
                                  </div>
                                  {isAssigned && (
                                    <Badge variant="secondary" data-testid={`badge-assigned-${sub.id}`}>
                                      {t("admin.already_assigned", "Assigned")}
                                    </Badge>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter className="p-6 pt-3 border-t">
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-assign-cancel">
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            disabled={selected.size === 0 || assignMutation.isPending}
            onClick={() => assignMutation.mutate(Array.from(selected))}
            data-testid="button-assign-submit"
          >
            {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("admin.assign_selected", "Assign {{n}} selected", { n: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
