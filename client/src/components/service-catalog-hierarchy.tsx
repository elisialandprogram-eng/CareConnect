import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  FolderOpen,
  Folder,
  Tag,
  DollarSign,
  Clock,
  Percent,
  ListTree,
  RotateCcw,
  Archive,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  deletedAt?: string | null;
}

interface SubService {
  id: string;
  category: string;
  name: string;
  description?: string | null;
  basePrice?: string;
  platformFee?: string;
  durationMinutes?: number;
  taxPercentage?: string;
  pricingType?: string;
  isActive?: boolean;
  deletedAt?: string | null;
}

const EMPTY_SUB = {
  name: "",
  basePrice: "0.00",
  platformFee: "0.00",
  durationMinutes: 30,
  taxPercentage: "0.00",
  pricingType: "fixed" as const,
};

const EMPTY_CAT = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  sortOrder: 0,
};

/* ------------------------------------------------------------------ */
/*  Inline sub-service form (used for both add and edit)               */
/* ------------------------------------------------------------------ */
function SubServiceForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  testPrefix,
}: {
  initial: typeof EMPTY_SUB;
  onSave: (d: typeof EMPTY_SUB) => void;
  onCancel: () => void;
  isSaving: boolean;
  testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  return (
    <div className="bg-muted/40 rounded-lg border border-dashed border-primary/30 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="lg:col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Name</label>
          <Input
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            placeholder="e.g. Manual Therapy"
            data-testid={`${testPrefix}-name`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Base price</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={d.basePrice}
            onChange={(e) => setD({ ...d, basePrice: e.target.value })}
            data-testid={`${testPrefix}-base`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Platform fee</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={d.platformFee}
            onChange={(e) => setD({ ...d, platformFee: e.target.value })}
            data-testid={`${testPrefix}-fee`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Duration (min)</label>
          <Input
            type="number"
            min="5"
            value={d.durationMinutes}
            onChange={(e) => setD({ ...d, durationMinutes: parseInt(e.target.value) || 0 })}
            data-testid={`${testPrefix}-dur`}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Tax %</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={d.taxPercentage}
            onChange={(e) => setD({ ...d, taxPercentage: e.target.value })}
            data-testid={`${testPrefix}-tax`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Pricing type</label>
          <Select value={d.pricingType} onValueChange={(v) => setD({ ...d, pricingType: v })}>
            <SelectTrigger data-testid={`${testPrefix}-type`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="session">Per Session</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} data-testid={`${testPrefix}-cancel`}>
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
        <Button
          size="sm"
          disabled={!d.name.trim() || isSaving}
          onClick={() => onSave(d)}
          data-testid={`${testPrefix}-save`}
        >
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category inline edit form                                          */
/* ------------------------------------------------------------------ */
function CategoryForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  testPrefix,
}: {
  initial: typeof EMPTY_CAT;
  onSave: (d: typeof EMPTY_CAT) => void;
  onCancel: () => void;
  isSaving: boolean;
  testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  const autoSlug = (name: string) =>
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    <div className="bg-primary/5 rounded-lg border border-dashed border-primary/40 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Category name</label>
          <Input
            value={d.name}
            onChange={(e) => {
              const name = e.target.value;
              setD({ ...d, name, slug: d.slug || autoSlug(name) });
            }}
            placeholder="e.g. Cardiology"
            data-testid={`${testPrefix}-name`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Slug</label>
          <Input
            value={d.slug}
            onChange={(e) => setD({ ...d, slug: e.target.value })}
            placeholder="auto-generated"
            data-testid={`${testPrefix}-slug`}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Description (optional)</label>
          <Input
            value={d.description}
            onChange={(e) => setD({ ...d, description: e.target.value })}
            placeholder="Brief description"
            data-testid={`${testPrefix}-desc`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Icon (emoji or name)</label>
          <Input
            value={d.icon}
            onChange={(e) => setD({ ...d, icon: e.target.value })}
            placeholder="🩺"
            data-testid={`${testPrefix}-icon`}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} data-testid={`${testPrefix}-cancel`}>
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
        <Button
          size="sm"
          disabled={!d.name.trim() || !d.slug.trim() || isSaving}
          onClick={() => onSave(d)}
          data-testid={`${testPrefix}-save`}
        >
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          Save category
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export function ServiceCatalogHierarchy() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();

  /* ── Expansion state ── */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  /* ── Inline-form state ── */
  const [addingCat, setAddingCat] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [deletingCat, setDeletingCat] = useState<Category | null>(null);

  const [addingSubFor, setAddingSubFor] = useState<string | null>(null); // catSlug
  const [editingSub, setEditingSub] = useState<SubService | null>(null);
  const [deletingSub, setDeletingSub] = useState<SubService | null>(null);

  /* ── Queries ── */
  const {
    data: categories = [],
    isLoading: loadCats,
    refetch: refetchCats,
  } = useQuery<Category[]>({ queryKey: ["/api/admin/categories"] });

  const {
    data: subs = [],
    isLoading: loadSubs,
    refetch: refetchSubs,
  } = useQuery<SubService[]>({ queryKey: ["/api/admin/sub-services"] });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sub-services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sub-services"] });
  };

  /* ── Category mutations ── */
  const createCat = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/categories", data),
    onSuccess: () => {
      toast({ title: "Category created" });
      setAddingCat(false);
      refetchCats();
      invalidate();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
  });

  const updateCat = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/admin/categories/${id}`, data),
    onSuccess: () => {
      toast({ title: "Category updated" });
      setEditingCat(null);
      refetchCats();
      invalidate();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
  });

  const deleteCat = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/categories/${id}`),
    onSuccess: () => {
      toast({ title: "Category removed" });
      setDeletingCat(null);
      refetchCats();
      invalidate();
    },
  });

  const toggleCatActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/categories/${id}`, { isActive }),
    onSuccess: () => { refetchCats(); invalidate(); },
  });

  /* ── Sub-service mutations ── */
  const createSub = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/sub-services", data),
    onSuccess: () => {
      toast({ title: "Sub-service created" });
      setAddingSubFor(null);
      refetchSubs();
      invalidate();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
  });

  const updateSub = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/admin/sub-services/${id}`, data),
    onSuccess: () => {
      toast({ title: "Sub-service saved" });
      setEditingSub(null);
      refetchSubs();
      invalidate();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
  });

  const deleteSub = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/sub-services/${id}`),
    onSuccess: () => {
      toast({ title: "Sub-service removed" });
      setDeletingSub(null);
      refetchSubs();
      invalidate();
    },
  });

  const toggleSubActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/sub-services/${id}`, { isActive }),
    onSuccess: () => { refetchSubs(); invalidate(); },
  });

  const restoreSub = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sub-services/${id}/restore`),
    onSuccess: () => { refetchSubs(); invalidate(); },
  });

  /* ── Group subs by category slug ── */
  const subsBySlug = useMemo(() => {
    const map: Record<string, SubService[]> = {};
    for (const s of subs) {
      (map[s.category] ||= []).push(s);
    }
    return map;
  }, [subs]);

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [categories]
  );

  if (loadCats || loadSubs) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ListTree className="h-5 w-5 text-primary" />
            Service Catalog
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage the global Category → Sub-service hierarchy and default pricing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{categories.length} categories</Badge>
          <Badge variant="secondary">{subs.filter(s => !s.deletedAt).length} sub-services</Badge>
          <Button
            size="sm"
            onClick={() => { setAddingCat(true); setEditingCat(null); }}
            disabled={addingCat}
            data-testid="button-add-category"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      {/* ── New category inline form ── */}
      {addingCat && (
        <CategoryForm
          initial={EMPTY_CAT}
          onSave={(d) => createCat.mutate(d)}
          onCancel={() => setAddingCat(false)}
          isSaving={createCat.isPending}
          testPrefix="new-cat"
        />
      )}

      {/* ── Tree ── */}
      {sortedCats.length === 0 && !addingCat ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
          <ListTree className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No categories yet</p>
          <p className="text-sm">Click "Add Category" to get started.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="catalog-tree">
          {sortedCats.map((cat) => {
            const isOpen = !!expanded[cat.id];
            const catSubs = (subsBySlug[cat.slug] || []).filter(s => !s.deletedAt);
            const archivedSubs = (subsBySlug[cat.slug] || []).filter(s => !!s.deletedAt);
            const isEditing = editingCat?.id === cat.id;

            return (
              <div
                key={cat.id}
                className={`rounded-xl border overflow-hidden transition-all ${cat.deletedAt ? "opacity-50 bg-muted/20" : "bg-card"}`}
                data-testid={`cat-row-${cat.id}`}
              >
                {/* Category row */}
                {isEditing ? (
                  <div className="p-3">
                    <CategoryForm
                      initial={{ name: cat.name, slug: cat.slug, description: cat.description || "", icon: cat.icon || "", sortOrder: cat.sortOrder ?? 0 }}
                      onSave={(d) => updateCat.mutate({ id: cat.id, data: d })}
                      onCancel={() => setEditingCat(null)}
                      isSaving={updateCat.isPending}
                      testPrefix={`edit-cat-${cat.id}`}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors">
                    {/* Expand toggle */}
                    <button
                      type="button"
                      onClick={() => toggle(cat.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      data-testid={`button-toggle-cat-${cat.id}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      {isOpen ? (
                        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {cat.icon && <span className="text-base">{cat.icon}</span>}
                        <span className="font-semibold text-sm">{cat.name}</span>
                        <span className="text-xs text-muted-foreground font-mono hidden sm:inline">/{cat.slug}</span>
                        {cat.deletedAt && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Archived</Badge>}
                        {!cat.isActive && !cat.deletedAt && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {catSubs.length} sub-service{catSubs.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </button>

                    {/* Controls */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={!!cat.isActive && !cat.deletedAt}
                        disabled={!!cat.deletedAt}
                        onCheckedChange={(v) => toggleCatActive.mutate({ id: cat.id, isActive: v })}
                        data-testid={`switch-cat-${cat.id}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { setEditingCat(cat); setExpanded(s => ({ ...s, [cat.id]: true })); }}
                        data-testid={`button-edit-cat-${cat.id}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeletingCat(cat)}
                        data-testid={`button-delete-cat-${cat.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => { setAddingSubFor(cat.slug); setExpanded(s => ({ ...s, [cat.id]: true })); }}
                        data-testid={`button-add-sub-${cat.id}`}
                      >
                        <Plus className="h-3 w-3 mr-0.5" /> Sub-service
                      </Button>
                    </div>
                  </div>
                )}

                {/* Expanded body */}
                {isOpen && !isEditing && (
                  <div className="border-t">
                    {/* New sub-service inline form */}
                    {addingSubFor === cat.slug && (
                      <div className="p-3 border-b bg-primary/3">
                        <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                          <Plus className="h-3 w-3" /> New sub-service in <span className="font-bold">{cat.name}</span>
                        </p>
                        <SubServiceForm
                          initial={EMPTY_SUB}
                          onSave={(d) => createSub.mutate({ ...d, category: cat.slug })}
                          onCancel={() => setAddingSubFor(null)}
                          isSaving={createSub.isPending}
                          testPrefix={`new-sub-${cat.id}`}
                        />
                      </div>
                    )}

                    {catSubs.length === 0 && addingSubFor !== cat.slug && (
                      <div className="py-6 text-center text-sm text-muted-foreground" data-testid={`empty-subs-${cat.id}`}>
                        No sub-services yet.{" "}
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() => setAddingSubFor(cat.slug)}
                        >
                          Add the first one.
                        </button>
                      </div>
                    )}

                    {catSubs.map((s, idx) => {
                      const isEditingSub = editingSub?.id === s.id;
                      const isLast = idx === catSubs.length - 1 && archivedSubs.length === 0;
                      return (
                        <div
                          key={s.id}
                          className={`px-3 py-2 ${!isLast ? "border-b" : ""} hover:bg-muted/20 transition-colors`}
                          data-testid={`sub-row-${s.id}`}
                        >
                          {isEditingSub ? (
                            <div className="py-1">
                              <SubServiceForm
                                initial={{
                                  name: s.name,
                                  basePrice: s.basePrice || "0.00",
                                  platformFee: s.platformFee || "0.00",
                                  durationMinutes: s.durationMinutes || 30,
                                  taxPercentage: s.taxPercentage || "0.00",
                                  pricingType: (s.pricingType || "fixed") as any,
                                }}
                                onSave={(d) => updateSub.mutate({ id: s.id, data: d })}
                                onCancel={() => setEditingSub(null)}
                                isSaving={updateSub.isPending}
                                testPrefix={`edit-sub-${s.id}`}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              {/* Tree connector */}
                              <div className="flex items-center gap-1 shrink-0 pl-4">
                                <div className="w-px h-full border-l border-muted-foreground/20 mr-1" />
                                <Tag className="h-3.5 w-3.5 text-muted-foreground/60" />
                              </div>

                              {/* Sub-service info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm" data-testid={`text-sub-name-${s.id}`}>{s.name}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                    {s.pricingType || "fixed"}
                                  </Badge>
                                  {!s.isActive && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Inactive</Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <DollarSign className="h-3 w-3" />
                                    Base: <span className="font-medium text-foreground ml-0.5">{fmtMoney(s.basePrice)}</span>
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <DollarSign className="h-3 w-3" />
                                    Fee: <span className="font-medium text-foreground ml-0.5">{fmtMoney(s.platformFee)}</span>
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Clock className="h-3 w-3" />
                                    <span className="font-medium text-foreground">{s.durationMinutes}m</span>
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Percent className="h-3 w-3" />
                                    Tax: <span className="font-medium text-foreground ml-0.5">{Number(s.taxPercentage)}%</span>
                                  </span>
                                </div>
                              </div>

                              {/* Controls */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Switch
                                  checked={!!s.isActive}
                                  onCheckedChange={(v) => toggleSubActive.mutate({ id: s.id, isActive: v })}
                                  data-testid={`switch-sub-${s.id}`}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => setEditingSub(s)}
                                  data-testid={`button-edit-sub-${s.id}`}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeletingSub(s)}
                                  data-testid={`button-delete-sub-${s.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Archived sub-services (collapsed) */}
                    {archivedSubs.length > 0 && (
                      <div className="px-3 py-2 border-t bg-muted/10">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <Archive className="h-3 w-3" />
                          {archivedSubs.length} archived sub-service{archivedSubs.length !== 1 ? "s" : ""}
                        </p>
                        {archivedSubs.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 py-1 opacity-60">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground ml-5" />
                            <span className="text-xs line-through flex-1">{s.name}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2"
                              onClick={() => restoreSub.mutate(s.id)}
                              disabled={restoreSub.isPending}
                              data-testid={`button-restore-sub-${s.id}`}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Restore
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Delete category dialog ── */}
      <AlertDialog open={!!deletingCat} onOpenChange={(o) => !o && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deletingCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              If sub-services in this category are in use by providers or bookings, it will be archived (soft-deleted) rather than permanently removed. Existing data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingCat(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingCat && deleteCat.mutate(deletingCat.id)}
              data-testid="button-confirm-delete-cat"
            >
              {deleteCat.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete sub-service dialog ── */}
      <AlertDialog open={!!deletingSub} onOpenChange={(o) => !o && setDeletingSub(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deletingSub?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              If this sub-service is assigned to providers or used in bookings, it will be archived instead of permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingSub(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingSub && deleteSub.mutate(deletingSub.id)}
              data-testid="button-confirm-delete-sub"
            >
              {deleteSub.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
