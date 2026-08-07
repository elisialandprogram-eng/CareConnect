import { formatDate } from "@/lib/datetime";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/use-page-title";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { QK } from "@/lib/query-keys";
import { PlacesAutocomplete, type StructuredAddress } from "@/components/location/PlacesAutocomplete";
import {
  Users, Plus, Pencil, Trash2, Loader2, Phone, Mail, Calendar, Heart,
  AlertCircle, User, ChevronRight, MapPin, Home,
} from "lucide-react";

interface FamilyMember {
  id: string;
  primaryUserId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  notes?: string | null;
  isActive: boolean;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  formattedAddress?: string | null;
  placeId?: string | null;
  useParentAddress?: boolean;
}

const RELATIONSHIPS = [
  "spouse", "parent", "child", "sibling", "grandparent", "grandchild",
  "aunt_uncle", "niece_nephew", "cousin", "friend", "other",
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = ["male", "female", "other", "prefer_not_to_say"];

const EMPTY_FORM = {
  firstName: "", lastName: "", relationship: "other", dateOfBirth: "",
  gender: "", phone: "", email: "", bloodType: "", allergies: "", medicalConditions: "", notes: "",
  addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "",
  latitude: null as number | null,
  longitude: null as number | null,
  formattedAddress: "",
  placeId: "",
  useParentAddress: false,
};

function relLabel(r: string) {
  return r.replace(/_/g, " / ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function FamilyMembersPage() {
  const { t } = useTranslation();
  usePageTitle(t("family_members.meta_title", "Family Members"));
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteTarget, setDeleteTarget] = useState<FamilyMember | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: members = [], isLoading } = useQuery<FamilyMember[]>({
    queryKey: QK.familyMembers(),
    enabled: isAuthenticated,
  });

  const createMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => apiRequest("POST", "/api/family-members", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.familyMembers() });
      toast({ title: "Family member added" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Failed to save", description: err?.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof EMPTY_FORM> }) =>
      apiRequest("PATCH", `/api/family-members/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.familyMembers() });
      toast({ title: "Family member updated" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Failed to update", description: err?.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/family-members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.familyMembers() });
      toast({ title: "Family member removed" });
      setDeleteTarget(null);
    },
    onError: (err: any) => toast({ title: "Failed to remove", description: err?.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(m: FamilyMember) {
    setEditing(m);
    setForm({
      firstName: m.firstName ?? "",
      lastName: m.lastName ?? "",
      relationship: m.relationship ?? "other",
      dateOfBirth: m.dateOfBirth ?? "",
      gender: m.gender ?? "",
      phone: m.phone ?? "",
      email: m.email ?? "",
      bloodType: m.bloodType ?? "",
      allergies: m.allergies ?? "",
      medicalConditions: m.medicalConditions ?? "",
      notes: m.notes ?? "",
      addressLine1: m.addressLine1 ?? "",
      addressLine2: m.addressLine2 ?? "",
      city: m.city ?? "",
      state: m.state ?? "",
      postalCode: m.postalCode ?? "",
      country: m.country ?? "",
      latitude: m.latitude ?? null,
      longitude: m.longitude ?? null,
      formattedAddress: m.formattedAddress ?? "",
      placeId: m.placeId ?? "",
      useParentAddress: m.useParentAddress ?? false,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  }

  function handleAddressChange(rawText: string, structured?: StructuredAddress) {
    setForm(f => ({
      ...f,
      addressLine1: structured?.addressLine1 ?? rawText,
      addressLine2: structured?.addressLine2 ?? f.addressLine2,
      city: structured?.city ?? f.city,
      state: structured?.state ?? f.state,
      postalCode: structured?.postalCode ?? f.postalCode,
      country: structured?.country ?? f.country,
      latitude: structured?.latitude ?? null,
      longitude: structured?.longitude ?? null,
      formattedAddress: structured?.formattedAddress ?? rawText,
      placeId: structured?.placeId ?? "",
    }));
  }

  function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ title: "First and last name are required", variant: "destructive" });
      return;
    }
    const payload = {
      ...form,
      dateOfBirth: form.dateOfBirth || undefined,
      gender: form.gender || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      bloodType: form.bloodType || undefined,
      allergies: form.allergies || undefined,
      medicalConditions: form.medicalConditions || undefined,
      notes: form.notes || undefined,
      addressLine1: form.addressLine1 || undefined,
      addressLine2: form.addressLine2 || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      postalCode: form.postalCode || undefined,
      country: form.country || undefined,
      latitude: form.latitude ?? undefined,
      longitude: form.longitude ?? undefined,
      formattedAddress: form.formattedAddress || undefined,
      placeId: form.placeId || undefined,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      createMut.mutate(payload as any);
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <PageBreadcrumbs items={[{ label: "Family Members" }]} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Family Members
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage health profiles for your family and book appointments on their behalf.
            </p>
          </div>
          <Button onClick={openAdd} data-testid="button-add-family-member">
            <Plus className="h-4 w-4 mr-1" />
            Add Member
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : members.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No family members added yet.</p>
              <Button onClick={openAdd} variant="outline" className="mt-4" data-testid="button-add-first-member">
                Add your first member
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {members.filter(m => m.isActive).map(m => (
              <Card key={m.id} data-testid={`card-family-member-${m.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base leading-tight">
                          {m.firstName} {m.lastName}
                        </CardTitle>
                        <CardDescription>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {relLabel(m.relationship)}
                          </Badge>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="ghost" size="sm"
                        asChild
                        data-testid={`button-view-member-${m.id}`}
                      >
                        <Link href={`/family-members/${m.id}`}>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => openEdit(m)}
                        data-testid={`button-edit-member-${m.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(m)}
                        data-testid={`button-delete-member-${m.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    {m.dateOfBirth && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(m.dateOfBirth, { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                    )}
                    {m.bloodType && (
                      <span className="flex items-center gap-1.5">
                        <Heart className="h-3.5 w-3.5 text-red-500" />
                        {m.bloodType}
                      </span>
                    )}
                    {m.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        {m.phone}
                      </span>
                    )}
                    {m.email && (
                      <span className="flex items-center gap-1.5 truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{m.email}</span>
                      </span>
                    )}
                    {m.useParentAddress && (
                      <span className="flex items-center gap-1.5 col-span-2 text-xs">
                        <Home className="h-3.5 w-3.5 shrink-0" />
                        Uses your address
                      </span>
                    )}
                    {!m.useParentAddress && m.formattedAddress && (
                      <span className="flex items-center gap-1.5 col-span-2 text-xs truncate" data-testid={`text-address-${m.id}`}>
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{m.formattedAddress}</span>
                      </span>
                    )}
                    {!m.useParentAddress && !m.formattedAddress && m.addressLine1 && (
                      <span className="flex items-center gap-1.5 col-span-2 text-xs truncate" data-testid={`text-address-${m.id}`}>
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{[m.addressLine1, m.city].filter(Boolean).join(", ")}</span>
                      </span>
                    )}
                    {m.allergies && (
                      <span className="flex items-center gap-1.5 col-span-2">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="text-amber-700 dark:text-amber-400">Allergies: {m.allergies}</span>
                      </span>
                    )}
                    {m.medicalConditions && (
                      <span className="text-xs col-span-2 mt-1 text-muted-foreground">
                        Conditions: {m.medicalConditions}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Family Member" : "Add Family Member"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the health profile for this family member." : "Add a new health profile to your family."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fm-first">First Name *</Label>
                <Input id="fm-first" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} data-testid="input-fm-first-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fm-last">Last Name *</Label>
                <Input id="fm-last" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} data-testid="input-fm-last-name" />
              </div>
            </div>

            {/* Relationship / Gender */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Select value={form.relationship} onValueChange={v => setForm(f => ({ ...f, relationship: v }))}>
                  <SelectTrigger data-testid="select-fm-relationship">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map(r => (
                      <SelectItem key={r} value={r}>{relLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender || "__none__"} onValueChange={v => setForm(f => ({ ...f, gender: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-fm-gender">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not specified</SelectItem>
                    {GENDERS.map(g => (
                      <SelectItem key={g} value={g}>{g.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* DOB / Blood type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fm-dob">Date of Birth</Label>
                <Input id="fm-dob" type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} data-testid="input-fm-dob" />
              </div>
              <div className="space-y-1.5">
                <Label>Blood Type</Label>
                <Select value={form.bloodType || "__none__"} onValueChange={v => setForm(f => ({ ...f, bloodType: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-fm-blood-type">
                    <SelectValue placeholder="Unknown" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unknown</SelectItem>
                    {BLOOD_TYPES.map(bt => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Phone / Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fm-phone">Phone</Label>
                <Input id="fm-phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-fm-phone" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fm-email">Email</Label>
                <Input id="fm-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} data-testid="input-fm-email" />
              </div>
            </div>

            <Separator />

            {/* Address section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Home Address
                </Label>
              </div>

              <div className="flex items-center gap-2" data-testid="checkbox-fm-use-parent-address">
                <Checkbox
                  id="fm-use-parent"
                  checked={form.useParentAddress}
                  onCheckedChange={checked => setForm(f => ({ ...f, useParentAddress: checked === true }))}
                />
                <Label htmlFor="fm-use-parent" className="text-sm font-normal cursor-pointer">
                  Use my address for this family member
                </Label>
              </div>

              {!form.useParentAddress && (
                <div className="space-y-3 pl-0">
                  <div className="space-y-1.5">
                    <Label htmlFor="fm-address">Street Address</Label>
                    <PlacesAutocomplete
                      value={form.formattedAddress || form.addressLine1}
                      onChange={handleAddressChange}
                      placeholder="Search for an address…"
                      data-testid="input-fm-address"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fm-address2">Apt / Floor / Unit</Label>
                    <Input
                      id="fm-address2"
                      value={form.addressLine2}
                      onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))}
                      placeholder="e.g. Apt 4B"
                      data-testid="input-fm-address2"
                    />
                  </div>

                  {(form.city || form.postalCode) && (
                    <div className="grid grid-cols-2 gap-3">
                      {form.city && (
                        <div className="space-y-1.5">
                          <Label htmlFor="fm-city">City</Label>
                          <Input
                            id="fm-city"
                            value={form.city}
                            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                            data-testid="input-fm-city"
                          />
                        </div>
                      )}
                      {form.postalCode && (
                        <div className="space-y-1.5">
                          <Label htmlFor="fm-postal">Postal Code</Label>
                          <Input
                            id="fm-postal"
                            value={form.postalCode}
                            onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))}
                            data-testid="input-fm-postal"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Medical info */}
            <div className="space-y-1.5">
              <Label htmlFor="fm-allergies">Allergies</Label>
              <Input id="fm-allergies" value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} placeholder="e.g. penicillin, peanuts" data-testid="input-fm-allergies" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fm-conditions">Medical Conditions</Label>
              <Textarea id="fm-conditions" value={form.medicalConditions} onChange={e => setForm(f => ({ ...f, medicalConditions: e.target.value }))} placeholder="e.g. Type 2 diabetes, hypertension" rows={2} data-testid="input-fm-conditions" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fm-notes">Notes</Label>
              <Textarea id="fm-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any other relevant information" rows={2} data-testid="input-fm-notes" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving} data-testid="button-fm-cancel">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-fm-save">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Family Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {deleteTarget?.firstName} {deleteTarget?.lastName}? Their health profile will be deactivated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-delete-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              data-testid="button-delete-confirm"
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
