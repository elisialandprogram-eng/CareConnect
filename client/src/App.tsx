import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import Home from "@/pages/home";
import Providers from "@/pages/providers";
import ProviderProfile from "@/pages/provider-profile";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Booking from "@/pages/booking";
import PatientDashboard from "@/pages/patient-dashboard";
import ProviderDashboard from "@/pages/provider-dashboard";
import ProviderSetup from "@/pages/provider-setup";
import AdminDashboard from "@/pages/admin-dashboard";
import NotFound from "@/pages/not-found";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import About from "@/pages/about";
import BecomeProvider from "@/pages/become-provider";
import Appointments from "@/pages/appointments";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import CookiePolicy from "@/pages/cookie-policy";
import Messages from "@/pages/messages";
import Notifications from "@/pages/notifications";
import VerifyEmail from "@/pages/verify-email";
import ForgotPassword from "@/pages/forgot-password";
import Consent from "@/pages/consent";

import { ChatBox } from "@/components/chat/ChatBox";

import "@/lib/i18n";

import { useTranslation } from "react-i18next";
import { useEffect } from "react";

function Router() {
  const { i18n } = useTranslation();
  
  useEffect(() => {
    document.dir = i18n.language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/providers" component={Providers} />
      <Route path="/provider/:id" component={ProviderProfile} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/consent" component={Consent} />
      <Route path="/booking" component={Booking} />
      <Route path="/patient/dashboard" component={PatientDashboard} />
      <Route path="/provider/dashboard" component={ProviderDashboard} />
      <Route path="/provider/setup" component={ProviderSetup} />
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  console.log("App component rendering");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
          <ChatBox />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;