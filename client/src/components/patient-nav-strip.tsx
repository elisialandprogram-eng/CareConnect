import { Link, useLocation } from "wouter";
import { Home, LayoutDashboard } from "lucide-react";

/**
 * Sticky tab strip shown on both the Patient Home (/dashboard) and the
 * Patient Workspace (/patient/dashboard). Lets patients switch between the
 * two surfaces in one click without scrolling.
 */
export function PatientNavStrip() {
  const [location] = useLocation();

  const tabs = [
    {
      label: "Home",
      href: "/dashboard",
      icon: <Home className="h-4 w-4" />,
      active: location === "/dashboard",
      testId: "nav-patient-home",
    },
    {
      label: "My Care Workspace",
      href: "/patient/dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      active: location.startsWith("/patient/dashboard") || location.startsWith("/patient/workspace") || location.startsWith("/patient/records"),
      testId: "nav-patient-workspace",
    },
  ];

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/60 shadow-sm">
      <div className="container mx-auto px-4 max-w-3xl">
        <nav className="flex items-center gap-1 h-12" role="tablist" aria-label="Patient navigation">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href}>
              <button
                role="tab"
                aria-selected={tab.active}
                data-testid={tab.testId}
                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  transition-all duration-150 select-none
                  ${tab.active
                    ? "text-primary bg-primary/8"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }
                `}
              >
                {tab.icon}
                {tab.label}
                {tab.active && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
