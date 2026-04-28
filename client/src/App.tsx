import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ErrorModalProvider } from "@/components/error-modal";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import NotFound from "@/pages/not-found";

// Heavier pages — lazy-loaded so the initial bundle stays small.
const Providers = lazy(() => import("@/pages/providers"));
const ProviderProfile = lazy(() => import("@/pages/provider-profile"));
const Booking = lazy(() => import("@/pages/booking"));
const PatientDashboard = lazy(() => import("@/pages/patient-dashboard"));
const ProviderDashboard = lazy(() => import("@/pages/provider-dashboard"));
const ProviderSetup = lazy(() => import("@/pages/provider-setup"));
const AdminDashboard = lazy(() => import("@/pages/admin-dashboard"));
const Terms = lazy(() => import("@/pages/terms"));
const Privacy = lazy(() => import("@/pages/privacy"));
const About = lazy(() => import("@/pages/about"));
const BecomeProvider = lazy(() => import("@/pages/become-provider"));
const Appointments = lazy(() => import("@/pages/appointments"));
const Profile = lazy(() => import("@/pages/profile"));
const Settings = lazy(() => import("@/pages/settings"));
const CookiePolicy = lazy(() => import("@/pages/cookie-policy"));
const Messages = lazy(() => import("@/pages/messages"));
const Notifications = lazy(() => import("@/pages/notifications"));
const VerifyEmail = lazy(() => import("@/pages/verify-email"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const Consent = lazy(() => import("@/pages/consent"));
const WalletPage = lazy(() => import("@/pages/wallet"));
const Review = lazy(() => import("@/pages/review"));
const SupportTickets = lazy(() => import("@/pages/support-tickets"));

import { ScrollProgress } from "@/components/scroll-progress";
import { ScrollToTop } from "@/components/scroll-to-top";
import { PageTransition } from "@/components/page-transition";

// Floating chat widgets are heavy and only render when opened — load them
// after the initial page paints to keep first-render fast.
const ChatBox = lazy(() =>
  import("@/components/chat/ChatBox").then((m) => ({ default: m.ChatBox })),
);
const AIChatBox = lazy(() =>
  import("@/components/ai-chat-box").then((m) => ({ default: m.AIChatBox })),
);

import "@/lib/i18n";

import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

function ScrollToTopOnRouteChange() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location]);
  return null;
}

function PageFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center" data-testid="page-loading">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function Router() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.dir = i18n.language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <PageTransition>
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/providers" component={Providers} />
          <Route path="/dashboard" component={PatientDashboard} />
          <Route path="/patient/dashboard" component={PatientDashboard} />
          <Route path="/provider/dashboard" component={ProviderDashboard} />
          <Route path="/provider/setup" component={ProviderSetup} />
          <Route path="/provider/:id" component={ProviderProfile} />
          <Route path="/booking" component={Booking} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/messages" component={Messages} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/cookies" component={CookiePolicy} />
          <Route path="/about" component={About} />
          <Route path="/become-provider" component={BecomeProvider} />
          <Route path="/appointments" component={Appointments} />
          <Route path="/profile" component={Profile} />
          <Route path="/settings" component={Settings} />
          <Route path="/verify-email" component={VerifyEmail} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/consent" component={Consent} />
          <Route path="/wallet" component={WalletPage} />
          <Route path="/review/:id" component={Review} />
          <Route path="/support/tickets" component={SupportTickets} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </PageTransition>
  );
}

function App() {
  console.log("App component rendering");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ErrorModalProvider>
            <ScrollToTopOnRouteChange />
            <ScrollProgress />
            <Toaster />
            <Router />
            <Suspense fallback={null}>
              <ChatBox />
              <AIChatBox />
            </Suspense>
            <ScrollToTop />
          </ErrorModalProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
