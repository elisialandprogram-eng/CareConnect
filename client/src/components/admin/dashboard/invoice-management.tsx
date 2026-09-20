import { formatDate } from "@/lib/datetime";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAdminCurrency, formatInCurrency } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Settings, Plus, Save, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

function InvoiceTemplateEditor() {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) =>
    String(t(`admin_extra.invoice.${key}`, { defaultValue: fallback }));
  const { toast } = useToast();
  const { data: template, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/invoice-template"],
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewBust, setPreviewBust] = useState(0);

  useEffect(() => {
    if (template && Object.keys(form).length === 0) {
      setForm({ ...template });
    }
  }, [template]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/invoice-template", form);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: tr("saved", "Invoice template saved") });
      setForm({ ...data });
      queryClient.setQueryData(["/api/admin/invoice-template"], data);
      setPreviewBust((n) => n + 1);
    },
    onError: (e: any) =>
      toast({
        title: tr("save_failed", "Save failed"),
        description: e?.message,
        variant: "destructive",
      }),
  });

  const refreshPreview = async () => {
    try {
      const res = await apiRequest(
        "POST",
        "/api/admin/invoice-template/preview",
        form,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: any) {
      toast({
        title: tr("preview_failed", "Preview failed"),
        description: e?.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const FIELDS: Array<{
    key: string;
    label: string;
    type?: "text" | "textarea" | "color" | "url";
    placeholder?: string;
    help?: string;
  }> = [
    { key: "companyName", label: tr("company_name", "Company name"), placeholder: "Golden Life" },
    {
      key: "tagline",
      label: tr("tagline", "Tagline / subtitle"),
      placeholder: "Quality healthcare delivered.",
    },
    { key: "brandColorHex", label: tr("brand_color", "Brand color"), type: "color" },
    { key: "accentColorHex", label: tr("accent_color", "Accent color"), type: "color" },
    { key: "addressLine1", label: tr("address_line_1", "Address line 1"), placeholder: "123 Main St" },
    { key: "addressLine2", label: tr("address_line_2", "Address line 2"), placeholder: "Suite 200" },
    { key: "city", label: tr("city", "City"), placeholder: "Budapest" },
    { key: "country", label: tr("country", "Country"), placeholder: "Hungary" },
    {
      key: "email",
      label: tr("billing_email", "Billing email"),
      placeholder: "billing@goldenlife.health",
    },
    { key: "phone", label: tr("phone", "Phone"), placeholder: "+36 1 234 5678" },
    { key: "website", label: tr("website", "Website"), placeholder: "goldenlife.health" },
    { key: "taxId", label: tr("tax_id", "Tax ID / VAT number"), placeholder: "HU12345678" },
    {
      key: "footerText",
      label: tr("footer_text", "Footer text"),
      type: "textarea",
      placeholder: "Thank you for choosing…",
    },
    {
      key: "paymentInstructions",
      label: tr("payment_instructions", "Payment instructions"),
      type: "textarea",
      placeholder: "Pay via the My Invoices section…",
    },
    {
      key: "termsText",
      label: tr("terms_text", "Terms text"),
      type: "textarea",
      placeholder: "Payment is due within 7 days…",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-medium">{tr("title", "Invoice template")}</h3>
          <p className="text-sm text-muted-foreground">
            {tr("description", "Customize the company details, branding, and footer that appear on every generated invoice PDF.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refreshPreview}
            data-testid="button-invoice-template-preview"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            {tr("preview_pdf", "Preview PDF")}
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            data-testid="button-invoice-template-save"
          >
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {tr("save_changes", "Save changes")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6 flex-wrap">
            <div className="flex-shrink-0">
              <Label className="text-sm font-medium block mb-2">{tr("logo", "Logo")}</Label>
              <div
                className="h-28 w-28 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden"
                data-testid="preview-tpl-logo"
              >
                {form.logoUrl ? (
                  <img
                    src={form.logoUrl}
                    alt="Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground text-center px-2">
                     {tr("no_logo", "No logo")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-[240px] space-y-2">
               <Label className="text-sm font-medium">{tr("upload_logo", "Upload logo")}</Label>
              <p className="text-xs text-muted-foreground">
                 {tr("upload_logo_help", "PNG or JPEG, ideally square. Max 1 MB. Shown at the top-left of every invoice.")}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1024 * 1024) {
                      toast({
                         title: tr("logo_too_large", "Logo too large"),
                         description: tr("logo_too_large_desc", "Please choose an image under 1 MB."),
                        variant: "destructive",
                      });
                      e.target.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = String(reader.result || "");
                      set("logoUrl", dataUrl);
                    };
                    reader.onerror = () => {
                      toast({
                         title: tr("read_failed", "Could not read file"),
                        variant: "destructive",
                      });
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                  className="max-w-xs"
                  data-testid="input-tpl-logo-file"
                />
                {form.logoUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => set("logoUrl", "")}
                    data-testid="button-tpl-logo-remove"
                  >
                     {tr("remove", "Remove")}
                  </Button>
                )}
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                   {tr("paste_url", "Or paste a hosted URL")}
                </summary>
                <Input
                  type="url"
                  value={
                    form.logoUrl?.startsWith("data:")
                      ? ""
                      : (form.logoUrl ?? "")
                  }
                  onChange={(e) => set("logoUrl", e.target.value)}
                  placeholder="https://…/logo.png"
                  className="mt-2"
                  data-testid="input-tpl-logo-url"
                />
              </details>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {FIELDS.map((f) => (
            <div
              key={f.key}
              className={
                f.type === "textarea" ? "md:col-span-2 space-y-1.5" : "space-y-1.5"
              }
            >
              <Label htmlFor={`tpl-${f.key}`}>{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={`tpl-${f.key}`}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={2}
                  data-testid={`input-tpl-${f.key}`}
                />
              ) : f.type === "color" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id={`tpl-${f.key}`}
                    value={form[f.key] || "#000000"}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="h-9 w-12 rounded border bg-transparent cursor-pointer"
                    data-testid={`color-tpl-${f.key}`}
                  />
                  <Input
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder="#C9A227"
                    className="font-mono"
                    data-testid={`input-tpl-${f.key}`}
                  />
                </div>
              ) : (
                <Input
                  id={`tpl-${f.key}`}
                  type={f.type === "url" ? "url" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  data-testid={`input-tpl-${f.key}`}
                />
              )}
              {f.help && (
                <p className="text-xs text-muted-foreground">{f.help}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
         {tr("tip", "Tip: Click")} <strong>{tr("preview_pdf", "Preview PDF")}</strong> {tr("tip_suffix", "to open a sample invoice with the current (unsaved) values in a new tab.")}
      </p>
      {previewBust > 0 && null}
    </div>
  );
}

export function InvoiceManagement() {
  const { format: fmtMoney } = useAdminCurrency();
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    data: invoices,
    isLoading,
    refetch,
  } = useQuery<any[]>({
    queryKey: ["/api/admin/invoices"],
  });

  const generatePendingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/admin/invoices/generate-pending",
        {},
      );
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.pending_invoices_generated") });
      refetch();
    },
  });

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );

  return (
    <Tabs defaultValue="list" className="space-y-6">
      <TabsList className="tabs-colorful">
        <TabsTrigger value="list" data-testid="tab-invoice-list">
          <FileText className="h-4 w-4 mr-1.5" />
          {t("admin_extra.invoice.invoices", "Invoices")}
        </TabsTrigger>
        <TabsTrigger value="template" data-testid="tab-invoice-template">
          <Settings className="h-4 w-4 mr-1.5" />
          {t("admin_extra.invoice.template", "Template")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="template">
        <InvoiceTemplateEditor />
      </TabsContent>

      <TabsContent value="list" className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">
              {t("admin_dashboard.invoice_management")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin_dashboard.invoice_management_desc")}
            </p>
          </div>
          <Button
            onClick={() => generatePendingMutation.mutate()}
            disabled={generatePendingMutation.isPending}
            data-testid="button-generate-pending-invoices"
          >
            {generatePendingMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {t("admin_dashboard.generate_pending")}
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium">
                      {t("admin_dashboard.invoice_number")}
                    </th>
                    <th className="h-10 px-4 text-left font-medium">
                      {t("admin_dashboard.date")}
                    </th>
                    <th className="h-10 px-4 text-left font-medium">
                      {t("admin_dashboard.amount")}
                    </th>
                    <th className="h-10 px-4 text-left font-medium">
                      {t("admin_dashboard.status")}
                    </th>
                    <th className="h-10 px-4 text-right font-medium">
                      {t("admin_dashboard.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices?.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-8 text-center text-muted-foreground"
                      >
                        {t("admin_dashboard.no_invoices")}
                      </td>
                    </tr>
                  ) : (
                    invoices?.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="border-b last:border-0"
                        data-testid={`row-invoice-${invoice.id}`}
                      >
                        <td className="p-4 font-medium">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="p-4">
                          {formatDate(invoice.issueDate)}
                        </td>
                        <td className="p-4">{formatInCurrency(Number(invoice.totalAmount || 0), invoice.countryCode === "IR" ? "IRR" : invoice.countryCode === "HU" ? "HUF" : "USD")}</td>
                        <td className="p-4">
                          <Badge
                            variant={
                              invoice.status === "paid" ? "default" : "secondary"
                            }
                          >
                             {String(t(`admin_extra.invoice.status_${invoice.status}`, invoice.status))}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={`/api/invoices/${invoice.id}/download`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                               {t("admin_extra.invoice.pdf", "PDF")}
                            </a>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
