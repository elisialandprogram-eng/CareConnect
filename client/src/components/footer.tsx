import { Link } from "wouter";
import { Stethoscope, Mail, Phone, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-xl font-semibold">Golden Life</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Connecting patients with trusted healthcare professionals. Quality care delivered to your doorstep.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Services</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/providers?type=physiotherapist" className="hover:text-foreground transition-colors">
                  Physiotherapy
                </Link>
              </li>
              <li>
                <Link href="/providers?type=nurse" className="hover:text-foreground transition-colors">
                  Home Nursing
                </Link>
              </li>
              <li>
                <Link href="/providers?type=doctor" className="hover:text-foreground transition-colors">
                  Doctor Consultations
                </Link>
              </li>
              <li>
                <Link href="/providers" className="hover:text-foreground transition-colors">
                  All Providers
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-foreground transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/become-provider" className="hover:text-foreground transition-colors">
                  Become a Provider
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="hover:text-foreground transition-colors">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Contact</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <a href="mailto:Info@GoldenLife.Health" className="hover:text-foreground transition-colors">
                    Info@GoldenLife.Health
                  </a>
                  <a href="mailto:Admin@GoldenLife.Health" className="hover:text-foreground transition-colors">
                    Admin@GoldenLife.Health
                  </a>
                </div>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a href="tel:+36702370103" className="hover:text-foreground transition-colors">
                  +36702370103
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5" />
                <span>Hungary, 3060 Pásztó, Semmelweis utca 10</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Golden Life. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
