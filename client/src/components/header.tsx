import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Calendar, LogOut, Settings, LayoutDashboard, Menu, X, Stethoscope, MessageSquare, Bell, Languages } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase() || "U";
  };

  const getDashboardLink = () => {
    if (user?.role === "provider") return "/provider/dashboard";
    if (user?.role === "admin") return "/admin";
    return "/patient/dashboard";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-3" data-testid="link-home">
          <span className="text-xl font-semibold tracking-tight">Golden Life</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link 
            href="/providers" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-providers"
          >
            {t("common.search")}
          </Link>
          <Link 
            href="/providers?type=physiotherapist" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-physiotherapy"
          >
            {t("common.physiotherapists")}
          </Link>
          <Link 
            href="/providers?type=nurse" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-nursing"
          >
            {t("common.nurses")}
          </Link>
          <Link 
            href="/providers?type=doctor" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-doctors"
          >
            {t("common.doctors")}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Languages className="h-4 w-4" />
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

          {isAuthenticated ? (
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
                    <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  {user?.role === "admin" ? (
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
                    {t("common.profile")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer" data-testid="link-settings">
                    <Settings className="mr-2 h-4 w-4" />
                    {t("common.settings")}
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
              <Button variant="ghost" asChild data-testid="button-login">
                <Link href="/login">{t("common.login")}</Link>
              </Button>
              <Button asChild data-testid="button-register">
                <Link href="/register">{t("common.get_started")}</Link>
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
              className="text-sm font-medium p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-providers"
            >
              {t("common.search")}
            </Link>
            <Link 
              href="/providers?type=physiotherapist" 
              className="text-sm font-medium p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-physiotherapy"
            >
              {t("common.physiotherapists")}
            </Link>
            <Link 
              href="/providers?type=nurse" 
              className="text-sm font-medium p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-nursing"
            >
              {t("common.nurses")}
            </Link>
            <Link 
              href="/providers?type=doctor" 
              className="text-sm font-medium p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-doctors"
            >
              {t("common.doctors")}
            </Link>
          </nav>
          {!isAuthenticated && (
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