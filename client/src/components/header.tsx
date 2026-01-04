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
import { User, Calendar, LogOut, Settings, LayoutDashboard, Menu, X, Stethoscope, MessageSquare, Bell } from "lucide-react";
import { useState } from "react";

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase() || "U";
  };

  const getDashboardLink = () => {
    if (user?.role === "provider") return "/provider/dashboard";
    if (user?.role === "admin") return "/admin/dashboard";
    return "/patient/dashboard";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2" data-testid="link-home">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Stethoscope className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Golden Life</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link 
            href="/providers" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-providers"
          >
            Find Providers
          </Link>
          <Link 
            href="/providers?type=physiotherapist" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-physiotherapy"
          >
            Physiotherapy
          </Link>
          <Link 
            href="/providers?type=nurse" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-nursing"
          >
            Home Nursing
          </Link>
          <Link 
            href="/providers?type=doctor" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-doctors"
          >
            Doctors
          </Link>
        </nav>

        <div className="flex items-center gap-2">
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
                  {user.role === "admin" ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/admin/dashboard">Admin</Link>
                    </Button>
                  ) : user.role === "provider" ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/provider/dashboard">Dashboard</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/patient/dashboard">Dashboard</Link>
                    </Button>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/appointments" className="cursor-pointer" data-testid="link-appointments">
                    <Calendar className="mr-2 h-4 w-4" />
                    My Appointments
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/messages" className="cursor-pointer" data-testid="link-messages">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Messages
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifications" className="cursor-pointer" data-testid="link-notifications">
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer" data-testid="link-profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer" data-testid="link-settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive" data-testid="button-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" asChild data-testid="button-login">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild data-testid="button-register">
                <Link href="/register">Get Started</Link>
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
              Find Providers
            </Link>
            <Link 
              href="/providers?type=physiotherapist" 
              className="text-sm font-medium p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-physiotherapy"
            >
              Physiotherapy
            </Link>
            <Link 
              href="/providers?type=nurse" 
              className="text-sm font-medium p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-nursing"
            >
              Home Nursing
            </Link>
            <Link 
              href="/providers?type=doctor" 
              className="text-sm font-medium p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-doctors"
            >
              Doctors
            </Link>
          </nav>
          {!isAuthenticated && (
            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button variant="outline" asChild className="w-full" data-testid="mobile-button-login">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
              </Button>
              <Button asChild className="w-full" data-testid="mobile-button-register">
                <Link href="/register" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}