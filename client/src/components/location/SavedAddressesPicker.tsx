/**
 * SavedAddressesPicker
 *
 * Renders a list of the user's saved addresses with:
 *  - Select from existing addresses
 *  - Add new address (via PlacesAutocomplete)
 *  - Edit / delete / set-default
 *
 * Used in: booking wizard (home visit step), profile address tab
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MapPin,
  Plus,
  Star,
  Pencil,
  Trash2,
  CheckCircle2,
  Home,
  Briefcase,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlacesAutocomplete, type StructuredAddress } from "./PlacesAutocomplete";

export interface SavedAddress {
  id: string;
  userId: string;
  nickname: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  placeId?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SavedAddressesPickerProps {
  selectedId?: string | null;
  onSelect: (address: SavedAddress | null) => void;
  showManageOnly?: boolean;
  className?: string;
}

const NICKNAME_ICONS: Record<string, React.ReactNode> = {
  Home: <Home className="h-4 w-4" />,
  Work: <Briefcase className="h-4 w-4" />,
  Office: <Briefcase className="h-4 w-4" />,
  Family: <Users className="h-4 w-4" />,
};

function getNicknameIcon(nickname: string) {
  return NICKNAME_ICONS[nickname] ?? <MapPin className="h-4 w-4" />;
}

function displayAddress(addr: SavedAddress): string {
  if (addr.formattedAddress) return addr.formattedAddress;
  return [addr.addressLine1, addr.city, addr.state, addr.postalCode]
    .filter(Boolean)
    .join(", ");
}

const SAVED_ADDRESSES_KEY = ["/api/locations/saved-addresses"];

// ── Address Form ──────────────────────────────────────────────────────────────

interface AddressFormState {
  nickname: string;
  rawAddress: string;
  structured?: StructuredAddress;
}

const BLANK_FORM: AddressFormState = { nickname: "Home", rawAddress: "", structured: undefined };
const NICKNAME_OPTIONS = ["Home", "Work", "Office", "Parents", "Relative", "Other"];

function AddressFormDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<SavedAddress> | null;
  onSave: (data: AddressFormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AddressFormState>({
    nickname: initial?.nickname ?? "Home",
    rawAddress: initial?.formattedAddress ?? (
      [initial?.addressLine1, initial?.city].filter(Boolean).join(", ")
    ) ?? "",
    structured: initial
      ? {
          addressLine1: initial.addressLine1,
          city: initial.city,
          state: initial.state,
          postalCode: initial.postalCode,
          country: initial.country,
          latitude: initial.latitude,
          longitude: initial.longitude,
          formattedAddress: initial.formattedAddress,
          placeId: initial.placeId,
        }
      : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Address" : "Add Address"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Label</Label>
            <div className="flex gap-2 flex-wrap">
              {NICKNAME_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, nickname: n }))}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm border transition-colors",
                    form.nickname === n
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted",
                  )}
                  data-testid={`btn-nickname-${n.toLowerCase()}`}
                >
                  {n}
                </button>
              ))}
              {!NICKNAME_OPTIONS.includes(form.nickname) && (
                <span className="px-3 py-1 rounded-full text-sm border bg-primary text-primary-foreground border-primary">
                  {form.nickname}
                </span>
              )}
            </div>
            {form.nickname === "Other" && (
              <Input
                className="mt-2"
                placeholder="Custom label (e.g. Gym, Parent's house)"
                value={form.nickname === "Other" ? "" : form.nickname}
                onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                data-testid="input-custom-nickname"
              />
            )}
          </div>

          <div className="space-y-1">
            <Label>Address</Label>
            <PlacesAutocomplete
              value={form.rawAddress}
              onChange={(text, structured) =>
                setForm((f) => ({ ...f, rawAddress: text, structured }))
              }
              placeholder="Start typing your address…"
              data-testid="input-address-autocomplete"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={saving || !form.rawAddress.trim()}
            data-testid="btn-save-address"
          >
            {saving ? "Saving…" : "Save Address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SavedAddressesPicker({
  selectedId,
  onSelect,
  showManageOnly = false,
  className,
}: SavedAddressesPickerProps) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SavedAddress | null>(null);

  const { data: addresses = [], isLoading } = useQuery<SavedAddress[]>({
    queryKey: SAVED_ADDRESSES_KEY,
  });

  const createMut = useMutation({
    mutationFn: async (form: AddressFormState) => {
      const res = await apiRequest("POST", "/api/locations/saved-addresses", {
        nickname: form.nickname,
        formattedAddress: form.structured?.formattedAddress ?? form.rawAddress,
        addressLine1: form.structured?.addressLine1,
        city: form.structured?.city,
        state: form.structured?.state,
        postalCode: form.structured?.postalCode,
        country: form.structured?.country,
        latitude: form.structured?.latitude,
        longitude: form.structured?.longitude,
        placeId: form.structured?.placeId,
        isDefault: addresses.length === 0,
      });
      return res.json();
    },
    onSuccess: (newAddr: SavedAddress) => {
      queryClient.invalidateQueries({ queryKey: SAVED_ADDRESSES_KEY });
      setAddOpen(false);
      toast({ title: "Address saved" });
      if (!showManageOnly) onSelect(newAddr);
    },
    onError: () => toast({ title: "Failed to save address", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: AddressFormState }) => {
      const res = await apiRequest("PUT", `/api/locations/saved-addresses/${id}`, {
        nickname: form.nickname,
        formattedAddress: form.structured?.formattedAddress ?? form.rawAddress,
        addressLine1: form.structured?.addressLine1,
        city: form.structured?.city,
        state: form.structured?.state,
        postalCode: form.structured?.postalCode,
        country: form.structured?.country,
        latitude: form.structured?.latitude,
        longitude: form.structured?.longitude,
        placeId: form.structured?.placeId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SAVED_ADDRESSES_KEY });
      setEditTarget(null);
      toast({ title: "Address updated" });
    },
    onError: () => toast({ title: "Failed to update address", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/locations/saved-addresses/${id}`);
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: SAVED_ADDRESSES_KEY });
      if (selectedId === id) onSelect(null);
      toast({ title: "Address removed" });
    },
    onError: () => toast({ title: "Failed to remove address", variant: "destructive" }),
  });

  const defaultMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/locations/saved-addresses/${id}/set-default`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_ADDRESSES_KEY }),
    onError: () => toast({ title: "Failed to update default", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {[0, 1].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {addresses.map((addr) => {
        const isSelected = addr.id === selectedId;
        return (
          <div
            key={addr.id}
            className={cn(
              "group flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40",
              showManageOnly && "cursor-default",
            )}
            onClick={() => !showManageOnly && onSelect(addr)}
            data-testid={`saved-address-${addr.id}`}
          >
            <div
              className={cn(
                "mt-0.5 p-1.5 rounded-md",
                isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {getNicknameIcon(addr.nickname)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{addr.nickname}</span>
                {addr.isDefault && (
                  <Badge variant="secondary" className="text-xs py-0">
                    Default
                  </Badge>
                )}
                {isSelected && !showManageOnly && (
                  <CheckCircle2 className="h-4 w-4 text-primary ml-auto flex-shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {displayAddress(addr) || "No address details"}
              </p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {!addr.isDefault && (
                <button
                  type="button"
                  title="Set as default"
                  onClick={(e) => { e.stopPropagation(); defaultMut.mutate(addr.id); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  data-testid={`btn-set-default-${addr.id}`}
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                title="Edit"
                onClick={(e) => { e.stopPropagation(); setEditTarget(addr); }}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                data-testid={`btn-edit-address-${addr.id}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); deleteMut.mutate(addr.id); }}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                data-testid={`btn-delete-address-${addr.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={() => setAddOpen(true)}
        data-testid="btn-add-new-address"
      >
        <Plus className="h-4 w-4" />
        Add New Address
      </Button>

      <AddressFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(form) => createMut.mutate(form)}
        saving={createMut.isPending}
      />

      {editTarget && (
        <AddressFormDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          initial={editTarget}
          onSave={(form) => updateMut.mutate({ id: editTarget.id, form })}
          saving={updateMut.isPending}
        />
      )}
    </div>
  );
}
