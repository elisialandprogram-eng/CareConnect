import { useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/header";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Info } from "lucide-react";

export default function ComplianceQueue() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/admin?tab=verification-queue"), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-muted/20 dark:bg-[#0d0f1a]">
      <Header />
      <PageBreadcrumbs
        items={[{ label: "Admin", href: "/admin" }, { label: "Compliance Queue" }]}
        fallback="/admin"
      />
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-sm p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Compliance Queue Consolidated</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              The Compliance Queue has been merged into the <strong>Provider Review Queue</strong>.
              All credential verification, document review, and final approval now happen in one unified workflow.
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 flex items-start gap-3 text-left">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Redirecting you automatically in 3 seconds…
            </p>
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => navigate("/admin?tab=verification-queue")}
            data-testid="button-go-to-kyc-review"
          >
            Go to Provider Review Queue
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={() => navigate("/admin")}
            data-testid="button-go-to-admin"
          >
            Back to Admin Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}
