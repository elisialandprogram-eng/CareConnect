import { Link } from "wouter";
import { Mail, Phone, MapPin, CalendarPlus, Stethoscope, UserPlus, Activity, HeartHandshake } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export function Footer() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <footer className="border-t bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="space-y-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-xl font-semibold">Golden Life</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              {t("footer.description")}
            </p>
          </div>

          {/* Services — always visible */}
          <div>
            <h3 className="font-semibold mb-4">{t("footer.services")}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/providers?type=physician" className="hover:text-foreground transition-colors">
                  {t("common.physicians", "Medical Doctors")}
                </Link>
              </li>
              <li>
                <Link href="/providers?type=mental_health" className="hover:text-foreground transition-colors">
                  {t("common.mental_health_pros", "Mental Health")}
                </Link>
              </li>
              <li>
                <Link href="/providers?type=rehabilitation" className="hover:text-foreground transition-colors">
                  {t("common.rehabilitation_pros", "Physical Therapy")}
                </Link>
              </li>
              <li>
                <Link href="/providers?type=nursing" className="hover:text-foreground transition-colors">
                  {t("common.nursing_pros", "Maternal, Nursing & Allied Health")}
                </Link>
              </li>
              <li>
                <Link href="/providers?type=dental" className="hover:text-foreground transition-colors">
                  {t("common.dental_pros", "Dental Care")}
                </Link>
              </li>
              <li>
                <Link href="/providers?type=nutrition" className="hover:text-foreground transition-colors">
                  {t("common.nutrition_pros", "Nutrition")}
                </Link>
              </li>
              <li>
                <Link href="/group-sessions" className="hover:text-foreground transition-colors">
                  {t("common.groups", "Group Sessions")}
                </Link>
              </li>
              <li>
                <Link href="/providers" className="hover:text-foreground transition-colors">
                  {t("footer.all_providers")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Account column — gated by auth */}
          <div>
            <h3 className="font-semibold mb-4">
              {user ? t("common.patients", "My Account") : t("common.patients", "Get Started")}
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {user ? (
                /* ── Authenticated: deep app links ── */
                <>
                  <li>
                    <Link href="/patient/dashboard" className="hover:text-foreground transition-colors">
                      {t("common.dashboard")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/health-records" className="hover:text-foreground transition-colors flex items-center gap-1.5">
                      <Activity className="h-3 w-3" />
                      {t("common.health_records", "Health Records")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/wallet" className="hover:text-foreground transition-colors">
                      {t("common.wallet", "My Wallet")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/my-documents" className="hover:text-foreground transition-colors">
                      {t("common.my_documents", "My Documents")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/referrals" className="hover:text-foreground transition-colors">
                      {t("common.referrals", "Referrals")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/gift-cards" className="hover:text-foreground transition-colors">
                      {t("common.gift_cards", "Gift Cards")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/waitlist" className="hover:text-foreground transition-colors">
                      {t("common.waitlist", "Waitlist")}
                    </Link>
                  </li>
                </>
              ) : (
                /* ── Unauthenticated: conversion anchors ── */
                <>
                  <li>
                    <Link
                      href="/book"
                      className="hover:text-foreground transition-colors flex items-center gap-1.5 font-medium text-primary"
                      data-testid="footer-cta-book"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Book an Appointment
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/providers"
                      className="hover:text-foreground transition-colors flex items-center gap-1.5"
                      data-testid="footer-cta-explore"
                    >
                      <Stethoscope className="h-3.5 w-3.5" />
                      Explore Medical Specialties
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/become-provider"
                      className="hover:text-foreground transition-colors flex items-center gap-1.5"
                      data-testid="footer-cta-provider"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Join as a Provider
                    </Link>
                  </li>
                  <li>
                    <Link href="/packages" className="hover:text-foreground transition-colors flex items-center gap-1.5">
                      <HeartHandshake className="h-3.5 w-3.5" />
                      Membership Packages
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="hover:text-foreground transition-colors">
                      Create Free Account
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Quick links — always visible */}
          <div>
            <h3 className="font-semibold mb-4">{t("footer.quick_links")}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-foreground transition-colors">
                  {t("common.about")}
                </Link>
              </li>
              <li>
                <Link href="/become-provider" className="hover:text-foreground transition-colors">
                  {t("common.become_provider")}
                </Link>
              </li>
              <li>
                <Link href="/packages" className="hover:text-foreground transition-colors">
                  {t("common.packages", "Membership Packages")}
                </Link>
              </li>
              {user && (
                <li>
                  <Link href="/support/tickets" className="hover:text-foreground transition-colors">
                    {t("common.support_tickets", "Support")}
                  </Link>
                </li>
              )}
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">
                  {t("footer.privacy_policy")}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">
                  {t("footer.terms_of_service")}
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="hover:text-foreground transition-colors" data-testid="link-cookies">
                  {t("footer.cookie_policy")}
                </Link>
              </li>
              <li>
                <Link href="/consent" className="hover:text-foreground transition-colors" data-testid="link-consent">
                  {t("footer.consent_management", "Consent & Privacy")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">{t("footer.contact_us")}</h3>
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
          <p>&copy; {new Date().getFullYear()} Golden Life. {t("footer.all_rights_reserved")}</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
