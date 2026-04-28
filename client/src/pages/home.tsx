import { Link } from "wouter";
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
import { Shield, Clock, Award, Sparkles, CreditCard, Wallet, Banknote, Mail, Phone, MapPin } from "lucide-react";
import { SiVisa, SiMastercard, SiGooglepay, SiApplepay } from "react-icons/si";
import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import { useAuth } from "@/lib/auth"; // Assuming useAuth is imported from here
import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

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

const floatingAnimation = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

export default function Home() {
  const { t, i18n } = useTranslation();
  console.log("Home page rendering");
  const { user } = useAuth();

  const heroRef = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, 120]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0.4]);
  const blob1Y = useTransform(scrollY, [0, 600], [0, -80]);
  const blob2Y = useTransform(scrollY, [0, 600], [0, 60]);

  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(50);
  const smoothX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 60, damping: 20 });
  const spotlightX = useTransform(smoothX, (v) => `${v}%`);
  const spotlightY = useTransform(smoothY, (v) => `${v}%`);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    mouseX.set(x);
    mouseY.set(y);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          className="relative py-20 lg:py-32 overflow-hidden"
        >
          <div className="absolute inset-0 animated-gradient -z-10" />
          <motion.div
            className="absolute inset-0 -z-10 spotlight pointer-events-none"
            style={{
              ['--x' as any]: spotlightX,
              ['--y' as any]: spotlightY,
            }}
          />
          <motion.div
            className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl -z-10"
            style={{ y: blob1Y }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10"
            style={{ y: blob2Y }}
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/5 to-transparent rounded-full blur-3xl -z-10"
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          />

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
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight"
                variants={fadeInUp}
              >
                {t("hero.title")}
                <motion.span
                  className="text-primary block mt-2"
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
                <Link href="/providers?type=physiotherapist">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-physio"
                  >
                    {t("common.physiotherapists")}
                  </Badge>
                </Link>
                <Link href="/providers?type=nurse">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-nursing"
                  >
                    {t("common.nurses")}
                  </Badge>
                </Link>
                <Link href="/providers?type=doctor">
                  <Badge
                    variant="outline"
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    data-testid="badge-doctor"
                  >
                    {t("common.doctors")}
                  </Badge>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

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

        {/* Payment Methods Section */}
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