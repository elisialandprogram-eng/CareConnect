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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Calendar, LogOut, Settings, LayoutDashboard, Menu, X, Stethoscope, MessageSquare, Bell, Languages, Wallet, LifeBuoy, Search, HeartPulse, Sparkles, Activity, UserRound, Tag } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { isAdminRole } from "@/lib/roles";
import { useState } from "react";
import { useTranslation } from "react-i18next";

function WalletBadge() {
  const [, navigate] = useLocation();
  const { format: formatCurrency } = useCurrency();
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
        {isLoading ? "…" : formatCurrency(balance)}
      </span>
    </Button>
  );
}

function NotificationBell() {
  const [, navigate] = useLocation();
  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
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
          className="absolute -top-1 -right-1 h-4 min-w-[1rem] px-1 text-[10px] leading-none flex items-center justify-center bg-gradient-to-br from-rose-500 to-pink-600 text-white border border-white dark:border-background shadow-md"
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
        <Link href="/" className="flex items-center gap-2.5 group" data-testid="link-home">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 transition-transform group-hover:scale-105">
            <HeartPulse className="h-5 w-5 text-white" strokeWidth={2.5} />
            <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-amber-300 drop-shadow" strokeWidth={3} />
          </span>
          <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400">
            Golden Life
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1.5">
          <Link
            href="/providers"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 hover:text-blue-800 dark:hover:text-blue-200 transition-all"
            data-testid="link-providers"
          >
            <Search className="h-4 w-4" strokeWidth={2.5} />
            {t("common.search")}
          </Link>
          <Link
            href="/services"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 hover:text-amber-800 dark:hover:text-amber-200 transition-all"
            data-testid="link-services"
          >
            <Tag className="h-4 w-4" strokeWidth={2.5} />
            {t("common.services", "Services")}
          </Link>
          <Link
            href="/providers?type=physiotherapist"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-800 dark:hover:text-emerald-200 transition-all"
            data-testid="link-physiotherapy"
          >
            <Activity className="h-4 w-4" strokeWidth={2.5} />
            {t("common.physiotherapists")}
          </Link>
          <Link
            href="/providers?type=nurse"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 hover:text-rose-800 dark:hover:text-rose-200 transition-all"
            data-testid="link-nursing"
          >
            <UserRound className="h-4 w-4" strokeWidth={2.5} />
            {t("common.nurses")}
          </Link>
          <Link
            href="/providers?type=doctor"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 hover:text-purple-800 dark:hover:text-purple-200 transition-all"
            data-testid="link-doctors"
          >
            <Stethoscope className="h-4 w-4" strokeWidth={2.5} />
            {t("common.doctors")}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30" data-testid="button-language">
                <Languages className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => changeLanguage('en')}>
                English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('hu')}>
                Magyar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('fa')}>
                فارسی (Persian)
              </DropdownMenuItem>
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
                <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-user-menu">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.avatarUrl || undefined} alt={user?.firstName} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {getInitials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {getInitials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
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
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      {t("common.dashboard")}
                    </Link>
                  ) : user?.role === "provider" ? (
                    <Link href="/provider/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      {t("common.dashboard")}
                    </Link>
                  ) : (
                    <Link href="/patient/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      {t("common.dashboard")}
                    </Link>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/appointments" className="cursor-pointer" data-testid="link-appointments">
                    <Calendar className="mr-2 h-4 w-4" />
                    {t("common.my_appointments")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/messages" className="cursor-pointer" data-testid="link-messages">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t("common.messages")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifications" className="cursor-pointer" data-testid="link-notifications">
                    <Bell className="mr-2 h-4 w-4" />
                    {t("common.notifications")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer" data-testid="link-profile">
                    <User className="mr-2 h-4 w-4" />
                    {t("common.profile_label", "Profile")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer" data-testid="link-settings">
                    <Settings className="mr-2 h-4 w-4" />
                    {t("common.settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/support/tickets" className="cursor-pointer" data-testid="link-support-tickets">
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    {t("common.support_tickets", "My support tickets")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive" data-testid="button-logout">
                  <LogOut className="mr-2 h-4 w-4" />
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
                  <Sparkles className="mr-1.5 h-4 w-4" strokeWidth={2.5} />
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
              href="/providers?type=physiotherapist"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-physiotherapy"
            >
              <Activity className="h-4 w-4" strokeWidth={2.5} />
              {t("common.physiotherapists")}
            </Link>
            <Link
              href="/providers?type=nurse"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-rose-700 dark:text-rose-300 bg-rose-500/5 hover:bg-rose-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-nursing"
            >
              <UserRound className="h-4 w-4" strokeWidth={2.5} />
              {t("common.nurses")}
            </Link>
            <Link
              href="/providers?type=doctor"
              className="flex items-center gap-2 text-sm font-bold p-2.5 rounded-lg text-purple-700 dark:text-purple-300 bg-purple-500/5 hover:bg-purple-500/15 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-doctors"
            >
              <Stethoscope className="h-4 w-4" strokeWidth={2.5} />
              {t("common.doctors")}
            </Link>
          </nav>
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
