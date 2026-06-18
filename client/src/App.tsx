import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ErrorModalProvider } from "@/components/error-modal";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { GlobalErrorBoundary } from "@/components/global-error-boundary";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { useToast } from "@/hooks/use-toast";
import { registerToast } from "@/components/ui/app-toast";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import NotFound from "@/pages/not-found";

// Heavier pages — lazy-loaded so the initial bundle stays small.
const Providers = lazy(() => import("@/pages/providers"));
const Services = lazy(() => import("@/pages/services"));
const ProviderProfile = lazy(() => import("@/pages/provider-profile"));
const BookWizard = lazy(() => import("@/pages/book-wizard"));
const BookingConfirmation = lazy(() => import("@/pages/booking-confirmation"));
const PatientHome = lazy(() => import("@/pages/patient-home"));
const PatientDashboard = lazy(() => import("@/pages/patient-dashboard"));
const ProviderHome = lazy(() => import("@/pages/provider-home"));
const ProviderDashboard = lazy(() => import("@/pages/provider-dashboard"));
const ProviderClinicalDashboard = lazy(() => import("@/pages/provider-clinical-dashboard"));
const AdminDashboard = lazy(() => import("@/pages/admin-dashboard"));
const AdminStaleBookings = lazy(() => import("@/pages/admin-stale-bookings"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
const PackagesPage = lazy(() => import("@/pages/packages"));
const ProviderEarnings = lazy(() => import("@/pages/provider-earnings"));
const Terms = lazy(() => import("@/pages/terms"));
const Privacy = lazy(() => import("@/pages/privacy"));
const About = lazy(() => import("@/pages/about"));
const BecomeProvider = lazy(() => import("@/pages/become-provider"));
const Appointments = lazy(() => import("@/pages/appointments"));
const AppointmentDetails = lazy(() => import("@/pages/appointment-details"));
const Profile = lazy(() => import("@/pages/profile"));
const Settings = lazy(() => import("@/pages/settings"));
const CookiePolicy = lazy(() => import("@/pages/cookie-policy"));
const Messages = lazy(() => import("@/pages/messages"));
const Notifications = lazy(() => import("@/pages/notifications"));
const VerifyEmail = lazy(() => import("@/pages/verify-email"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const Consent = lazy(() => import("@/pages/consent"));
const WalletPage = lazy(() => import("@/pages/wallet"));
const ReferralsPage = lazy(() => import("@/pages/referrals"));
const WaitlistPage = lazy(() => import("@/pages/waitlist"));
const Review = lazy(() => import("@/pages/review"));
const SupportTickets = lazy(() => import("@/pages/support-tickets"));
const GroupSessionsPage = lazy(() => import("@/pages/group-sessions"));
const GiftCardsPage = lazy(() => import("@/pages/gift-cards"));
const MyDocumentsPage = lazy(() => import("@/pages/my-documents"));
const FamilyMembersPage = lazy(() => import("@/pages/family-members"));
const MembershipDashboard = lazy(() => import("@/pages/membership-dashboard"));
const FamilyMemberDashboard = lazy(() => import("@/pages/family-member-dashboard"));
const MyBugReports = lazy(() => import("@/pages/my-bug-reports"));
const AdminBugReports = lazy(() => import("@/pages/admin-bug-reports"));
const HealthRecordsPage = lazy(() => import("@/pages/health-records"));
const MyReviewsPage = lazy(() => import("@/pages/my-reviews"));
const AdminComplianceQueue = lazy(() => import("@/pages/admin/compliance-queue"));
const AdminHome = lazy(() => import("@/pages/admin-home"));

import { ScrollProgress } from "@/components/scroll-progress";
import { ScrollToTop } from "@/components/scroll-to-top";
import { PageTransition } from "@/components/page-transition";
import { ProtectedRoute } from "@/components/protected-route";

// Redirect providers away from /profile and /settings — those are now in My Profile tab.
function ProviderProfileRedirect({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isLoading && user?.role === "provider") {
      navigate("/provider/dashboard?tab=profile", { replace: true });
    }
  }, [isLoading, user, navigate]);
  if (isLoading || user?.role === "provider") return null;
  return <>{children}</>;
}

// Redirect /provider/setup → /provider/dashboard?tab=profile (setup is now inline in the dashboard).
function SetupRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/provider/dashboard?tab=profile", { replace: true });
  }, [navigate]);
  return null;
}

// Redirect /booking → /book while preserving query params and back-button stack.
// Uses Wouter navigate so it's a client-side replace (no full-page reload, no
// broken history entry) unlike the old window.location.replace approach.
function BookingRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/book${window.location.search}`, { replace: true });
  }, [navigate]);
  return null;
}

// Redirect orphaned aliases → their canonical destinations.
function PatientDashboardRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/patient/dashboard", { replace: true });
  }, [navigate]);
  return null;
}

function BookWizardRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/book${window.location.search}`, { replace: true });
  }, [navigate]);
  return null;
}

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

