import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateProviderProfile } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Loader2, Lock, Shield, ShieldCheck, AlertTriangle } from "lucide-react";

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateIBAN(raw: string, t: (key: string, fallback: string) => string): string | null {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (iban.length < 15 || iban.length > 34) return t("provider_dashboard.payout_iban_length", "IBAN must be 15–34 characters.");
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return t("provider_dashboard.payout_iban_format", "IBAN must start with a 2-letter country code followed by 2 digits then alphanumeric.");
  return null;
}

function validateRoutingNumber(raw: string, rail: string, t: (key: string, fallback: string) => string): string | null {
  const r = raw.replace(/\s+/g, "");
  if (rail === "ach") {
    if (!/^\d{9}$/.test(r)) return t("provider_dashboard.payout_ach_length", "US ACH routing number must be exactly 9 digits.");
    const d = r.split("").map(Number);
    const checksum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
    if (checksum % 10 !== 0) return t("provider_dashboard.payout_routing_checksum", "Routing number checksum is invalid.");
    return null;
  }
  if (rail === "swift") {
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(r.toUpperCase())) return t("provider_dashboard.payout_swift_length", "SWIFT/BIC must be 8 or 11 characters.");
    return null;
  }
  if (r.length < 4) return t("provider_dashboard.payout_routing_invalid", "Please enter a valid routing/sort code.");
  return null;
}

type BankDraft = {
  bankName: string;
  accountHolder: string;
  paymentRail: string;
  routingNumber: string;
  ibanNumber: string;
  swiftCode: string;
  accountNumber: string;
};

const EMPTY_DRAFT: BankDraft = {
  bankName: "",
  accountHolder: "",
  paymentRail: "ach",
  routingNumber: "",
  ibanNumber: "",
  swiftCode: "",
  accountNumber: "",
};

interface Props {
  providerData: any;
  isUnderReview?: boolean;
}

