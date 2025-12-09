import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Terms & Conditions</h1>
        
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Golden Life Appointment Booking Platform</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert space-y-6">
            
            <section>
              <h2 className="text-xl font-semibold mb-4">1. Service Provider</h2>
              <div className="space-y-2 text-muted-foreground">
                <p><strong>Company name:</strong> Golden Life</p>
                <p><strong>Address:</strong> Hungary, 3060 Pásztó, Semmelweis utca 10</p>
                <p><strong>Email:</strong> Info@GoldenLife.Health, Admin@GoldenLife.Health</p>
                <p><strong>Phone:</strong> +36702370103</p>
              </div>
              <p className="mt-4 text-muted-foreground">
                Golden Life ("Service Provider") operates an online appointment-booking system ("Service") available through its website and digital interfaces.
              </p>
              <p className="text-muted-foreground">
                By booking an appointment or using the Service, the User accepts these Terms.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">2. Scope of Service</h2>
              <p className="text-muted-foreground mb-2">Golden Life provides:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>an online appointment booking system,</li>
                <li>appointment confirmations and notifications,</li>
                <li>online and on-site payment options.</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                Golden Life Workers and Specialists provide the actual services. Golden Life is not responsible for the performance, quality, or outcome of professional services provided by Workers.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">3. Booking and Contract</h2>
              <p className="text-muted-foreground mb-2">A contract between the User and Golden Life is formed only when:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>the User submits a booking, and</li>
                <li>Golden Life confirms the booking via email or automated message.</li>
              </ul>
              <p className="mt-4 text-muted-foreground mb-2">Payments may be:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>processed online before the appointment, or</li>
                <li>made at the service location.</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">4. User Obligations</h2>
              <p className="text-muted-foreground mb-2">The User must:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>provide accurate personal information,</li>
                <li>attend appointments on time,</li>
                <li>comply with cancellation rules,</li>
                <li>use the Service lawfully and respectfully.</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">5. Cancellation Policy</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Free cancellation within 24 hours after booking.</li>
                <li>After 24 hours, cancellation fees or restrictions may apply.</li>
                <li>Repeated no-shows may result in restricted booking privileges.</li>
                <li>Golden Life or the Worker may reschedule due to emergencies.</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">6. Prices & Payments</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Prices may change at any time.</li>
                <li>Payments are processed by a third-party payment provider.</li>
                <li>Online payments are encrypted and handled securely.</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">7. Liability</h2>
              <p className="text-muted-foreground mb-2">Golden Life is not liable for:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>professional outcomes of the Worker,</li>
                <li>delayed or cancelled appointments by Workers,</li>
                <li>incorrect information provided by Users,</li>
                <li>technical outages, cyberattacks, or system failures,</li>
                <li>missed appointments due to User error.</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                Golden Life is liable only for operating the booking system and handling data securely.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">8. Complaint Handling</h2>
              <p className="text-muted-foreground mb-2">Complaints may be submitted by email, phone, or in writing to:</p>
              <div className="text-muted-foreground space-y-1">
                <p><strong>Golden Life</strong></p>
                <p>Hungary, 3060 Pásztó, Semmelweis utca 10</p>
                <p>Email: Info@GoldenLife.Health, Admin@GoldenLife.Health</p>
                <p>Phone: +36702370103</p>
              </div>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">9. Amendments</h2>
              <p className="text-muted-foreground">
                Golden Life may amend the Terms at any time. Changes take effect 30 days after publication on the website.
              </p>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">10. Governing Law</h2>
              <p className="text-muted-foreground mb-2">These Terms are governed by Hungarian law:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Civil Code (Ptk.)</li>
                <li>E-Commerce Act (2001. CVIII)</li>
                <li>Consumer Protection Act (1997. CLV)</li>
              </ul>
            </section>

            <Separator />

            <section>
              <h2 className="text-xl font-semibold mb-4">11. Final Provisions</h2>
              <p className="text-muted-foreground">
                If any provision is found invalid, the remainder stays in effect.
              </p>
            </section>

          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
