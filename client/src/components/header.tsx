import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarSM } from "@/components/ui/provider-image";
import { User, Calendar, LogOut, Settings, LayoutDashboard, Menu, X, Stethoscope, MessageSquare, Bell, Languages, Wallet, LifeBuoy, Search, HeartPulse, Sparkles, Activity, UserRound, Tag, Users, Gift, FileText, TrendingUp, Share2, Star, Crown, Bug, Home, Command } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { isAdminRole } from "@/lib/roles";
import { useState } from "react";
import { useTranslation } from "react-i18next";

function WalletBadge() {
  const [, navigate] = useLocation();
  const { format: fmtWallet } = useCurrency();
  const { data, isLoading } = useQuery<{ balance: string; currency: string }>({
    queryKey: ["/api/wallet"],
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const balance = data ? Number(data.balance ?? 0) : 0;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="hidden sm:inline-flex h-9 gap-1.5 px-2.5 rounded-full bg-gradient-to-r from-emerald-500/15 to-teal-500/15 hover:from-emerald-500/25 hover:to-teal-500/25 border border-emerald-500/30"
      onClick={() => navigate("/wallet")}
      data-testid="button-header-wallet"
      aria-label="Wallet"
    >
      <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
        {isLoading ? "…" : fmtWallet(balance)}
      </span>
    </Button>
  );
}

function NotificationBell() {
  const [, navigate] = useLocation();
  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    staleTime: 60_000,
  });
  const count = data?.count ?? 0;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30"
      onClick={() => navigate("/notifications")}
      data-testid="button-notification-bell"
      aria-label="Notifications"
    >
      <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      {count > 0 && (
        <Badge
          className="absolute -top-1 ltr:-right-1 rtl:-left-1 h-4 min-w-[16px] px-1 text-[10px] font-extrabold flex items-center justify-center rounded-full bg-rose-600 text-white ring-2 ring-background shadow-lg"
          data-testid="badge-notification-count"
        >
          {count > 99 ? "99+" : count}
        </Badge>
      )}
    </Button>
  );
}

