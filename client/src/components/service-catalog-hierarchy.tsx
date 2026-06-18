import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2, ChevronRight, ChevronDown, Plus, Edit2, Trash2, Check, X,
  Tag, DollarSign, Clock, Percent, ListTree,
  RotateCcw, Archive, Layers, Globe, ShieldCheck, ChevronUp, AlertTriangle,
  Activity, HeartPulse, Stethoscope, Home, Brain, FlaskConical, MoreHorizontal,
  Settings, Eye,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────── */
/*  Utilities                                                          */
/* ────────────────────────────────────────────────────────────────── */
function isEmoji(s: string): boolean {
  if (!s) return false;
  const cp = s.codePointAt(0) ?? 0;
  return cp > 127;
}

function toTitleCase(s: string): string {
  if (!s) return s;
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/* ────────────────────────────────────────────────────────────────── */
/*  Healthcare icon map                                               */
/* ────────────────────────────────────────────────────────────────── */
function getCategoryIcon(slug: string) {
  switch (slug) {
    case "rehabilitation":      return Activity;
    case "nursing":             return HeartPulse;
    case "physician":           return Stethoscope;
    case "mental_health":       return Brain;
    case "nutrition":           return FlaskConical;
    case "dental":              return Stethoscope;
    case "alternative_medicine":return Home;
    default:                    return Stethoscope;
  }
}

function getCategoryColor(slug: string): { icon: string; bg: string; border: string; text: string } {
  switch (slug) {
    case "rehabilitation":
      return { icon: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300" };
    case "nursing":
      return { icon: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-200 dark:border-rose-800", text: "text-rose-700 dark:text-rose-300" };
    case "mental_health":
      return { icon: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40", border: "border-violet-200 dark:border-violet-800", text: "text-violet-700 dark:text-violet-300" };
    case "nutrition":
      return { icon: "text-lime-600 dark:text-lime-400", bg: "bg-lime-50 dark:bg-lime-950/40", border: "border-lime-200 dark:border-lime-800", text: "text-lime-700 dark:text-lime-300" };
    case "dental":
      return { icon: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-200 dark:border-cyan-800", text: "text-cyan-700 dark:text-cyan-300" };
    case "alternative_medicine":
      return { icon: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-200 dark:border-teal-800", text: "text-teal-700 dark:text-teal-300" };
    default:
      return { icon: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-300" };
  }
}

/* ────────────────────────────────────────────────────────────────── */
/*  Types                                                             */
/* ────────────────────────────────────────────────────────────────── */
interface Category {
  id: string; slug: string; name: string; description?: string | null;
  icon?: string | null; sortOrder?: number; isActive?: boolean; deletedAt?: string | null;
}
interface CatalogService {
  id: string; categoryId?: string | null; name: string; description?: string | null;
  icon?: string | null; sortOrder?: number; isActive?: boolean; deletedAt?: string | null;
}
interface SubService {
  id: string; category: string; catalogServiceId?: string | null; name: string;
  description?: string | null; basePrice?: string; platformFee?: string;
  durationMinutes?: number; bufferBefore?: number; bufferAfter?: number;
  taxPercentage?: string; pricingType?: string;
  isActive?: boolean; deletedAt?: string | null;
  status?: string;
  nameEn?: string; nameHu?: string; nameFa?: string;
  descriptionEn?: string; descriptionHu?: string; descriptionFa?: string;
  minPrice?: string | null; maxPrice?: string | null;
  suggestedMinPrice?: string | null; suggestedMaxPrice?: string | null;
  requirements?: Record<string, any> | null;
  providerCategoryName?: string | null;
}

/* ────────────────────────────────────────────────────────────────── */
/*  Constants                                                         */
/* ────────────────────────────────────────────────────────────────── */
const LIFECYCLE_STATUSES = [
  { value: "draft",            label: "Draft",            cls: "bg-muted text-muted-foreground" },
  { value: "pending_approval", label: "Pending Approval", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "active",           label: "Active",           cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  { value: "inactive",         label: "Inactive",         cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "deprecated",       label: "Deprecated",       cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "archived",         label: "Archived",         cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
];

// Taxonomy category names for the provider category restriction dropdown
const PROVIDER_CATEGORIES = [
  "Medical Doctors & Specialists",
  "Mental Health & Behavioral Professionals",
  "Nutrition, Dietetics & Metabolic Wellness",
  "Physical Therapy & Rehabilitation",
  "Dental Care Professionals",
  "Alternative, Holistic & Integrative Medicine",
  "Maternal, Nursing & Allied Health Support",
] as const;

const EMPTY_SUB = {
  name: "", basePrice: "0.00", platformFee: "0.00", durationMinutes: 30,
  bufferBefore: 0, bufferAfter: 0,
  taxPercentage: "0.00", pricingType: "fixed" as string,
  status: "active",
  providerCategoryName: "",
  nameEn: "", nameHu: "", nameFa: "",
  descriptionEn: "", descriptionHu: "", descriptionFa: "",
  minPrice: "", maxPrice: "", suggestedMinPrice: "", suggestedMaxPrice: "",
  requirements: { insuranceRequired: false, consentRequired: false, minAge: "", maxAge: "" },
};
const EMPTY_CAT = { name: "", slug: "", description: "", icon: "", sortOrder: 0 };
const EMPTY_CS  = { name: "", description: "", icon: "" };

/* ────────────────────────────────────────────────────────────────── */
/*  SubServiceForm                                                    */
/* ────────────────────────────────────────────────────────────────── */
function SubServiceForm({ initial, onSave, onCancel, isSaving, testPrefix }: {
  initial: typeof EMPTY_SUB; onSave: (d: typeof EMPTY_SUB) => void;
  onCancel: () => void; isSaving: boolean; testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLang, setShowLang] = useState(false);

  const statusMeta = LIFECYCLE_STATUSES.find(s => s.value === d.status) ?? LIFECYCLE_STATUSES[2];

  const handleNameChange = (val: string) => setD({ ...d, name: toTitleCase(val) });

  return (
    <div className="bg-muted/40 rounded-lg border border-dashed border-primary/30 p-3 space-y-3">
      {/* Provider category restriction */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
          Provider Category Restriction <span className="text-muted-foreground/60 normal-case">(leave blank = available to all)</span>
        </label>
        <Select
          value={d.providerCategoryName || "__all__"}
          onValueChange={(v) => setD({ ...d, providerCategoryName: v === "__all__" ? "" : v })}
        >
          <SelectTrigger className="h-8 text-xs" data-testid={`${testPrefix}-provider-category`}>
            <SelectValue placeholder="— All provider types —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">— All provider types —</SelectItem>
            {PROVIDER_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="lg:col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Name</label>
          <Input
            value={d.name}
            onChange={e => setD({ ...d, name: e.target.value })}
            onBlur={e => handleNameChange(e.target.value)}
            placeholder="e.g. Manual Therapy"
            data-testid={`${testPrefix}-name`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Base price</label>
          <Input type="number" step="0.01" min="0" value={d.basePrice} onChange={e => setD({ ...d, basePrice: e.target.value })} data-testid={`${testPrefix}-base`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Platform fee</label>
          <Input type="number" step="0.01" min="0" value={d.platformFee} onChange={e => setD({ ...d, platformFee: e.target.value })} data-testid={`${testPrefix}-fee`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Duration (min)</label>
          <Input type="number" min="5" value={d.durationMinutes} onChange={e => setD({ ...d, durationMinutes: parseInt(e.target.value) || 0 })} data-testid={`${testPrefix}-dur`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Default buffer before (min)</label>
          <Select value={String(d.bufferBefore)} onValueChange={v => setD({ ...d, bufferBefore: Number(v) })}>
            <SelectTrigger className="h-8 text-xs" data-testid={`${testPrefix}-buf-before`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0, 5, 10, 15, 20, 30, 45, 60].map(n => (
                <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : `${n} min`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Default buffer after (min)</label>
          <Select value={String(d.bufferAfter)} onValueChange={v => setD({ ...d, bufferAfter: Number(v) })}>
            <SelectTrigger className="h-8 text-xs" data-testid={`${testPrefix}-buf-after`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0, 5, 10, 15, 20, 30, 45, 60].map(n => (
                <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : `${n} min`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Tax %</label>
          <Input type="number" step="0.01" min="0" max="100" value={d.taxPercentage} onChange={e => setD({ ...d, taxPercentage: e.target.value })} data-testid={`${testPrefix}-tax`} />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Pricing type</label>
          <Select value={d.pricingType} onValueChange={v => setD({ ...d, pricingType: v })}>
            <SelectTrigger data-testid={`${testPrefix}-type`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="session">Per Session</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Lifecycle Status</label>
          <Select value={d.status} onValueChange={v => setD({ ...d, status: v })}>
            <SelectTrigger data-testid={`${testPrefix}-status`}>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${statusMeta.cls}`}>
                {statusMeta.label}
              </span>
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border border-border/60 p-2 space-y-2 bg-background/50">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Price Guardrails (USD)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Min price</label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={d.minPrice} onChange={e => setD({ ...d, minPrice: e.target.value })} data-testid={`${testPrefix}-min-price`} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Max price</label>
            <Input type="number" step="0.01" min="0" placeholder="No limit" value={d.maxPrice} onChange={e => setD({ ...d, maxPrice: e.target.value })} data-testid={`${testPrefix}-max-price`} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Suggested min</label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={d.suggestedMinPrice} onChange={e => setD({ ...d, suggestedMinPrice: e.target.value })} data-testid={`${testPrefix}-sug-min`} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Suggested max</label>
            <Input type="number" step="0.01" min="0" placeholder="No limit" value={d.suggestedMaxPrice} onChange={e => setD({ ...d, suggestedMaxPrice: e.target.value })} data-testid={`${testPrefix}-sug-max`} />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Providers see a warning if their price falls outside the suggested range. Hard limits block saving outside min/max.</p>
      </div>

      <div className="rounded-md border border-border/60 p-2 space-y-2 bg-background/50">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Requirements
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={!!d.requirements?.insuranceRequired}
              onChange={e => setD({ ...d, requirements: { ...d.requirements, insuranceRequired: e.target.checked } })}
              data-testid={`${testPrefix}-req-insurance`}
              className="rounded"
            />
            Insurance required
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={!!d.requirements?.consentRequired}
              onChange={e => setD({ ...d, requirements: { ...d.requirements, consentRequired: e.target.checked } })}
              data-testid={`${testPrefix}-req-consent`}
              className="rounded"
            />
            Consent required
          </label>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Min age</label>
            <Input type="number" min="0" max="150" placeholder="—" value={d.requirements?.minAge ?? ""} onChange={e => setD({ ...d, requirements: { ...d.requirements, minAge: e.target.value } })} className="h-7 text-xs" data-testid={`${testPrefix}-req-min-age`} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Max age</label>
            <Input type="number" min="0" max="150" placeholder="—" value={d.requirements?.maxAge ?? ""} onChange={e => setD({ ...d, requirements: { ...d.requirements, maxAge: e.target.value } })} className="h-7 text-xs" data-testid={`${testPrefix}-req-max-age`} />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-background/50">
        <button
          type="button"
          onClick={() => setShowLang(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
          data-testid={`${testPrefix}-toggle-lang`}
        >
          <span className="flex items-center gap-1.5"><Globe className="h-3 w-3" /> Multi-language Names</span>
          {showLang ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showLang && (
          <div className="px-3 pb-3 space-y-2 border-t">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              {[
                { key: "nameEn", label: "English name", flag: "🇬🇧" },
                { key: "nameHu", label: "Hungarian name", flag: "🇭🇺" },
                { key: "nameFa", label: "Persian name", flag: "🇮🇷" },
              ].map(({ key, label, flag }) => (
                <div key={key}>
                  <label className="text-[10px] text-muted-foreground block mb-1">{flag} {label}</label>
                  <Input
                    value={(d as any)[key] ?? ""}
                    onChange={e => setD({ ...d, [key]: e.target.value })}
                    onBlur={e => setD({ ...d, [key]: toTitleCase(e.target.value) })}
                    placeholder={`Name in ${label.split(" ")[0]}`}
                    data-testid={`${testPrefix}-${key.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { key: "descriptionEn", label: "🇬🇧 EN description" },
                { key: "descriptionHu", label: "🇭🇺 HU description" },
                { key: "descriptionFa", label: "🇮🇷 FA description" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[10px] text-muted-foreground block mb-1">{label}</label>
                  <Textarea
                    value={(d as any)[key] ?? ""}
                    onChange={e => setD({ ...d, [key]: e.target.value })}
                    rows={2}
                    className="text-xs resize-none"
                    data-testid={`${testPrefix}-${key.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} data-testid={`${testPrefix}-cancel`}><X className="h-3 w-3 mr-1" /> Cancel</Button>
        <Button size="sm" disabled={!d.name.trim() || isSaving} onClick={() => onSave({ ...d, name: toTitleCase(d.name) })} data-testid={`${testPrefix}-save`}>
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />} Save
        </Button>
      </div>
    </div>
  );
}

function CatalogServiceForm({ initial, onSave, onCancel, isSaving, testPrefix }: {
  initial: typeof EMPTY_CS; onSave: (d: typeof EMPTY_CS) => void;
  onCancel: () => void; isSaving: boolean; testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-dashed border-amber-400/40 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Service group name</label>
          <Input
            value={d.name}
            onChange={e => setD({ ...d, name: e.target.value })}
            onBlur={e => setD({ ...d, name: toTitleCase(e.target.value) })}
            placeholder="e.g. Sports Recovery"
            data-testid={`${testPrefix}-name`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Icon (emoji)</label>
          <Input value={d.icon || ""} onChange={e => setD({ ...d, icon: e.target.value })} placeholder="🏃" data-testid={`${testPrefix}-icon`} />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Description (optional)</label>
        <Input value={d.description || ""} onChange={e => setD({ ...d, description: e.target.value })} placeholder="Brief description" data-testid={`${testPrefix}-desc`} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3 w-3 mr-1" /> Cancel</Button>
        <Button size="sm" disabled={!d.name.trim() || isSaving} onClick={() => onSave({ ...d, name: toTitleCase(d.name) })}>
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />} Add service group
        </Button>
      </div>
    </div>
  );
}

function CategoryForm({ initial, onSave, onCancel, isSaving, testPrefix }: {
  initial: typeof EMPTY_CAT; onSave: (d: typeof EMPTY_CAT) => void;
  onCancel: () => void; isSaving: boolean; testPrefix: string;
}) {
  const [d, setD] = useState(initial);
  const autoSlug = (n: string) => n.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    <div className="bg-primary/5 rounded-lg border border-dashed border-primary/40 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Category name</label>
          <Input
            value={d.name}
            onChange={e => {
              const n = e.target.value;
              setD({ ...d, name: n, slug: d.slug || autoSlug(n) });
            }}
            onBlur={e => setD({ ...d, name: toTitleCase(e.target.value) })}
            placeholder="e.g. Cardiology"
            data-testid={`${testPrefix}-name`}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Slug (internal, auto-generated)</label>
          <Input value={d.slug} onChange={e => setD({ ...d, slug: e.target.value })} placeholder="auto-generated" data-testid={`${testPrefix}-slug`} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Description</label>
          <Input value={d.description} onChange={e => setD({ ...d, description: e.target.value })} placeholder="Brief description" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Icon (emoji)</label>
          <Input value={d.icon} onChange={e => setD({ ...d, icon: e.target.value })} placeholder="🩺" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3 w-3 mr-1" /> Cancel</Button>
        <Button size="sm" disabled={!d.name.trim() || !d.slug.trim() || isSaving} onClick={() => onSave({ ...d, name: toTitleCase(d.name) })} data-testid={`${testPrefix}-save`}>
          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />} Save category
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Main component                                                    */
/* ────────────────────────────────────────────────────────────────── */
export function ServiceCatalogHierarchy() {
  useTranslation();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();

  const [expandedCat, setExpandedCat]   = useState<Record<string, boolean>>({});
  const [expandedCs,  setExpandedCs]    = useState<Record<string, boolean>>({});
  const [archivedOpen, setArchivedOpen] = useState(false);

  const [addingCat, setAddingCat]       = useState(false);
  const [editingCat, setEditingCat]     = useState<Category | null>(null);
  const [deletingCat, setDeletingCat]   = useState<Category | null>(null);

  const [addingCsFor,  setAddingCsFor]  = useState<string | null>(null);
  const [editingCs,    setEditingCs]    = useState<CatalogService | null>(null);
  const [deletingCs,   setDeletingCs]   = useState<CatalogService | null>(null);

  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [editingSub,   setEditingSub]   = useState<SubService | null>(null);
  const [deletingSub,  setDeletingSub]  = useState<SubService | null>(null);

  /* ── Queries ── */
  const { data: categories = [], refetch: refetchCats } = useQuery<Category[]>({ queryKey: ["/api/admin/categories"] });
  const { data: csAll = [],      refetch: refetchCs   } = useQuery<CatalogService[]>({ queryKey: ["/api/admin/catalog-services"] });
  const { data: subs = [],       refetch: refetchSubs } = useQuery<SubService[]>({ queryKey: ["/api/admin/sub-services"] });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/catalog-services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sub-services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/catalog-services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sub-services"] });
  };

  /* ── Mutations ── */
  // Helper: throw on non-OK HTTP responses so React Query's onError fires.
  const call = async (r: Response) => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).message || "Request failed"); }
    return r.json().catch(() => ({}));
  };

  const mkMut = (method: string, url: string | ((d: any) => string), onOk: () => void) =>
    useMutation({
      mutationFn: (d: any) => apiRequest(method, typeof url === "function" ? url(d) : url, typeof url === "function" ? undefined : d).then(call),
      onSuccess: () => { onOk(); invalidate(); },
      onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
    });

  const createCat  = mkMut("POST",  "/api/admin/categories",                          () => { setAddingCat(false);  refetchCats(); });
  const updateCat  = useMutation({ mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/admin/categories/${id}`, data).then(call), onSuccess: () => { setEditingCat(null); refetchCats(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const deleteCat  = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/categories/${id}`).then(call), onSuccess: () => { setDeletingCat(null); refetchCats(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const toggleCat  = useMutation({ mutationFn: ({ id, v }: any) => apiRequest("PATCH", `/api/admin/categories/${id}`, { isActive: v }).then(call), onSuccess: () => { refetchCats(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });

  const createCs   = useMutation({ mutationFn: (d: any) => apiRequest("POST",  "/api/admin/catalog-services",  d).then(call), onSuccess: () => { setAddingCsFor(null);  refetchCs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const updateCs   = useMutation({ mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/admin/catalog-services/${id}`, data).then(call), onSuccess: () => { setEditingCs(null); refetchCs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const deleteCs   = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/catalog-services/${id}`).then(call), onSuccess: () => { setDeletingCs(null); refetchCs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const toggleCs   = useMutation({ mutationFn: ({ id, v }: any) => apiRequest("PATCH", `/api/admin/catalog-services/${id}`, { isActive: v }).then(call), onSuccess: () => { refetchCs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });

  const createSub  = useMutation({ mutationFn: (d: any) => apiRequest("POST",  "/api/admin/sub-services",  d).then(call), onSuccess: () => { setAddingSubFor(null); refetchSubs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const updateSub  = useMutation({ mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/admin/sub-services/${id}`, data).then(call), onSuccess: () => { setEditingSub(null); refetchSubs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const deleteSub  = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/sub-services/${id}`).then(call), onSuccess: () => { setDeletingSub(null); refetchSubs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const toggleSub  = useMutation({ mutationFn: ({ id, v }: any) => apiRequest("PATCH", `/api/admin/sub-services/${id}`, { isActive: v }).then(call), onSuccess: () => { refetchSubs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });
  const restoreSub = useMutation({ mutationFn: (id: string) => apiRequest("POST", `/api/sub-services/${id}/restore`).then(call), onSuccess: () => { refetchSubs(); invalidate(); }, onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }) });

  /* ── Grouping ── */
  const sortedCats = useMemo(() => [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [categories]);
  const activeCats   = useMemo(() => sortedCats.filter(c => !c.deletedAt), [sortedCats]);
  const archivedCats = useMemo(() => sortedCats.filter(c => !!c.deletedAt), [sortedCats]);

  const csByCat  = useMemo(() => {
    const m: Record<string, CatalogService[]> = {};
    for (const cs of csAll) { (m[cs.categoryId || ""] ||= []).push(cs); }
    return m;
  }, [csAll]);
  const subsByCs = useMemo(() => {
    const m: Record<string, SubService[]> = {};
    for (const s of subs) { (m[s.catalogServiceId || `__cat__${s.category}`] ||= []).push(s); }
    return m;
  }, [subs]);

  /* ── Status badge for sub-services ── */
  const subStatusBadge = (s: SubService) => {
    const meta = LIFECYCLE_STATUSES.find(x => x.value === (s.status ?? "active")) ?? LIFECYCLE_STATUSES[2];
    return (
      <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>
        {meta.label}
      </span>
    );
  };

  /* ── Sub-service row ── */
  const renderSubRow = (s: SubService, isLast: boolean) => {
    if (editingSub?.id === s.id) {
      const init: typeof EMPTY_SUB = {
        name: s.name,
        basePrice: s.basePrice || "0.00",
        platformFee: s.platformFee || "0.00",
        durationMinutes: s.durationMinutes || 30,
        bufferBefore: s.bufferBefore ?? 0,
        bufferAfter: s.bufferAfter ?? 0,
        taxPercentage: s.taxPercentage || "0.00",
        pricingType: (s.pricingType || "fixed") as any,
        status: s.status || "active",
        providerCategoryName: s.providerCategoryName || "",
        nameEn: s.nameEn || "",
        nameHu: s.nameHu || "",
        nameFa: s.nameFa || "",
        descriptionEn: s.descriptionEn || "",
        descriptionHu: s.descriptionHu || "",
        descriptionFa: s.descriptionFa || "",
        minPrice: s.minPrice ? String(s.minPrice) : "",
        maxPrice: s.maxPrice ? String(s.maxPrice) : "",
        suggestedMinPrice: s.suggestedMinPrice ? String(s.suggestedMinPrice) : "",
        suggestedMaxPrice: s.suggestedMaxPrice ? String(s.suggestedMaxPrice) : "",
        requirements: {
          insuranceRequired: Boolean((s.requirements as any)?.insuranceRequired),
          consentRequired: Boolean((s.requirements as any)?.consentRequired),
          minAge: String((s.requirements as any)?.minAge ?? ""),
          maxAge: String((s.requirements as any)?.maxAge ?? ""),
        },
      };
      return (
        <div key={s.id} className="p-3 border-b">
          <SubServiceForm
            initial={init}
            onSave={d => updateSub.mutate({ id: s.id, data: d })}
            onCancel={() => setEditingSub(null)}
            isSaving={updateSub.isPending}
            testPrefix={`edit-sub-${s.id}`}
          />
        </div>
      );
    }

    const displayName = toTitleCase(s.name);

    return (
      <div
        key={s.id}
        className={`flex items-center gap-3 pl-8 pr-3 py-3 hover:bg-muted/20 transition-colors ${!isLast ? "border-b border-border/50" : ""}`}
        data-testid={`sub-row-${s.id}`}
      >
        {/* left accent */}
        <div className="w-0.5 h-full self-stretch bg-border/60 rounded-full shrink-0 -ml-5" />

        <Tag className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" data-testid={`text-sub-name-${s.id}`}>{displayName}</span>
            {subStatusBadge(s)}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal capitalize">{s.pricingType || "fixed"}</Badge>
            {(s.minPrice || s.maxPrice) && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                ${s.minPrice ?? "0"}–{s.maxPrice ? `$${s.maxPrice}` : "∞"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 mt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <DollarSign className="h-3 w-3" />Base: <span className="font-medium text-foreground ml-0.5">{fmtMoney(s.basePrice)}</span>
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" /><span className="font-medium text-foreground">{s.durationMinutes}m</span>
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Percent className="h-3 w-3" />Tax: <span className="font-medium text-foreground ml-0.5">{Number(s.taxPercentage)}%</span>
            </span>
            {(s.nameEn || s.nameHu || s.nameFa) && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Globe className="h-3 w-3" />{[s.nameEn && "EN", s.nameHu && "HU", s.nameFa && "FA"].filter(Boolean).join("·")}
              </span>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" data-testid={`button-sub-menu-${s.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditingSub(s)} data-testid={`menu-edit-sub-${s.id}`}>
              <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit Sub-Service
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => toggleSub.mutate({ id: s.id, v: !s.isActive })}
              data-testid={`menu-toggle-sub-${s.id}`}
            >
              {s.isActive ? <><Archive className="h-3.5 w-3.5 mr-2" /> Set Inactive</> : <><Check className="h-3.5 w-3.5 mr-2" /> Set Active</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeletingSub(s)}
              data-testid={`menu-delete-sub-${s.id}`}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  /* ── CatalogService (group) section ── */
  const renderCatalogService = (cs: CatalogService, cat: Category, isLastCs: boolean) => {
    const isOpen = !!expandedCs[cs.id];
    const csKey  = cs.id;
    const csSubs = (subsByCs[csKey] || []).filter(s => !s.deletedAt);
    const csArchived = (subsByCs[csKey] || []).filter(s => !!s.deletedAt);
    const isEditing  = editingCs?.id === cs.id;

    return (
      <div key={cs.id} className="ml-4 mb-2 rounded-lg border bg-background border-l-2 border-l-amber-300 dark:border-l-amber-700 overflow-hidden" data-testid={`cs-row-${cs.id}`}>
        {isEditing ? (
          <div className="p-2">
            <CatalogServiceForm
              initial={{ name: cs.name, description: cs.description || "", icon: cs.icon || "" }}
              onSave={d => updateCs.mutate({ id: cs.id, data: d })}
              onCancel={() => setEditingCs(null)}
              isSaving={updateCs.isPending}
              testPrefix={`edit-cs-${cs.id}`}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors">
            <button
              type="button"
              onClick={() => setExpandedCs(s => ({ ...s, [cs.id]: !s[cs.id] }))}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
              data-testid={`button-toggle-cs-${cs.id}`}
            >
              {isOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              }
              <Layers className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              {cs.icon && <span className="text-sm">{cs.icon}</span>}
              <span className="font-medium text-sm">{toTitleCase(cs.name)}</span>
              {!cs.isActive && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Inactive</Badge>
              )}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto mr-0">{csSubs.length} sub-services</Badge>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 gap-1"
                onClick={() => { setAddingSubFor(cs.id); setExpandedCs(s => ({ ...s, [cs.id]: true })); }}
                data-testid={`button-add-sub-${cs.id}`}
              >
                <Plus className="h-3 w-3" /> Add Sub-Service
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-cs-menu-${cs.id}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setEditingCs(cs)} data-testid={`menu-edit-cs-${cs.id}`}>
                    <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit Group
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toggleCs.mutate({ id: cs.id, v: !cs.isActive })} data-testid={`menu-toggle-cs-${cs.id}`}>
                    {cs.isActive ? <><Archive className="h-3.5 w-3.5 mr-2" /> Set Inactive</> : <><Check className="h-3.5 w-3.5 mr-2" /> Set Active</>}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeletingCs(cs)}
                    data-testid={`menu-delete-cs-${cs.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {isOpen && !isEditing && (
          <div className="border-t">
            {addingSubFor === cs.id && (
              <div className="p-3 border-b bg-muted/10">
                <SubServiceForm
                  initial={EMPTY_SUB}
                  onSave={d => createSub.mutate({ ...d, category: cat.slug, catalogServiceId: cs.id })}
                  onCancel={() => setAddingSubFor(null)}
                  isSaving={createSub.isPending}
                  testPrefix={`new-sub-${cs.id}`}
                />
              </div>
            )}
            {csSubs.length === 0 && addingSubFor !== cs.id && (
              <div className="py-5 text-center text-xs text-muted-foreground">
                No sub-services yet.{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => setAddingSubFor(cs.id)}>Add one.</button>
              </div>
            )}
            {csSubs.map((s, i) => renderSubRow(s, i === csSubs.length - 1 && csArchived.length === 0))}
            {csArchived.length > 0 && (
              <div className="px-4 py-2 border-t bg-muted/5">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Archive className="h-3 w-3" />{csArchived.length} archived sub-service{csArchived.length !== 1 ? "s" : ""}
                </p>
                {csArchived.map(s => (
                  <div key={s.id} className="flex items-center gap-2 py-1 opacity-60">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground ml-4" />
                    <span className="text-xs line-through flex-1">{toTitleCase(s.name)}</span>
                    <Button size="sm" variant="outline" className="h-5 text-xs px-1.5" onClick={() => restoreSub.mutate(s.id)} disabled={restoreSub.isPending} data-testid={`button-restore-sub-${s.id}`}>
                      <RotateCcw className="h-2.5 w-2.5 mr-0.5" />Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── Category card ── */
  const renderCategoryCard = (cat: Category, isArchived: boolean) => {
    const isOpen    = !!expandedCat[cat.id];
    const isEditing = editingCat?.id === cat.id;
    const catCss    = (csByCat[cat.id] || []).filter(c => !c.deletedAt);
    const legacySubs     = (subsByCs[`__cat__${cat.slug}`] || []).filter(s => !s.deletedAt);
    const legacyArchived = (subsByCs[`__cat__${cat.slug}`] || []).filter(s => !!s.deletedAt);
    const totalSubs = catCss.reduce((acc, cs) => acc + (subsByCs[cs.id] || []).filter(s => !s.deletedAt).length, 0) + legacySubs.length;

    const Icon   = getCategoryIcon(cat.slug);
    const colors = getCategoryColor(cat.slug);

    const activeStatus = isArchived ? "Archived" : (cat.isActive ? "Active" : "Inactive");
    const statusCls = isArchived
      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      : cat.isActive
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

    return (
      <div
        key={cat.id}
        className={`rounded-xl border overflow-hidden transition-all ${isArchived ? "opacity-70" : "bg-card shadow-sm"}`}
        data-testid={`cat-row-${cat.id}`}
      >
        {isEditing ? (
          <div className="p-4">
            <CategoryForm
              initial={{ name: cat.name, slug: cat.slug, description: cat.description || "", icon: cat.icon || "", sortOrder: cat.sortOrder ?? 0 }}
              onSave={d => updateCat.mutate({ id: cat.id, data: d })}
              onCancel={() => setEditingCat(null)}
              isSaving={updateCat.isPending}
              testPrefix={`edit-cat-${cat.id}`}
            />
          </div>
        ) : (
          /* ── Collapsed header ── */
          <div className="px-4 py-4">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={`h-12 w-12 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center shrink-0`}>
                {cat.icon && isEmoji(cat.icon)
                  ? <span className="text-xl">{cat.icon}</span>
                  : <Icon className={`h-6 w-6 ${colors.icon}`} />
                }
              </div>

              {/* Name + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base leading-tight" data-testid={`heading-cat-${cat.id}`}>
                    {toTitleCase(cat.name)}
                  </h3>
                  <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>
                    {activeStatus}
                  </span>
                </div>
                {cat.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{cat.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  <span>{catCss.length} Group{catCss.length !== 1 ? "s" : ""}</span>
                  <span className="text-border">•</span>
                  <span>{totalSubs} Sub-Service{totalSubs !== 1 ? "s" : ""}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={() => setExpandedCat(s => ({ ...s, [cat.id]: !s[cat.id] }))}
                  data-testid={`button-manage-cat-${cat.id}`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Manage
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-cat-menu-${cat.id}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => { setEditingCat(cat); setExpandedCat(s => ({ ...s, [cat.id]: true })); }}
                      data-testid={`menu-edit-cat-${cat.id}`}
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit Category
                    </DropdownMenuItem>
                    {!isArchived && (
                      <DropdownMenuItem
                        onClick={() => toggleCat.mutate({ id: cat.id, v: !cat.isActive })}
                        data-testid={`menu-toggle-cat-${cat.id}`}
                      >
                        {cat.isActive
                          ? <><Archive className="h-3.5 w-3.5 mr-2" /> Set Inactive</>
                          : <><Check className="h-3.5 w-3.5 mr-2" /> Set Active</>
                        }
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeletingCat(cat)}
                      data-testid={`menu-delete-cat-${cat.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Archive Category
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        )}

        {/* ── Expanded body ── */}
        {isOpen && !isEditing && (
          <div className="border-t bg-muted/10 pt-3 pb-3">
            <div className="px-4 mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service Groups & Sub-Services</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => { setAddingCsFor(cat.id); }}
                  data-testid={`button-add-cs-${cat.id}`}
                >
                  <Plus className="h-3 w-3" /> Add Group
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => { setAddingSubFor(`__cat__${cat.slug}`); }}
                  data-testid={`button-add-sub-direct-${cat.id}`}
                >
                  <Plus className="h-3 w-3" /> Add Sub-Service
                </Button>
              </div>
            </div>

            {/* Add group form */}
            {addingCsFor === cat.id && (
              <div className="mx-4 mb-3">
                <CatalogServiceForm
                  initial={EMPTY_CS}
                  onSave={d => createCs.mutate({ ...d, categoryId: cat.id })}
                  onCancel={() => setAddingCsFor(null)}
                  isSaving={createCs.isPending}
                  testPrefix={`new-cs-${cat.id}`}
                />
              </div>
            )}

            {/* Empty state */}
            {catCss.length === 0 && legacySubs.length === 0 && addingCsFor !== cat.id && addingSubFor !== `__cat__${cat.slug}` && (
              <div className="mx-4 py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No service groups yet.{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => setAddingCsFor(cat.id)}>Add a service group</button>
                {" "}or{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => setAddingSubFor(`__cat__${cat.slug}`)}>add a sub-service directly</button>.
              </div>
            )}

            {/* Groups */}
            {catCss.map((cs, i) => renderCatalogService(cs, cat, i === catCss.length - 1 && legacySubs.length === 0))}

            {/* Ungrouped / legacy sub-services */}
            {(legacySubs.length > 0 || addingSubFor === `__cat__${cat.slug}`) && (
              <div className="ml-4 mr-0 mb-2 rounded-lg border bg-background border-l-2 border-l-muted-foreground/30 overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/20 border-b flex items-center gap-1.5">
                  <Tag className="h-3 w-3" />Ungrouped Sub-Services
                </div>
                {addingSubFor === `__cat__${cat.slug}` && (
                  <div className="p-3 border-b bg-muted/10">
                    <SubServiceForm
                      initial={EMPTY_SUB}
                      onSave={d => createSub.mutate({ ...d, category: cat.slug })}
                      onCancel={() => setAddingSubFor(null)}
                      isSaving={createSub.isPending}
                      testPrefix={`new-sub-direct-${cat.id}`}
                    />
                  </div>
                )}
                {legacySubs.map((s, i) => renderSubRow(s, i === legacySubs.length - 1 && legacyArchived.length === 0))}
                {legacyArchived.length > 0 && (
                  <div className="px-4 py-2 border-t bg-muted/5">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Archive className="h-3 w-3" />{legacyArchived.length} archived
                    </p>
                    {legacyArchived.map(s => (
                      <div key={s.id} className="flex items-center gap-2 py-0.5 opacity-60">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground ml-4" />
                        <span className="text-xs line-through flex-1">{toTitleCase(s.name)}</span>
                        <Button size="sm" variant="outline" className="h-5 text-xs px-1.5" onClick={() => restoreSub.mutate(s.id)} disabled={restoreSub.isPending}>
                          <RotateCcw className="h-2.5 w-2.5 mr-0.5" />Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ListTree className="h-5 w-5 text-primary" />Service Catalog
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage categories, service groups, and sub-services with global pricing defaults and guardrails.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{activeCats.length} active categories</Badge>
          <Badge variant="secondary">{csAll.filter(c => !c.deletedAt).length} groups</Badge>
          <Badge variant="secondary">{subs.filter(s => !s.deletedAt).length} sub-services</Badge>
          <Button
            size="sm"
            onClick={() => { setAddingCat(true); setEditingCat(null); }}
            disabled={addingCat}
            data-testid="button-add-category"
          >
            <Plus className="h-4 w-4 mr-1" />Add Category
          </Button>
        </div>
      </div>

      {/* ── New category form ── */}
      {addingCat && (
        <CategoryForm
          initial={EMPTY_CAT}
          onSave={d => createCat.mutate(d)}
          onCancel={() => setAddingCat(false)}
          isSaving={createCat.isPending}
          testPrefix="new-cat"
        />
      )}

      {/* ── Empty state ── */}
      {activeCats.length === 0 && !addingCat && archivedCats.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
          <ListTree className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No categories yet</p>
          <p className="text-sm">Click "Add Category" to get started.</p>
        </div>
      ) : (
        <>
          {/* ── Active categories ── */}
          {activeCats.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-3">
                Active Categories
              </p>
              <div className="space-y-3" data-testid="catalog-tree-active">
                {activeCats.map(cat => renderCategoryCard(cat, false))}
              </div>
            </div>
          )}

          {/* ── Archived categories ── */}
          {archivedCats.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setArchivedOpen(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-3 hover:text-foreground transition-colors"
                data-testid="button-toggle-archived-cats"
              >
                <Archive className="h-3.5 w-3.5" />
                Archived Categories ({archivedCats.length})
                {archivedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {archivedOpen && (
                <div className="space-y-3 opacity-70" data-testid="catalog-tree-archived">
                  {archivedCats.map(cat => renderCategoryCard(cat, true))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Confirm-delete dialogs ── */}
      <AlertDialog open={!!deletingCat} onOpenChange={open => !open && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive category "{deletingCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will archive the category and all its service groups. Provider services already assigned are preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingCat && deleteCat.mutate(deletingCat.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingCs} onOpenChange={open => !open && setDeletingCs(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service group "{deletingCs?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Sub-services under this group will be archived. Provider services already assigned are preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingCs && deleteCs.mutate(deletingCs.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingSub} onOpenChange={open => !open && setDeletingSub(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sub-service "{deletingSub?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will archive the sub-service. Provider services already using it are preserved and can still be booked.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingSub && deleteSub.mutate(deletingSub.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
