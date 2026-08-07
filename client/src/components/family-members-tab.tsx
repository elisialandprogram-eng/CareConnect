import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import {
  Baby,
  Calendar,
  Heart,
  Mail,
  Pencil,
  Phone,
  Plus,
  Stethoscope,
  Trash2,
  UserCircle2,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FamilyMember } from "@shared/schema";

type FormState = {
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  bloodType: string;
  allergies: string;
  medicalConditions: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  firstName: "",
  lastName: "",
  relationship: "child",
  dateOfBirth: "",
  gender: "",
  phone: "",
  email: "",
  bloodType: "",
  allergies: "",
  medicalConditions: "",
  notes: "",
});

const RELATIONSHIPS = [
  "spouse",
  "child",
  "parent",
  "sibling",
  "grandparent",
  "grandchild",
  "other",
];

function calcAge(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
}

function relationshipIcon(rel: string) {
  switch (rel) {
    case "child":
    case "grandchild":
      return Baby;
    case "spouse":
      return Heart;
    case "parent":
    case "grandparent":
      return UserCircle2;
    default:
      return Users;
  }
}

export function FamilyMembersTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery<FamilyMember[]>({
    queryKey: ["/api/family-members"],
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/family-members/${editingId}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/family-members", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-members"] });
      toast({
        title: editingId
          ? t("family.updated_title", "Family member updated")
          : t("family.added_title", "Family member added"),
      });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: (err: any) => {
      toast({
        title: t("family.save_failed", "Could not save family member"),
        description: err?.message || "",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/family-members/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-members"] });
      toast({ title: t("family.removed", "Family member removed") });
      setConfirmDeleteId(null);
    },
    onError: (err: any) => {
      toast({
        title: t("family.remove_failed", "Could not remove family member"),
        description: err?.message || "",
        variant: "destructive",
      });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (m: FamilyMember) => {
    setEditingId(m.id);
    setForm({
      firstName: m.firstName,
      lastName: m.lastName,
      relationship: m.relationship,
      dateOfBirth: m.dateOfBirth || "",
      gender: m.gender || "",
      phone: m.phone || "",
      email: m.email || "",
      bloodType: m.bloodType || "",
      allergies: m.allergies || "",
      medicalConditions: m.medicalConditions || "",
      notes: m.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({
        title: t("family.name_required", "Name is required"),
        variant: "destructive",
      });
      return;
    }
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      relationship: form.relationship,
      dateOfBirth: form.dateOfBirth || undefined,
      gender: form.gender || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      bloodType: form.bloodType || undefined,
      allergies: form.allergies.trim() || undefined,
      medicalConditions: form.medicalConditions.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    saveMutation.mutate(payload);
  };

  const bookFor = (m: FamilyMember) => {
    navigate(`/providers?for=${m.id}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {t("family.title", "Family profiles")}
              </CardTitle>
              <CardDescription>
                {t(
                  "family.subtitle",
                  "Manage profiles for the people you care for and book appointments on their behalf."
                )}
              </CardDescription>
            </div>
            <Button onClick={openAdd} size="sm" data-testid="button-add-family-member">
              <Plus className="h-4 w-4 mr-1" />
              {t("family.add_member", "Add member")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!members || members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  "family.empty",
                  "You haven't added any family members yet."
                )}
              </p>
              <Button onClick={openAdd} data-testid="button-add-first-family-member">
                <Plus className="h-4 w-4 mr-1" />
                {t("family.add_first", "Add your first family member")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {members.map((m) => {
                const Icon = relationshipIcon(m.relationship);
                const age = calcAge(m.dateOfBirth);
                return (
                  <div
                    key={m.id}
                    className="rounded-xl border bg-card p-4 hover-elevate transition-all"
                    data-testid={`card-family-member-${m.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">
                              {m.firstName} {m.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {t(`family.rel.${m.relationship}`, m.relationship)}
                              {age != null && (
                                <>
                                  {" · "}
                                  {t("family.age_years", { count: age, defaultValue: "{{count}} yrs" })}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => openEdit(m)}
                              data-testid={`button-edit-family-${m.id}`}
                              aria-label={t("common.edit", "Edit")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setConfirmDeleteId(m.id)}
                              data-testid={`button-delete-family-${m.id}`}
                              aria-label={t("common.delete", "Delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          {m.bloodType && (
                            <Badge variant="outline" className="px-1.5 h-5">
                              {m.bloodType}
                            </Badge>
                          )}
                          {m.gender && (
                            <Badge variant="outline" className="px-1.5 h-5 capitalize">
                              {t(`family.gender.${m.gender}`, m.gender)}
                            </Badge>
                          )}
                          {m.allergies && (
                            <Badge variant="outline" className="px-1.5 h-5 text-amber-700 border-amber-300 dark:text-amber-300">
                              {t("family.allergies_short", "Allergies")}
                            </Badge>
                          )}
                        </div>

                        {(m.phone || m.email) && (
                          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                            {m.phone && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="h-3 w-3" />
                                {m.phone}
                              </div>
                            )}
                            {m.email && (
                              <div className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{m.email}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {m.medicalConditions && (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                            <span className="font-medium">
                              {t("family.conditions", "Conditions")}:
                            </span>{" "}
                            {m.medicalConditions}
                          </p>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 w-full"
                          onClick={() => bookFor(m)}
                          data-testid={`button-book-family-${m.id}`}
                        >
                          <Calendar className="h-3.5 w-3.5 mr-1.5" />
                          {t("family.book_for", "Book appointment")}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDialogOpen(false);
            setEditingId(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("family.edit_title", "Edit family member")
                : t("family.add_title", "Add family member")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "family.dialog_desc",
                "Add details so providers have the right information when you book on their behalf."
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fm-fn">{t("family.first_name", "First name")}*</Label>
                <Input
                  id="fm-fn"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                  data-testid="input-family-first-name"
                />
              </div>
              <div>
                <Label htmlFor="fm-ln">{t("family.last_name", "Last name")}*</Label>
                <Input
                  id="fm-ln"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                  data-testid="input-family-last-name"
                />
              </div>
              <div>
                <Label htmlFor="fm-rel">{t("family.relationship", "Relationship")}*</Label>
                <Select
                  value={form.relationship}
                  onValueChange={(v) => setForm({ ...form, relationship: v })}
                >
                  <SelectTrigger id="fm-rel" data-testid="select-family-relationship">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map((rel) => (
                      <SelectItem key={rel} value={rel}>
                        {t(`family.rel.${rel}`, rel)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fm-dob">{t("family.date_of_birth", "Date of birth")}</Label>
                <Input
                  id="fm-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                  data-testid="input-family-dob"
                />
              </div>
              <div>
                <Label htmlFor="fm-gender">{t("family.gender_label", "Gender")}</Label>
                <Select
                  value={form.gender || "unspecified"}
                  onValueChange={(v) => setForm({ ...form, gender: v === "unspecified" ? "" : v })}
                >
                  <SelectTrigger id="fm-gender" data-testid="select-family-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">
                      {t("family.gender.unspecified", "Prefer not to say")}
                    </SelectItem>
                    <SelectItem value="female">
                      {t("family.gender.female", "Female")}
                    </SelectItem>
                    <SelectItem value="male">
                      {t("family.gender.male", "Male")}
                    </SelectItem>
                    <SelectItem value="other">
                      {t("family.gender.other", "Other")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fm-blood">{t("family.blood_type", "Blood type")}</Label>
                <Select
                  value={form.bloodType || "unknown"}
                  onValueChange={(v) => setForm({ ...form, bloodType: v === "unknown" ? "" : v })}
                >
                  <SelectTrigger id="fm-blood" data-testid="select-family-blood">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">
                      {t("family.blood_unknown", "Unknown")}
                    </SelectItem>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fm-phone">{t("family.phone", "Phone")}</Label>
                <Input
                  id="fm-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  data-testid="input-family-phone"
                />
              </div>
              <div>
                <Label htmlFor="fm-email">{t("family.email", "Email")}</Label>
                <Input
                  id="fm-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  data-testid="input-family-email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="fm-allergies">{t("family.allergies", "Allergies")}</Label>
              <Textarea
                id="fm-allergies"
                rows={2}
                placeholder={t("family.allergies_placeholder", "e.g., penicillin, peanuts…")}
                value={form.allergies}
                onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                data-testid="input-family-allergies"
              />
            </div>
            <div>
              <Label htmlFor="fm-conditions">
                {t("family.conditions_label", "Medical conditions")}
              </Label>
              <Textarea
                id="fm-conditions"
                rows={2}
                placeholder={t(
                  "family.conditions_placeholder",
                  "e.g., asthma, diabetes…"
                )}
                value={form.medicalConditions}
                onChange={(e) =>
                  setForm({ ...form, medicalConditions: e.target.value })
                }
                data-testid="input-family-conditions"
              />
            </div>
            <div>
              <Label htmlFor="fm-notes">{t("family.notes", "Notes")}</Label>
              <Textarea
                id="fm-notes"
                rows={2}
                placeholder={t(
                  "family.notes_placeholder",
                  "Anything else providers should know…"
                )}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                data-testid="input-family-notes"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingId(null);
                  setForm(emptyForm());
                }}
                data-testid="button-cancel-family"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-family"
              >
                <Stethoscope className="h-4 w-4 mr-1.5" />
                {saveMutation.isPending
                  ? t("family.saving", "Saving…")
                  : editingId
                    ? t("family.save_changes", "Save changes")
                    : t("family.save_member", "Add member")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("family.confirm_delete_title", "Remove this family member?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "family.confirm_delete_desc",
                "This won't cancel any appointments already booked, but you won't be able to book new ones for this person."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-family">
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              data-testid="button-confirm-delete-family"
            >
              {t("common.remove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
