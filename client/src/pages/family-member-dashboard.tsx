import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { QK } from "@/lib/query-keys";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  UserCircle2, ArrowLeft, CalendarDays, FileText, ShieldCheck,
  Plus, Loader2, CheckCircle2, XCircle, ChevronRight, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return formatDate(new Date(d), { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return formatDateTime(new Date(d));
}

const CONSENT_LABELS: Record<string, string> = {
  terms_and_conditions: "family_consent_terms",
  privacy_policy: "family_consent_privacy",
  medical_data_processing: "family_consent_medical",
  treatment_consent: "family_consent_treatment",
  photo_consent: "family_consent_photo",
};


export default function FamilyMemberDashboard() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: members = [] } = useQuery<any[]>({ queryKey: QK.familyMembers() });
  const member = members.find((m: any) => m.id === id);

  const { data: appointments = [], isLoading: appsLoading } = useQuery<any[]>({
    queryKey: QK.familyMemberAppointments(id!),
    enabled: !!id,
  });

  const { data: documents = [], isLoading: docsLoading } = useQuery<any[]>({
    queryKey: QK.familyMemberDocuments(id!),
    enabled: !!id,
  });

  const { data: consents = [], isLoading: consentsLoading } = useQuery<any[]>({
    queryKey: QK.familyMemberConsents(id!),
    enabled: !!id,
  });

  const [addConsentType, setAddConsentType] = useState("");
  const [addingConsent, setAddingConsent] = useState(false);

  const addConsentMut = useMutation({
    mutationFn: (payload: { consentType: string; isAccepted: boolean }) =>
      apiRequest("POST", `/api/family-members/${id}/consents`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.familyMemberConsents(id!) });
      setAddingConsent(false);
      setAddConsentType("");
      toast({ title: t("patient_sweep.family_recorded", "Consent recorded") });
    },
    onError: (e: any) => toast({ title: t("common.error", "Failed"), description: e.message, variant: "destructive" }),
  });

  if (!member) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">{t("patient_sweep.family_loading", "Loading member profile…")}</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const initials = `${member.firstName?.[0] ?? ""}${member.lastName?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/family-members">
            <ArrowLeft className="h-4 w-4 mr-1" />{t("patient_sweep.family_back", "Back")}
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{member.firstName} {member.lastName}</h1>
          <div className="flex flex-wrap gap-2 mt-1">
            {member.relationship && (
              <Badge variant="secondary" className="capitalize text-xs">{member.relationship}</Badge>
            )}
            {member.dateOfBirth && (
              <span className="text-xs text-muted-foreground">
                {t("patient_sweep.family_dob", "DOB")}: {fmtDate(member.dateOfBirth)}
              </span>
            )}
            {member.bloodType && (
              <Badge variant="outline" className="text-xs">{member.bloodType}</Badge>
            )}
          </div>
        </div>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link href={`/book?familyMemberId=${id}`}>
              <CalendarDays className="h-4 w-4 mr-2" />{t("patient_sweep.family_book_appointment", "Book appointment")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Medical summary */}
      {(member.allergies || member.chronicConditions || member.notes) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />{t("patient_sweep.family_medical_summary", "Medical summary")}
            </p>
            {member.allergies && (
              <div className="text-sm"><span className="font-medium">{t("patient_sweep.family_allergies", "Allergies")}: </span>{member.allergies}</div>
            )}
            {member.chronicConditions && (
              <div className="text-sm"><span className="font-medium">{t("patient_sweep.family_conditions", "Chronic conditions")}: </span>{member.chronicConditions}</div>
            )}
            {member.notes && (
              <div className="text-sm"><span className="font-medium">{t("patient_sweep.family_notes", "Notes")}: </span>{member.notes}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="appointments">
        <TabsList className="w-full">
          <TabsTrigger value="appointments" className="flex-1">
            <CalendarDays className="h-4 w-4 mr-1.5" />{t("patient_sweep.family_appointments", "Appointments")}
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">
            <FileText className="h-4 w-4 mr-1.5" />{t("patient_sweep.family_documents", "Documents")}
          </TabsTrigger>
          <TabsTrigger value="consents" className="flex-1">
            <ShieldCheck className="h-4 w-4 mr-1.5" />{t("patient_sweep.family_consents", "Consents")}
          </TabsTrigger>
        </TabsList>

        {/* Appointments tab */}
        <TabsContent value="appointments" className="mt-4 space-y-3">
          {appsLoading && <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-6" />}
          {!appsLoading && appointments.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title={t("patient_sweep.family_no_appointments", "No appointments yet")}
              description={t("patient_sweep.family_no_appointments_desc", "{{name}} hasn't had any appointments yet.", { name: member.firstName })}
              action={{ label: t("patient_sweep.family_book_first", "Book first appointment"), onClick: () => { window.location.href = `/book?familyMemberId=${id}`; } }}
              data-testid="empty-appointments"
            />
          )}
          {appointments.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                   <p className="font-medium text-sm truncate">{a.service_name ?? a.serviceName ?? t("patient_sweep.family_appointment", "Appointment")}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(a.scheduledAt ?? a.scheduled_at)}
                    {(a.provider_first_name || a.providerFirstName) && (
                      <> · Dr. {a.provider_first_name ?? a.providerFirstName} {a.provider_last_name ?? a.providerLastName}</>
                    )}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents" className="mt-4 space-y-3">
          {docsLoading && <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-6" />}
          {!docsLoading && documents.length === 0 && (
            <EmptyState
              icon={FileText}
              title={t("patient_sweep.family_no_documents", "No documents yet")}
              description={t("patient_sweep.family_no_documents_desc", "No documents have been uploaded for {{name}}.", { name: member.firstName })}
              data-testid="empty-documents"
            />
          )}
          {documents.map((d: any) => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                   <p className="font-medium text-sm truncate">{d.title ?? d.fileName ?? t("patient_sweep.family_document", "Document")}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(d.createdAt ?? d.created_at)}</p>
                </div>
                {d.fileUrl && (
                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="shrink-0">
                       {t("patient_sweep.family_view", "View")} <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Consents tab */}
        <TabsContent value="consents" className="mt-4 space-y-3">
          {consentsLoading && <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-6" />}
          {!consentsLoading && consents.length === 0 && (
            <EmptyState
              icon={ShieldCheck}
              title={t("patient_sweep.family_no_consents", "No consents recorded")}
              description={t("patient_sweep.family_no_consents_desc", "No consent records have been created yet.")}
              data-testid="empty-consents"
            />
          )}
          {consents.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  {c.isAccepted
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  }
                  <div>
                    <p className="font-medium text-sm">
                      {CONSENT_LABELS[c.consentType]
                        ? t(`patient_sweep.${CONSENT_LABELS[c.consentType]}`, c.consentType)
                        : c.consentType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.isAccepted
                        ? t("patient_sweep.family_accepted", "Accepted")
                        : t("patient_sweep.family_declined", "Declined")} · {fmtDateTime(c.acceptedAt)}
                      {c.consentVersion && ` · v${c.consentVersion}`}
                    </p>
                  </div>
                </div>
                <Badge variant={c.isAccepted ? "default" : "destructive"} className="shrink-0 text-xs">
                  {c.isAccepted
                    ? t("patient_sweep.family_accepted", "Accepted")
                    : t("patient_sweep.family_declined", "Declined")}
                </Badge>
              </CardContent>
            </Card>
          ))}

          <Separator className="my-2" />

          {/* Add consent */}
          {addingConsent ? (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium">{t("patient_sweep.family_record_consent", "Record new consent")}</p>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={addConsentType}
                  onChange={e => setAddConsentType(e.target.value)}
                >
                  <option value="">{t("patient_sweep.family_select_consent", "Select consent type…")}</option>
                  {Object.entries(CONSENT_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!addConsentType || addConsentMut.isPending}
                    onClick={() => addConsentMut.mutate({ consentType: addConsentType, isAccepted: true })}
                    className="flex-1"
                  >
                    {addConsentMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                    {t("patient_sweep.family_accept", "Accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!addConsentType || addConsentMut.isPending}
                    onClick={() => addConsentMut.mutate({ consentType: addConsentType, isAccepted: false })}
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />{t("patient_sweep.family_decline", "Decline")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingConsent(false)}>{t("patient_sweep.family_cancel", "Cancel")}</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAddingConsent(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />{t("patient_sweep.family_record", "Record consent")}
            </Button>
          )}
        </TabsContent>
      </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
