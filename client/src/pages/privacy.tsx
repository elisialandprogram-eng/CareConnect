import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

export default function Privacy() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <PageBreadcrumbs items={[{ label: t("common.privacy_policy") }]} />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">{t("public_pages.privacy_title")}</h1>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Golden Life</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 [&_p+p]:mt-2 [&_section]:leading-relaxed">
            
            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_controller")}</h2>
              <div className="space-y-1 text-muted-foreground">
                <p><strong>Golden Life</strong></p>
                <p>Hungary, 3060 Pásztó, Semmelweis utca 10</p>
                <p>Email: Info@GoldenLife.Health, Admin@GoldenLife.Health</p>
                <p>Phone: +36702370103</p>
              </div>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_categories")}</h2>
              
              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_personal")}</h3>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mb-4">
                <li>Full name</li>
                <li>Phone number</li>
                <li>Email address</li>
                <li>Appointment details</li>
                <li>Payment details</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_sensitive")}</h3>
              <p className="text-muted-foreground mb-4">
                Health-related information voluntarily provided by the User. Stored and transmitted using encryption.
              </p>

              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_technical")}</h3>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>IP address</li>
                <li>Browser information</li>
                <li>Device data</li>
                <li>Cookies (see Cookie Policy below)</li>
                <li>System logs</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_purpose")}</h2>
              <p className="text-muted-foreground mb-2">We process personal data to:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>manage appointments</li>
                <li>send confirmations and notifications</li>
                <li>facilitate payments</li>
                <li>provide customer support</li>
                <li>send marketing emails/newsletters (with consent)</li>
                <li>improve system security</li>
                <li>fulfil legal obligations</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_basis")}</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Contract performance (GDPR 6(1)(b))</li>
                <li>Consent (GDPR 6(1)(a))</li>
                <li>Legal obligations (GDPR 6(1)(c))</li>
                <li>Legitimate interest (GDPR 6(1)(f))</li>
                <li>Health data processing: explicit consent (GDPR 9(2)(a))</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_retention")}</h2>
              <p className="text-muted-foreground mb-3">We retain your data only as long as necessary for the stated purpose or as required by law. Specific retention windows are listed below:</p>
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium">Data Category</th>
                      <th className="text-left py-2 font-medium">Retention Period</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50"><td className="py-2 pr-4">Account and appointment data</td><td className="py-2">5 years after last activity, or longer if legally required</td></tr>
                    <tr className="border-b border-border/50"><td className="py-2 pr-4">Health and medical records</td><td className="py-2">8 years (Hungarian health records law); may vary by jurisdiction</td></tr>
                    <tr className="border-b border-border/50"><td className="py-2 pr-4">In-app notifications</td><td className="py-2">90 days, then automatically deleted</td></tr>
                    <tr className="border-b border-border/50"><td className="py-2 pr-4">System and audit logs</td><td className="py-2">180 days (audit logs), 90 days (system events)</td></tr>
                    <tr className="border-b border-border/50"><td className="py-2 pr-4">Payment and transaction records</td><td className="py-2">8 years (accounting obligations)</td></tr>
                    <tr className="border-b border-border/50"><td className="py-2 pr-4">Marketing consent</td><td className="py-2">Until withdrawn by the user</td></tr>
                    <tr className="border-b border-border/50"><td className="py-2 pr-4">Session cookies</td><td className="py-2">Deleted when the browser closes</td></tr>
                    <tr><td className="py-2 pr-4">Persistent cookies and preferences</td><td className="py-2">Up to 12 months</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground text-sm">You may request deletion of your personal data at any time (see Section 8 — Your Rights). Deletion requests are processed within 30 days, subject to legal retention obligations.</p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_transfers")}</h2>
              <p className="text-muted-foreground mb-4">We transfer data only to:</p>
              
              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_internal")}</h3>
              <p className="text-muted-foreground mb-4">Golden Life Workers (appointment-related data only)</p>

              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_external")}</h3>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Hosting provider</li>
                <li>Cloud server provider</li>
                <li>Email service</li>
                <li>SMS provider</li>
                <li>CRM system</li>
                <li>Payment provider</li>
                <li>Backup storage</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                Standard contractual clauses (GDPR Article 28) apply.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_rights")}</h2>
              <p className="text-muted-foreground mb-2">Users may request:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>access,</li>
                <li>correction,</li>
                <li>deletion,</li>
                <li>restriction,</li>
                <li>portability,</li>
                <li>objection,</li>
                <li>consent withdrawal (especially for health data & marketing).</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                Requests: Info@GoldenLife.Health or Admin@GoldenLife.Health
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_security")}</h2>
              <p className="text-muted-foreground mb-2">Golden Life uses:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>encrypted storage</li>
                <li>SSL/HTTPS</li>
                <li>strict access controls</li>
                <li>regular audits</li>
                <li>firewalls and intrusion monitoring</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                Health data receives the highest level of protection.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_marketing")}</h2>
              <p className="text-muted-foreground mb-2">
                Users may receive promotional or marketing emails only if they give consent.
              </p>
              <p className="text-muted-foreground">
                Users may unsubscribe at any time via email link or by sending a request to Info@GoldenLife.Health or Admin@GoldenLife.Health
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_complaints")}</h2>
              <p className="text-muted-foreground mb-2">Users may lodge complaints with:</p>
              <p className="text-muted-foreground">
                <strong>NAIH – Hungarian Data Protection Authority</strong><br />
                Website: <a href="https://naih.hu" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">https://naih.hu</a>
              </p>
            </section>

          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t("public_pages.privacy_cookie_title")}</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert space-y-6">
            
            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_cookie_what")}</h2>
              <p className="text-muted-foreground">
                Cookies are small files stored on the User's device to improve functionality, security, and user experience.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_cookie_types")}</h2>
              
              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_cookie_necessary")}</h3>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mb-4">
                <li>session cookies</li>
                <li>security cookies</li>
                <li>booking system cookies</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_cookie_performance")}</h3>
              <p className="text-muted-foreground mb-4">Used for analytics purposes.</p>

              <h3 className="text-lg font-medium mb-2">{t("public_pages.privacy_cookie_marketing")}</h3>
              <p className="text-muted-foreground">Used only with consent.</p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_cookie_duration")}</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Session cookies: deleted when browser closes</li>
                <li>Persistent cookies: stored for up to 12–24 months</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">{t("public_pages.privacy_cookie_consent")}</h2>
              <p className="text-muted-foreground mb-2">Upon first visit, Users see a cookie banner allowing:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>accept all,</li>
                <li>accept necessary only,</li>
                <li>customize preferences.</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                Consent can be withdrawn anytime.
              </p>
            </section>

          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
