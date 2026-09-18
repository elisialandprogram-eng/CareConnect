import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Home, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="text-center max-w-md">
          <div className="text-8xl font-bold text-primary/20 mb-4">404</div>
          <h1 className="text-3xl font-semibold mb-2">{t("public_pages.not_found_title")}</h1>
          <p className="text-muted-foreground mb-8">
            {t("public_pages.not_found_text")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild data-testid="button-go-home">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                {t("public_pages.not_found_home")}
              </Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-browse-providers">
              <Link href="/providers">
                <Search className="h-4 w-4 mr-2" />
                {t("common.browse_providers")}
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