export function Header() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    if (user) {
      // Best-effort persist of language preference; ignore errors silently.
      void fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languagePreference: lng }),
      }).catch(() => {});
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase() || "U";
  };

  const getDashboardLink = () => {
    if (user?.role === "provider") return "/provider/dashboard";
    if (isAdminRole(user?.role)) return "/admin";
    return "/patient/dashboard";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-primary/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0" data-testid="link-home">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 transition-transform group-hover:scale-105">
            <HeartPulse className="h-5 w-5 text-white" strokeWidth={2.5} />
            <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-amber-300 drop-shadow" strokeWidth={3} />
          </span>
          <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400">
            Golden Life
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5">
          <Link
            href="/providers"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium whitespace-nowrap text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 hover:text-blue-800 dark:hover:text-blue-200 transition-all"
            data-testid="link-providers"
          >
            <Search className="h-4 w-4" strokeWidth={2.5} />
            {t("common.search")}
          </Link>
          <Link
            href="/services"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium whitespace-nowrap text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 hover:text-amber-800 dark:hover:text-amber-200 transition-all"
            data-testid="link-services"
          >
            <Tag className="h-4 w-4" strokeWidth={2.5} />
            {t("common.services", "Services")}
          </Link>
          <Link
            href="/group-sessions"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium whitespace-nowrap text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 hover:text-purple-800 dark:hover:text-purple-200 transition-all"
            data-testid="link-group-sessions"
          >
            <Users className="h-4 w-4" strokeWidth={2.5} />
            {t("common.groups", "Groups")}
          </Link>
          <Link
            href="/providers?type=physician"
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium whitespace-nowrap text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 hover:text-blue-800 dark:hover:text-blue-200 transition-all"
            data-testid="link-physicians"
          >
            <Stethoscope className="h-4 w-4" strokeWidth={2.5} />
            {t("common.physicians", "Physicians")}
          </Link>
          <Link
            href="/providers?type=rehabilitation"
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-800 dark:hover:text-emerald-200 transition-all"
            data-testid="link-rehabilitation"
          >
            <Activity className="h-4 w-4" strokeWidth={2.5} />
            {t("common.rehabilitation_pros", "Rehab")}
          </Link>
          <Link
            href="/providers?type=nursing"
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium whitespace-nowrap text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 hover:text-rose-800 dark:hover:text-rose-200 transition-all"
            data-testid="link-nursing"
          >
            <UserRound className="h-4 w-4" strokeWidth={2.5} />
            {t("common.nursing_pros", "Nursing")}
          </Link>
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2.5" data-testid="button-language">
                <Languages className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">
                  {i18n.language?.slice(0, 2) || "en"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[150px]">
              {[
                { code: "en", label: "English", native: "English" },
                { code: "hu", label: "Hungarian", native: "Magyar" },
                { code: "fa", label: "Persian", native: "فارسی" },
              ].map(({ code, native }) => {
                const isActive = (i18n.language || "en").startsWith(code);
                return (
                  <DropdownMenuItem
                    key={code}
                    onClick={() => changeLanguage(code)}
                    className="flex items-center justify-between gap-3"
                    data-testid={`lang-option-${code}`}
                  >
                    <span>{native}</span>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />

          {isAuthenticated && user?.role !== "provider" && <WalletBadge />}
          {isAuthenticated && <NotificationBell />}

          {authLoading ? (
            <div className="h-9 w-9 rounded-full bg-muted animate-pulse" data-testid="auth-loading" />
          ) : isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0" data-testid="button-user-menu">
                  <AvatarSM
                    src={user?.avatarUrl}
                    name={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
                    className="h-9 w-9"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center gap-2 p-2">
                  <AvatarSM
                    src={user?.avatarUrl}
                    name={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
                    className="h-8 w-8"
                  />
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium flex items-center gap-1">
                      {user?.firstName} {user?.lastName}
                      {(user as any)?.countryCode === "HU" && <span title="Hungary" data-testid="badge-country">🇭🇺</span>}
                      {(user as any)?.countryCode === "IR" && <span title="Iran" data-testid="badge-country">🇮🇷</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  {isAdminRole(user?.role) ? (
                    <Link href="/admin" className="cursor-pointer">
                      <LayoutDashboard className="me-2 h-4 w-4" />
                      {t("common.dashboard")}
                    </Link>
                  ) : user?.role === "provider" ? (
                    <Link href="/provider/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="me-2 h-4 w-4" />
                      {t("common.dashboard")}
                    </Link>
                  ) : (
                    <Link href="/patient/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="me-2 h-4 w-4" />
                      {t("common.dashboard")}
                    </Link>
                  )}
                </DropdownMenuItem>
                {isAdminRole(user?.role) && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/home" className="cursor-pointer" data-testid="link-admin-home-menu">
                      <Command className="me-2 h-4 w-4 text-indigo-500" />
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">Command Center</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/appointments" className="cursor-pointer" data-testid="link-appointments">
                    <Calendar className="me-2 h-4 w-4" />
                    {t("common.my_appointments")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/messages" className="cursor-pointer" data-testid="link-messages">
                    <MessageSquare className="me-2 h-4 w-4" />
                    {t("common.messages")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifications" className="cursor-pointer" data-testid="link-notifications">
                    <Bell className="me-2 h-4 w-4" />
                    {t("common.notifications")}
                  </Link>
                </DropdownMenuItem>
                {user?.role !== "provider" && (
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer" data-testid="link-profile">
                      <User className="me-2 h-4 w-4" />
                      {t("common.profile_label", "Profile")}
                    </Link>
                  </DropdownMenuItem>
                )}
                {user?.role !== "provider" && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer" data-testid="link-settings">
                      <Settings className="me-2 h-4 w-4" />
                      {t("common.settings")}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/support/tickets" className="cursor-pointer" data-testid="link-support-tickets">
                    <LifeBuoy className="me-2 h-4 w-4" />
                    {t("common.support_tickets", "My support tickets")}
                  </Link>
                </DropdownMenuItem>
                {!isAdminRole(user?.role) && (
                  <DropdownMenuItem asChild>
                    <Link href="/packages" className="cursor-pointer" data-testid="link-packages-menu">
                      <Gift className="me-2 h-4 w-4 text-violet-500" />
                      <span className="text-violet-600 dark:text-violet-400 font-medium">Membership Packages</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                {/* Patient-only extras */}
                {user?.role === "patient" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/health-records" className="cursor-pointer" data-testid="link-health-records-menu">
                        <Activity className="me-2 h-4 w-4 text-indigo-500" />
                        {t("common.health_records", "Health Records")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/my-reviews" className="cursor-pointer" data-testid="link-my-reviews-menu">
                        <Star className="me-2 h-4 w-4 text-amber-500" />
                        {t("common.my_reviews", "My Reviews")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/wallet" className="cursor-pointer" data-testid="link-wallet-menu">
                        <Wallet className="me-2 h-4 w-4 text-emerald-500" />
                        {t("common.wallet", "My Wallet")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/my-documents" className="cursor-pointer" data-testid="link-my-documents-menu">
                        <FileText className="me-2 h-4 w-4 text-sky-500" />
                        {t("common.my_documents", "My Documents")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/referrals" className="cursor-pointer" data-testid="link-referrals-menu">
                        <Share2 className="me-2 h-4 w-4 text-orange-500" />
                        {t("common.referrals", "Referrals")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/gift-cards" className="cursor-pointer" data-testid="link-gift-cards-menu">
                        <Gift className="me-2 h-4 w-4 text-pink-500" />
                        {t("common.gift_cards", "Gift Cards")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/membership" className="cursor-pointer" data-testid="link-membership-menu">
                        <Crown className="me-2 h-4 w-4 text-violet-500" />
                        {t("common.my_memberships", "My Memberships")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/waitlist" className="cursor-pointer" data-testid="link-waitlist-menu">
                        <Bell className="me-2 h-4 w-4 text-cyan-500" />
                        {t("common.waitlist", "My Waitlist")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/family-members" className="cursor-pointer" data-testid="link-family-members-menu">
                        <Users className="me-2 h-4 w-4 text-teal-500" />
                        {t("common.family_members", "Family Members")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/my-reports" className="cursor-pointer" data-testid="link-my-reports-menu">
                        <Bug className="me-2 h-4 w-4 text-rose-500" />
                        {t("common.my_reports", "My Reports")}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {/* Provider-only extras */}
                {user?.role === "provider" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/provider/home" className="cursor-pointer" data-testid="link-provider-home-menu">
                        <Home className="me-2 h-4 w-4 text-indigo-500" />
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">{t("common.home", "Home")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/provider/earnings" className="cursor-pointer" data-testid="link-provider-earnings-menu">
                        <TrendingUp className="me-2 h-4 w-4 text-emerald-500" />
                        {t("common.earnings_reports", "Earnings & Reports")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/provider/clinical" className="cursor-pointer" data-testid="link-clinical-dashboard-menu">
                        <Stethoscope className="me-2 h-4 w-4 text-blue-500" />
                        {t("common.clinical_dashboard", "Clinical Dashboard")}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive" data-testid="button-logout">
                  <LogOut className="me-2 h-4 w-4" />
                  {t("common.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" asChild className="font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10" data-testid="button-login">
                <Link href="/login">{t("common.login")}</Link>
              </Button>
              <Button asChild className="font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white shadow-md shadow-indigo-500/30 border-0" data-testid="button-register">
                <Link href="/register">
                  <Sparkles className="me-1.5 h-4 w-4" strokeWidth={2.5} />
                  {t("common.get_started")}
                </Link>
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background p-4 space-y-4">
          <nav className="flex flex-col gap-2">
            <Link
              href="/providers"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-blue-700 dark:text-blue-300 bg-blue-500/5 hover:bg-blue-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-providers"
            >
              <Search className="h-4 w-4" strokeWidth={2.5} />
              {t("common.search")}
            </Link>
            <Link
              href="/providers?type=physician"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-blue-700 dark:text-blue-300 bg-blue-500/5 hover:bg-blue-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-physicians"
            >
              <Stethoscope className="h-4 w-4" strokeWidth={2.5} />
              {t("common.physicians", "Medical Doctors")}
            </Link>
            <Link
              href="/providers?type=mental_health"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-violet-700 dark:text-violet-300 bg-violet-500/5 hover:bg-violet-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-mental-health"
            >
              <Activity className="h-4 w-4" strokeWidth={2.5} />
              {t("common.mental_health_pros", "Mental Health")}
            </Link>
            <Link
              href="/providers?type=rehabilitation"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-rehabilitation"
            >
              <Activity className="h-4 w-4" strokeWidth={2.5} />
              {t("common.rehabilitation_pros", "Physical Therapy")}
            </Link>
            <Link
              href="/providers?type=nursing"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-rose-700 dark:text-rose-300 bg-rose-500/5 hover:bg-rose-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-nursing"
            >
              <UserRound className="h-4 w-4" strokeWidth={2.5} />
              {t("common.nursing_pros", "Nursing")}
            </Link>
          </nav>
          {/* Authenticated mobile nav */}
          {!authLoading && isAuthenticated && (
            <div className="flex flex-col gap-1 pt-2 border-t">
              <Link
                href={getDashboardLink()}
                className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-dashboard"
              >
                <LayoutDashboard className="h-4 w-4 text-indigo-500" />
                {t("common.dashboard")}
              </Link>
              <Link
                href="/appointments"
                className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-appointments"
              >
                <Calendar className="h-4 w-4 text-blue-500" />
                {t("common.my_appointments")}
              </Link>
              <Link
                href="/messages"
                className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-messages"
              >
                <MessageSquare className="h-4 w-4 text-violet-500" />
                {t("common.messages")}
              </Link>
              <Link
                href="/notifications"
                className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-notifications"
              >
                <Bell className="h-4 w-4 text-amber-500" />
                {t("common.notifications")}
              </Link>
              {user?.role === "patient" && (
                <>
                  <Link
                    href="/health-records"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-health-records"
                  >
                    <Activity className="h-4 w-4 text-indigo-500" />
                    {t("common.health_records", "Health Records")}
                  </Link>
                  <Link
                    href="/my-reviews"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-my-reviews"
                  >
                    <Star className="h-4 w-4 text-amber-500" />
                    {t("common.my_reviews", "My Reviews")}
                  </Link>
                  <Link
                    href="/wallet"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-wallet"
                  >
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    {t("common.wallet", "My Wallet")}
                  </Link>
                  <Link
                    href="/my-documents"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-my-documents"
                  >
                    <FileText className="h-4 w-4 text-sky-500" />
                    {t("common.my_documents", "My Documents")}
                  </Link>
                  <Link
                    href="/referrals"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-referrals"
                  >
                    <Share2 className="h-4 w-4 text-orange-500" />
                    {t("common.referrals", "Referrals")}
                  </Link>
                  <Link
                    href="/gift-cards"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-gift-cards"
                  >
                    <Gift className="h-4 w-4 text-pink-500" />
                    {t("common.gift_cards", "Gift Cards")}
                  </Link>
                  <Link
                    href="/membership"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-membership"
                  >
                    <Crown className="h-4 w-4 text-violet-500" />
                    {t("common.my_memberships", "My Memberships")}
                  </Link>
                  <Link
                    href="/waitlist"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-waitlist"
                  >
                    <Bell className="h-4 w-4 text-cyan-500" />
                    {t("common.waitlist", "My Waitlist")}
                  </Link>
                  <Link
                    href="/family-members"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-family-members"
                  >
                    <Users className="h-4 w-4 text-teal-500" />
                    {t("common.family_members", "Family Members")}
                  </Link>
                  <Link
                    href="/my-reports"
                    className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-my-reports"
                  >
                    <Bug className="h-4 w-4 text-rose-500" />
                    {t("common.my_reports", "My Reports")}
                  </Link>
                </>
              )}
              {user?.role === "provider" && (
                <>
                <Link
                  href="/provider/earnings"
                  className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="mobile-link-provider-earnings"
                >
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  {t("common.earnings_reports", "Earnings & Reports")}
                </Link>
                <Link
                  href="/provider/clinical"
                  className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="mobile-link-clinical-dashboard"
                >
                  <Stethoscope className="h-4 w-4 text-blue-500" />
                  {t("common.clinical_dashboard", "Clinical Dashboard")}
                </Link>
                </>
              )}
              {user?.role !== "provider" && (
                <Link
                  href="/profile"
                  className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="mobile-link-profile"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  {t("common.profile_label", "Profile")}
                </Link>
              )}
              {user?.role !== "provider" && (
                <Link
                  href="/settings"
                  className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="mobile-link-settings"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  {t("common.settings")}
                </Link>
              )}
              <button
                className="flex items-center gap-2 text-sm font-semibold p-2.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors w-full text-start"
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                data-testid="mobile-button-logout"
              >
                <LogOut className="h-4 w-4" />
                {t("common.logout")}
              </button>
            </div>
          )}
          {!authLoading && !isAuthenticated && (
            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button variant="outline" asChild className="w-full" data-testid="mobile-button-login">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>{t("common.login")}</Link>
              </Button>
              <Button asChild className="w-full" data-testid="mobile-button-register">
                <Link href="/register" onClick={() => setMobileMenuOpen(false)}>{t("common.get_started")}</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
export default Header;
