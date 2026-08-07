import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/search-bar";
import { ServiceCategories } from "@/components/service-categories";
import { HowItWorks } from "@/components/how-it-works";
import { StatsSection } from "@/components/stats-section";
import { Testimonials } from "@/components/testimonials";
import { CTASection } from "@/components/cta-section";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ContactForm } from "@/components/contact-form";
import { RecentlyViewedProviders } from "@/components/recently-viewed-providers";
import { Shield, Clock, Award, Sparkles, CreditCard, Wallet, Banknote } from "lucide-react";
import { SiVisa, SiMastercard, SiGooglepay, SiApplepay } from "react-icons/si";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/use-page-title";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function Home() {
  const { t } = useTranslation();
  usePageTitle(t("home.meta_title", "Book Healthcare Appointments"));
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (user.role === "patient") {
      navigate("/dashboard", { replace: true });
    } else if (user.role === "provider") {
      navigate("/provider/home", { replace: true });
    } else if (
      user.role === "admin" ||
      user.role === "global_admin" ||
      user.role === "country_admin" ||
      user.role === "verification_admin"
    ) {
      navigate("/admin/home", { replace: true });
    }
  }, [isLoading, user, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative py-20 lg:py-32 overflow-hidden">
          {/* Clean static gradient — no CPU overhead */}
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-indigo-50 to-violet-50 dark:from-sky-950/60 dark:via-indigo-950/60 dark:to-violet-950/60 -z-10" />
          {/* Subtle static accent shapes */}
          <div className="absolute top-20 right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute bottom-10 left-10 w-80 h-80 bg-violet-400/10 rounded-full blur-3xl -z-10 pointer-events-none" />

          <div className="container mx-auto px-4">
            <motion.div
              className="max-w-4xl mx-auto text-center space-y-8"
              initial="initial"
              animate="animate"
              variants={staggerContainer}
            >
              <motion.div variants={fadeInUp}>
                <Badge variant="secondary" className="text-sm px-4 py-2 gap-2 shimmer" data-testid="badge-hero">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("hero.trusted_badge")}
                </Badge>
              </motion.div>

              <motion.h1
                className="text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-sky-600 via-indigo-600 to-violet-600 dark:from-sky-300 dark:via-indigo-300 dark:to-violet-300 bg-clip-text text-transparent drop-shadow-sm"
                variants={fadeInUp}
              >
                {t("hero.title")}
                <motion.span
                  className="block mt-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 dark:from-emerald-300 dark:via-teal-300 dark:to-cyan-300 bg-clip-text text-transparent"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  {t("hero.title_span")}
                </motion.span>
              </motion.h1>

              <motion.p
                className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
                variants={fadeInUp}
              >
                {t("hero.description")}
              </motion.p>

              <motion.div variants={fadeInUp}>
                <SearchBar className="max-w-3xl mx-auto" />
              </motion.div>

              <motion.div
                className="flex flex-wrap justify-center gap-3 pt-4"
                variants={fadeInUp}
              >
                <Link href="/providers?type=physician">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-physicians"
                  >
                    {t("common.physicians", "Medical Doctors")}
                  </Badge>
                </Link>
                <Link href="/providers?type=mental_health">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-mental-health"
                  >
                    {t("common.mental_health_pros", "Mental Health")}
                  </Badge>
                </Link>
                <Link href="/providers?type=rehabilitation">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-rehabilitation"
                  >
                    {t("common.rehabilitation_pros", "Physical Therapy")}
                  </Badge>
                </Link>
                <Link href="/providers?type=nursing">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-nursing"
                  >
                    {t("common.nursing_pros", "Nursing")}
                  </Badge>
                </Link>
                <Link href="/providers?type=dental">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-dental"
                  >
                    {t("common.dental_pros", "Dental")}
                  </Badge>
                </Link>
                <Link href="/providers?type=nutrition">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-nutrition"
                  >
                    {t("common.nutrition_pros", "Nutrition")}
                  </Badge>
                </Link>
                <Link href="/providers?type=alternative_medicine">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-alternative"
                  >
                    {t("common.alternative_medicine_pros", "Holistic")}
                  </Badge>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── Trust strip ───────────────────────────────────────────────── */}
        <section className="py-12 border-y bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
            >
              <motion.div
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-sky-50/70 dark:hover:bg-sky-950/30 transition-colors duration-300 icon-bounce"
                data-testid="feature-verified"
                variants={fadeInUp}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-200 to-sky-50 dark:from-sky-900 dark:to-sky-950 flex items-center justify-center shadow-lg ring-1 ring-sky-200/60 dark:ring-sky-800/40">
                  <Shield className="h-7 w-7 text-sky-600 dark:text-sky-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{t("features.verified_title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.verified_desc")}</p>
                </div>
              </motion.div>
              <motion.div
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 transition-colors duration-300 icon-bounce"
                data-testid="feature-booking"
                variants={fadeInUp}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-200 to-emerald-50 dark:from-emerald-900 dark:to-emerald-950 flex items-center justify-center shadow-lg ring-1 ring-emerald-200/60 dark:ring-emerald-800/40">
                  <Clock className="h-7 w-7 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{t("features.booking_title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.booking_desc")}</p>
                </div>
              </motion.div>
              <motion.div
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-amber-50/70 dark:hover:bg-amber-950/30 transition-colors duration-300 icon-bounce"
                data-testid="feature-quality"
                variants={fadeInUp}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-50 dark:from-amber-900 dark:to-amber-950 flex items-center justify-center shadow-lg ring-1 ring-amber-200/60 dark:ring-amber-800/40">
                  <Award className="h-7 w-7 text-amber-600 dark:text-amber-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{t("features.quality_title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.quality_desc")}</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── Payment Methods ─────────────────────────────────────────── */}
        <section className="py-8 bg-muted/30">
          <div className="container mx-auto px-4">
            <motion.div
              className="flex flex-col items-center gap-4"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <p className="text-sm text-muted-foreground font-medium">{t("payment.accept_title")}</p>
              <div className="flex flex-wrap justify-center items-center gap-6">
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-visa">
                  <SiVisa className="h-8 w-12" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-mastercard">
                  <SiMastercard className="h-8 w-8" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-gpay">
                  <SiGooglepay className="h-8 w-12" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-applepay">
                  <SiApplepay className="h-8 w-12" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-card">
                  <CreditCard className="h-6 w-6" />
                  <span className="text-sm">{t("payment.credit_debit")}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-wallet">
                  <Wallet className="h-6 w-6" />
                  <span className="text-sm">{t("payment.e_wallet")}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="payment-netbanking">
                  <Banknote className="h-6 w-6" />
                  <span className="text-sm">{t("payment.net_banking")}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <RecentlyViewedProviders />
        <ServiceCategories />
        <HowItWorks />
        <StatsSection />
        <Testimonials />
        <ContactForm />
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}
