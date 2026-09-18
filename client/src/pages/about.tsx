import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Shield, Users, Clock, MapPin, Phone, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <PageBreadcrumbs items={[{ label: t("public_pages.about") }]} />
      <main className="flex-1">
        <section className="py-10 bg-gradient-to-b from-primary/5 to-background">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-4">{t("public_pages.about_title")}</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("public_pages.about_intro")}
            </p>
          </div>
        </section>

        <section className="py-12">
          <div className="container mx-auto px-4 max-w-4xl">
            <div>
              <h2 className="text-2xl font-semibold mb-4">{t("public_pages.about_mission")}</h2>
              <p className="text-muted-foreground mb-12 leading-relaxed">
                {t("public_pages.about_mission_text")}
              </p>

              <h2 className="text-2xl font-semibold mb-6">{t("public_pages.about_offer")}</h2>
              <div className="grid md:grid-cols-2 gap-6 mb-12">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Heart className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t("public_pages.about_quality_title")}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t("public_pages.about_quality_text")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Shield className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t("public_pages.about_secure_title")}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t("public_pages.about_secure_text")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t("public_pages.about_trusted_title")}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t("public_pages.about_trusted_text")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Clock className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t("public_pages.about_convenient_title")}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t("public_pages.about_convenient_text")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <h2 className="text-2xl font-semibold mb-6">{t("public_pages.about_contact")}</h2>
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-primary" />
                      <span className="text-muted-foreground">Hungary, 3060 Pásztó, Semmelweis utca 10</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-primary" />
                      <div className="flex flex-col gap-1">
                        <a href="mailto:Info@GoldenLife.Health" className="text-primary hover:underline">
                          Info@GoldenLife.Health
                        </a>
                        <a href="mailto:Admin@GoldenLife.Health" className="text-primary hover:underline">
                          Admin@GoldenLife.Health
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-primary" />
                      <a href="tel:+36702370103" className="text-primary hover:underline">
                        +36702370103
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
