
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold mb-8">Cookie Policy</h1>
          
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>What Are Cookies</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <p>
                Cookies are small text files that are placed on your device when you visit our website. 
                They help us provide you with a better experience by remembering your preferences and 
                understanding how you use our services.
              </p>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>How We Use Cookies</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <h3>Essential Cookies</h3>
              <p>These cookies are necessary for the website to function properly:</p>
              <ul>
                <li><strong>Authentication:</strong> To keep you logged in and secure your session</li>
                <li><strong>Security:</strong> To protect against fraudulent activity and enhance security</li>
              </ul>

              <h3>Functional Cookies</h3>
              <p>These cookies enable enhanced functionality:</p>
              <ul>
                <li><strong>Preferences:</strong> Remember your settings like language and theme</li>
                <li><strong>Session Management:</strong> Maintain your booking flow and cart information</li>
              </ul>

              <h3>Analytics Cookies</h3>
              <p>We use these to understand how visitors use our website:</p>
              <ul>
                <li>Page views and navigation patterns</li>
                <li>Time spent on pages</li>
                <li>Interaction with features</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Managing Cookies</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <p>
                You can control and manage cookies through your browser settings. However, please note 
                that disabling certain cookies may affect your ability to use some features of our website.
              </p>
              <p>Most browsers allow you to:</p>
              <ul>
                <li>View and delete cookies</li>
                <li>Block third-party cookies</li>
                <li>Block cookies from specific websites</li>
                <li>Clear all cookies when you close your browser</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Updates to This Policy</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <p>
                We may update this Cookie Policy from time to time. Any changes will be posted on this 
                page with an updated revision date.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Last updated: December 2024
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