export function PayoutSettings({ providerData, isUnderReview = false }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [draft, setDraft] = useState<BankDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<keyof BankDraft, string>>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (providerData) {
      setDraft({
        bankName: providerData.bankName || "",
        accountHolder: providerData.accountHolder || "",
        paymentRail: providerData.paymentRail || "ach",
        routingNumber: providerData.routingNumber || "",
        ibanNumber: providerData.ibanNumber || "",
        swiftCode: providerData.swiftCode || "",
        accountNumber: providerData.accountNumber || "",
      });
    }
  }, [providerData]);

  const set = (k: keyof BankDraft, v: string) => {
    setDraft((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
    setSaved(false);
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof BankDraft, string>> = {};

    if (!draft.bankName.trim()) errs.bankName = t("provider_dashboard.payout_bank_required", "Bank name is required.");
    if (!draft.accountHolder.trim()) errs.accountHolder = t("provider_dashboard.payout_holder_required", "Account holder name is required.");
    if (!draft.accountNumber.trim()) errs.accountNumber = t("provider_dashboard.payout_account_required", "Account number is required.");

    const useIBAN = ["sepa", "iban"].includes(draft.paymentRail);
    const useSwift = draft.paymentRail === "swift";
    const useAch = draft.paymentRail === "ach";

    if (useIBAN) {
      const ibanErr = validateIBAN(draft.ibanNumber, t);
      if (ibanErr) errs.ibanNumber = ibanErr;
    } else if (useSwift || useAch) {
      const routeField = useSwift ? draft.swiftCode : draft.routingNumber;
      const routeErr = validateRoutingNumber(routeField, useSwift ? "swift" : "ach", t);
      if (routeErr) {
        if (useSwift) errs.swiftCode = routeErr;
        else errs.routingNumber = routeErr;
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/setup", {
        bankName: draft.bankName.trim(),
        accountHolder: draft.accountHolder.trim(),
        paymentRail: draft.paymentRail,
        routingNumber: draft.routingNumber.trim(),
        ibanNumber: draft.ibanNumber.replace(/\s+/g, "").toUpperCase(),
        swiftCode: draft.swiftCode.trim().toUpperCase(),
        accountNumber: draft.accountNumber.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      void invalidateProviderProfile();
      setSaved(true);
      toast({ title: t("provider_dashboard.payout_saved", "Banking details saved"), description: t("provider_dashboard.payout_saved_desc", "Your settlement account has been updated.") });
    },
    onError: (e: any) => {
      toast({ title: t("provider_dashboard.save_failed", "Save failed"), description: e?.message || t("provider_dashboard.try_again", "Please try again."), variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!validate()) return;
    saveMut.mutate();
  };

  const useIBAN = ["sepa", "iban"].includes(draft.paymentRail);
  const useSwift = draft.paymentRail === "swift";
  const routingLabel = useSwift ? t("provider_dashboard.payout_swift_label", "SWIFT / BIC Code") : draft.paymentRail === "ach" ? t("provider_dashboard.payout_ach_label", "ACH Routing Number (9 digits)") : t("provider_dashboard.payout_sort_label", "Sort / Routing Code");
  const routingField: keyof BankDraft = useSwift ? "swiftCode" : "routingNumber";

  const isLocked = isUnderReview;

  return (
    <Card data-testid="card-payout-settings">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t("provider_dashboard.payout_title", "Banking & Settlement Account")}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("provider_dashboard.payout_desc", "Define your external bank account for payouts. Field requirements adapt to your selected payment rail.")}
            </CardDescription>
          </div>
          {isLocked ? (
            <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
              <Lock className="h-3 w-3" /> {t("provider_dashboard.read_only", "Read-only")}
            </Badge>
          ) : saved ? (
            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 flex items-center gap-1 shrink-0">
              <ShieldCheck className="h-3 w-3" /> {t("provider_dashboard.saved", "Saved")}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLocked && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t("provider_dashboard.payout_locked_review", "Your profile is currently under compliance review. Banking details are locked until review is complete.")}</span>
          </div>
        )}

        {/* Payment rail */}
        <div className="space-y-1.5">
          <Label className="text-xs">{t("provider_dashboard.payout_rail", "Payment rail / region")}</Label>
          <Select value={draft.paymentRail} onValueChange={(v) => set("paymentRail", v)} disabled={isLocked}>
            <SelectTrigger data-testid="select-payment-rail">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ach">{t("provider_dashboard.payout_rail_ach", "US ACH (Routing number)")}</SelectItem>
              <SelectItem value="sepa">{t("provider_dashboard.payout_rail_sepa", "SEPA / European (IBAN)")}</SelectItem>
              <SelectItem value="iban">{t("provider_dashboard.payout_rail_iban", "International IBAN")}</SelectItem>
              <SelectItem value="swift">{t("provider_dashboard.payout_rail_swift", "SWIFT / Wire Transfer")}</SelectItem>
              <SelectItem value="other">{t("provider_dashboard.payout_rail_other", "Other / Manual")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Bank name */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("provider_dashboard.payout_bank_name", "Bank name")}</Label>
            <Input
              value={draft.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              placeholder={t("provider_dashboard.payout_bank_placeholder", "e.g. OTP Bank, Chase, HSBC")}
              disabled={isLocked}
              data-testid="input-bank-name"
            />
            {errors.bankName && <p className="text-xs text-destructive">{errors.bankName}</p>}
          </div>

          {/* Account holder */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("provider_dashboard.payout_holder_name", "Account holder name")}</Label>
            <Input
              value={draft.accountHolder}
              onChange={(e) => set("accountHolder", e.target.value)}
              placeholder={t("provider_dashboard.payout_holder_placeholder", "Full legal name on account")}
              disabled={isLocked}
              data-testid="input-account-holder"
            />
            {errors.accountHolder && <p className="text-xs text-destructive">{errors.accountHolder}</p>}
          </div>

          {/* Account number */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("provider_dashboard.payout_account_number", "Account number")}</Label>
            <Input
              value={draft.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              placeholder={t("provider_dashboard.payout_account_placeholder", "Bank account number")}
              autoComplete="off"
              disabled={isLocked}
              data-testid="input-account-number"
            />
            {errors.accountNumber && <p className="text-xs text-destructive">{errors.accountNumber}</p>}
          </div>

          {/* Routing / IBAN / SWIFT */}
          {useIBAN ? (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("provider_sweep.iban", "IBAN")}</Label>
              <Input
                value={draft.ibanNumber}
                onChange={(e) => set("ibanNumber", e.target.value)}
                placeholder={t("provider_dashboard.payout_iban_placeholder", "e.g. HU42 1177 3016 1111 1018 0000 0000")}
                autoComplete="off"
                disabled={isLocked}
                data-testid="input-iban"
              />
              {errors.ibanNumber && <p className="text-xs text-destructive">{errors.ibanNumber}</p>}
            </div>
          ) : draft.paymentRail !== "other" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">{routingLabel}</Label>
              <Input
                value={draft[routingField] as string}
                onChange={(e) => set(routingField, e.target.value)}
                placeholder={useSwift ? t("provider_dashboard.payout_swift_placeholder", "e.g. OTPVHUHB") : t("provider_dashboard.payout_routing_placeholder", "9-digit routing number")}
                autoComplete="off"
                disabled={isLocked}
                data-testid={`input-routing-${draft.paymentRail}`}
              />
              {(errors[routingField]) && <p className="text-xs text-destructive">{errors[routingField]}</p>}
            </div>
          ) : null}
        </div>

        <Separator />

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={isLocked || saveMut.isPending}
            data-testid="button-save-banking"
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
            {t("provider_dashboard.payout_save", "Save banking details")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("provider_dashboard.payout_secure_note", "Stored securely. Used only for payout processing.")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
