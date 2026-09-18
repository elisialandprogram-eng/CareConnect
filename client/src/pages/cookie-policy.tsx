
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export default function CookiePolicy() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <PageBreadcrumbs items={[{ label: t("public_pages.cookie_title") }]} />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">{t("public_pages.cookie_title")}</h1>
          
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("public_pages.cookie_what_title")}</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <p>
                {t("public_pages.cookie_what_text")}
              </p>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("public_pages.cookie_use_title")}</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <h3>{t("public_pages.cookie_essential_title")}</h3>
              <p>{t("public_pages.cookie_essential_intro")}</p>
              <ul>
                <li><strong>{t("public_pages.cookie_auth_label")}:</strong> {t("public_pages.cookie_auth")}</li>
                <li><strong>{t("public_pages.cookie_security_label")}:</strong> {t("public_pages.cookie_security")}</li>
              </ul>

              <h3>{t("public_pages.cookie_functional_title")}</h3>
              <p>{t("public_pages.cookie_functional_intro")}</p>
              <ul>
                <li><strong>{t("public_pages.cookie_preferences_label")}:</strong> {t("public_pages.cookie_preferences")}</li>
                <li><strong>{t("public_pages.cookie_session_label")}:</strong> {t("public_pages.cookie_session")}</li>
              </ul>

              <h3>{t("public_pages.cookie_analytics_title")}</h3>
              <p>{t("public_pages.cookie_analytics_intro")}</p>
              <ul>
                <li>{t("public_pages.cookie_page_views")}</li>
                <li>{t("public_pages.cookie_time")}</li>
                <li>{t("public_pages.cookie_interactions")}</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("public_pages.cookie_manage_title")}</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <p>
                {t("public_pages.cookie_manage_text")}
              </p>
              <p>{t("public_pages.cookie_browsers")}</p>
              <ul>
                <li>{t("public_pages.cookie_view_delete")}</li>
                <li>{t("public_pages.cookie_block_third_party")}</li>
                <li>{t("public_pages.cookie_block_specific")}</li>
                <li>{t("public_pages.cookie_clear_close")}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("public_pages.cookie_updates_title")}</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <p>
                {t("public_pages.cookie_updates_text")}
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                {t("public_pages.cookie_last_updated")}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