function ToastBridge() {
  const { toast } = useToast();
  useEffect(() => {
    registerToast(toast as Parameters<typeof registerToast>[0]);
  }, [toast]);
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
          <Route path="/group-sessions" component={GroupSessionsPage} />
          <Route path="/services" component={Services} />
          <Route path="/dashboard">
            <ProtectedRoute allowedRoles={["patient"]}><PatientHome /></ProtectedRoute>
          </Route>
          <Route path="/patient/dashboard">
            <ProtectedRoute allowedRoles={["patient"]}><PatientDashboard /></ProtectedRoute>
          </Route>
          <Route path="/patient/workspace" component={PatientDashboardRedirect} />
          <Route path="/patient/records" component={PatientDashboardRedirect} />
          <Route path="/provider/home">
            <ProtectedRoute allowedRoles={["provider"]}><ProviderHome /></ProtectedRoute>
          </Route>
          <Route path="/provider/dashboard">
            <ProtectedRoute allowedRoles={["provider"]}><ProviderDashboard /></ProtectedRoute>
          </Route>
          <Route path="/provider/clinical">
            <ProtectedRoute allowedRoles={["provider"]}><ProviderClinicalDashboard /></ProtectedRoute>
          </Route>
          <Route path="/provider/setup">
            <ProtectedRoute allowedRoles={["provider"]}><SetupRedirect /></ProtectedRoute>
          </Route>
          <Route path="/provider/earnings">
            <ProtectedRoute allowedRoles={["provider"]}><ProviderEarnings /></ProtectedRoute>
          </Route>
          <Route path="/provider/:id" component={ProviderProfile} />
          {/* Legacy /booking entry point — redirect to the consolidated wizard,
              preserving query params (providerId, serviceId, visitType, etc.). */}
          <Route path="/booking" component={BookingRedirect} />
          <Route path="/booking/confirmation/:appointmentId" component={BookingConfirmation} />
          <Route path="/book" component={BookWizard} />
          <Route path="/book-wizard" component={BookWizardRedirect} />
          <Route path="/admin/home">
            <ProtectedRoute allowedRoles={["admin","global_admin","country_admin","verification_admin"]}><AdminHome /></ProtectedRoute>
          </Route>
          <Route path="/admin">
            <ProtectedRoute allowedRoles={["admin","global_admin","country_admin","verification_admin"]}><AdminDashboard /></ProtectedRoute>
          </Route>
          <Route path="/admin/stale-bookings">
            <ProtectedRoute allowedRoles={["admin","global_admin","country_admin","verification_admin"]}><AdminStaleBookings /></ProtectedRoute>
          </Route>
          <Route path="/admin/users">
            <ProtectedRoute allowedRoles={["admin","global_admin","country_admin","verification_admin"]}><AdminUsers /></ProtectedRoute>
          </Route>
          <Route path="/packages" component={PackagesPage} />
          <Route path="/messages" component={Messages} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/cookies" component={CookiePolicy} />
          <Route path="/about" component={About} />
          <Route path="/become-provider" component={BecomeProvider} />
          <Route path="/appointments" component={Appointments} />
          <Route path="/appointments/:id" component={AppointmentDetails} />
          <Route path="/profile">
            <ProviderProfileRedirect><Profile /></ProviderProfileRedirect>
          </Route>
          <Route path="/settings">
            <ProviderProfileRedirect><Settings /></ProviderProfileRedirect>
          </Route>
          <Route path="/verify-email" component={VerifyEmail} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/consent" component={Consent} />
          <Route path="/wallet" component={WalletPage} />
          <Route path="/referrals">
            <ProtectedRoute allowedRoles={["patient"]}><ReferralsPage /></ProtectedRoute>
          </Route>
          <Route path="/waitlist">
            <ProtectedRoute allowedRoles={["patient"]}><WaitlistPage /></ProtectedRoute>
          </Route>
          <Route path="/review/:id" component={Review} />
          <Route path="/support/tickets" component={SupportTickets} />
          <Route path="/gift-cards" component={GiftCardsPage} />
          <Route path="/my-documents" component={MyDocumentsPage} />
          <Route path="/family-members" component={FamilyMembersPage} />
          <Route path="/family-members/:id" component={FamilyMemberDashboard} />
          <Route path="/membership" component={MembershipDashboard} />
          <Route path="/my-reports" component={MyBugReports} />
          <Route path="/health-records">
            <ProtectedRoute allowedRoles={["patient"]}><HealthRecordsPage /></ProtectedRoute>
          </Route>
          <Route path="/my-reviews">
            <ProtectedRoute allowedRoles={["patient"]}><MyReviewsPage /></ProtectedRoute>
          </Route>
          <Route path="/admin/bug-reports">
            <ProtectedRoute allowedRoles={["admin","global_admin","country_admin","verification_admin"]}><AdminBugReports /></ProtectedRoute>
          </Route>
          <Route path="/admin/compliance-queue">
            <ProtectedRoute allowedRoles={["admin","global_admin","country_admin","verification_admin"]}><AdminComplianceQueue /></ProtectedRoute>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </PageTransition>
  );
}

function App() {
  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <ErrorModalProvider>
              <div className="w-full max-w-full overflow-x-hidden">
                <ScrollToTopOnRouteChange />
                <ToastBridge />
                <ScrollProgress />
                <Toaster />
                <GlobalErrorBoundary>
                  <Router />
                </GlobalErrorBoundary>
                <Suspense fallback={null}>
                  <ChatBox />
                  <AIChatBox />
                </Suspense>
                <ScrollToTop />
                <CookieConsentBanner />
              </div>
            </ErrorModalProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
