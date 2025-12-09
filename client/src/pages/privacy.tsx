import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy (GDPR)</h1>
        
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Golden Life</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert space-y-6">
            
            <section>
              <h2 className="text-xl font-semibold mb-4">1. Data Controller</h2>
              <div className="space-y-1 text-muted-foreground">
                <p><strong>Golden Life</strong></p>
                <p>Hungary, 3060 Pásztó, Semmelweis utca 10</p>
                <p>Email: Info@GoldenLife.Health, Admin@GoldenLife.Health</p>
                <p>Phone: +36702370103</p>
              </div>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">2. Categories of Processed Data</h2>
              
              <h3 className="text-lg font-medium mb-2">Personal Data</h3>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mb-4">
                <li>Full name</li>
                <li>Phone number</li>
                <li>Email address</li>
                <li>Appointment details</li>
                <li>Payment details</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">Sensitive Data (GDPR Article 9)</h3>
              <p className="text-muted-foreground mb-4">
                Health-related information voluntarily provided by the User. Stored and transmitted using encryption.
              </p>

              <h3 className="text-lg font-medium mb-2">Technical Data</h3>
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
              <h2 className="text-xl font-semibold mb-4">3. Purpose of Processing</h2>
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
              <h2 className="text-xl font-semibold mb-4">4. Legal Basis</h2>
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
              <h2 className="text-xl font-semibold mb-4">5. Retention Period</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Minimum 5 years, or longer if legally required</li>
                <li>Marketing consent remains valid until withdrawn</li>
                <li>Logs and cookies: per Cookie Policy</li>
                <li>Backups: stored according to retention policies</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">6. Data Transfers</h2>
              <p className="text-muted-foreground mb-4">We transfer data only to:</p>
              
              <h3 className="text-lg font-medium mb-2">Internal</h3>
              <p className="text-muted-foreground mb-4">Golden Life Workers (appointment-related data only)</p>

              <h3 className="text-lg font-medium mb-2">External Processors</h3>
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
              <h2 className="text-xl font-semibold mb-4">7. User Rights</h2>
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
              <h2 className="text-xl font-semibold mb-4">8. Security Measures</h2>
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
              <h2 className="text-xl font-semibold mb-4">9. Marketing Emails</h2>
              <p className="text-muted-foreground mb-2">
                Users may receive promotional or marketing emails only if they give consent.
              </p>
              <p className="text-muted-foreground">
                Users may unsubscribe at any time via email link or by sending a request to Info@GoldenLife.Health or Admin@GoldenLife.Health
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">10. Complaint Rights</h2>
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
            <CardTitle>Cookie Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert space-y-6">
            
            <section>
              <h2 className="text-xl font-semibold mb-4">1. What Are Cookies</h2>
              <p className="text-muted-foreground">
                Cookies are small files stored on the User's device to improve functionality, security, and user experience.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">2. Types of Cookies We Use</h2>
              
              <h3 className="text-lg font-medium mb-2">Strictly Necessary Cookies</h3>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mb-4">
                <li>session cookies</li>
                <li>security cookies</li>
                <li>booking system cookies</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">Performance Cookies</h3>
              <p className="text-muted-foreground mb-4">Used for analytics purposes.</p>

              <h3 className="text-lg font-medium mb-2">Marketing Cookies</h3>
              <p className="text-muted-foreground">Used only with consent.</p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">3. Cookie Duration</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Session cookies: deleted when browser closes</li>
                <li>Persistent cookies: stored for up to 12–24 months</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">4. Cookie Consent</h2>
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
