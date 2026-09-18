import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { CheckCircle, Calendar, Users, TrendingUp, Clock, Shield } from "lucide-react";

export default function BecomeProvider() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  const getActionButton = () => {
    if (!isAuthenticated) {
      return (
        <Button size="lg" asChild>
          <Link href="/register">{t("provider_dashboard.become_create_account", "Get Started - Create Account")}</Link>
        </Button>
      );
    }
    if (user?.role === "provider") {
      return (
        <Button size="lg" asChild>
          <Link href="/provider/dashboard">{t("provider_dashboard.become_go_dashboard", "Go to Dashboard")}</Link>
        </Button>
      );
    }
    return (
      <Button size="lg" asChild>
        <Link href="/provider/dashboard">{t("provider_dashboard.become_complete_setup", "Complete Provider Setup")}</Link>
      </Button>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="py-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-4">{t("provider_dashboard.become_title", "Become a Healthcare Provider")}</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              {t("provider_dashboard.become_subtitle", "Join our network of trusted healthcare professionals and grow your practice with Golden Life.")}
            </p>
            {getActionButton()}
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4 max-w-5xl">
            <h2 className="text-2xl font-semibold text-center mb-12">{t("provider_dashboard.become_why_join", "Why Join Golden Life?")}</h2>
            
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              <Card>
                <CardHeader>
                  <div className="p-2 bg-primary/10 rounded-lg w-fit mb-2">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t("provider_dashboard.become_reach_clients", "Reach More Clients")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("provider_dashboard.become_reach_clients_desc", "Connect with clients actively seeking healthcare services in your area.")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="p-2 bg-primary/10 rounded-lg w-fit mb-2">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t("provider_dashboard.become_easy_scheduling", "Easy Scheduling")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("provider_dashboard.become_easy_scheduling_desc", "Manage your availability and appointments with our intuitive booking system.")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="p-2 bg-primary/10 rounded-lg w-fit mb-2">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t("provider_dashboard.become_grow_practice", "Grow Your Practice")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("provider_dashboard.become_grow_practice_desc", "Build your reputation with client reviews and increase your visibility.")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="p-2 bg-primary/10 rounded-lg w-fit mb-2">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t("provider_dashboard.become_flexible_hours", "Flexible Hours")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("provider_dashboard.become_flexible_hours_desc", "Set your own schedule and work hours that fit your lifestyle.")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="p-2 bg-primary/10 rounded-lg w-fit mb-2">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t("provider_dashboard.become_secure_payments", "Secure Payments")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("provider_dashboard.become_secure_payments_desc", "Receive secure, timely payments for your services through our platform.")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="p-2 bg-primary/10 rounded-lg w-fit mb-2">
                    <CheckCircle className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t("provider_dashboard.become_professional_support", "Professional Support")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("provider_dashboard.become_professional_support_desc", "Get dedicated support to help you succeed on our platform.")}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="text-center">
                <CardTitle>{t("provider_dashboard.become_ready", "Ready to Get Started?")}</CardTitle>
                <CardDescription>
                  {t("provider_dashboard.become_ready_desc", "Join hundreds of healthcare professionals already using Golden Life.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                {getActionButton()}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
