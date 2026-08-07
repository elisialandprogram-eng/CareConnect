import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sprout, CheckCircle2, Circle, RefreshCw, Copy, Eye, EyeOff,
  User, Stethoscope, Calendar, Wallet,
} from "lucide-react";
import { useToast as useToastHook } from "@/hooks/use-toast";

interface SeedStatus {
  patient1:     boolean;
  patient2:     boolean;
  physio:       boolean;
  physician:    boolean;
  appointments: number;
}

interface SeedAccount {
  role:     string;
  name:     string;
  email:    string;
  password: string;
}

interface SeedCounts {
  users:        number;
  providers:    number;
  services:     number;
  officeHours:  number;
  appointments: number;
  wallets:      number;
  payments:     number;
  reviews:      number;
}

interface SeedResult {
  accounts:      SeedAccount[];
  created:       SeedCounts;
  alreadyExists: boolean;
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-muted/40">
      {active
        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      }
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge
        variant={active ? "outline" : "secondary"}
        className={`ml-auto text-xs ${active ? "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700" : ""}`}
        data-testid={`badge-seed-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {active ? "exists" : "missing"}
      </Badge>
    </div>
  );
}

function CreatedCountRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant="outline" className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
        +{value}
      </Badge>
    </div>
  );
}

function AccountCard({ acct }: { acct: SeedAccount }) {
  const [showPw, setShowPw] = useState(false);
  const { toast } = useToastHook();

  function copy(val: string, label: string) {
    navigator.clipboard.writeText(val).then(() => {
      toast({ title: `${label} copied`, description: val });
    }).catch(() => {});
  }

  const isProvider = acct.role === "provider";

  return (
    <div
      className="rounded-md border bg-muted/30 p-3 space-y-2"
      data-testid={`card-seed-account-${acct.email}`}
    >
      <div className="flex items-center gap-2">
        {isProvider
          ? <Stethoscope className="h-4 w-4 text-blue-500 shrink-0" />
          : <User className="h-4 w-4 text-violet-500 shrink-0" />
        }
        <span className="text-sm font-medium">{acct.name}</span>
        <Badge
          variant="outline"
          className={`ml-auto text-xs capitalize ${isProvider ? "text-blue-600 dark:text-blue-400" : "text-violet-600 dark:text-violet-400"}`}
        >
          {acct.role}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground font-mono truncate">{acct.email}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => copy(acct.email, "Email")}
            data-testid={`button-copy-email-${acct.email}`}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground font-mono">
            {showPw ? acct.password : "•".repeat(acct.password.length)}
          </span>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowPw((p) => !p)}
              data-testid={`button-toggle-pw-${acct.email}`}
            >
              {showPw ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => copy(acct.password, "Password")}
              data-testid={`button-copy-pw-${acct.email}`}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SeedUatTool() {
  const { toast } = useToast();
  const [result, setResult] = useState<SeedResult | null>(null);

  const { data: status, refetch: refetchStatus, isLoading: statusLoading } =
    useQuery<SeedStatus>({
      queryKey: ["/api/admin/dev/seed/status"],
      refetchOnWindowFocus: false,
    });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/dev/seed/execute");
      return res.json() as Promise<SeedResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dev/reset/history"] });
      const newCount = Object.values(data.created).reduce((a, b) => a + b, 0);
      toast({
        title: data.alreadyExists ? "UAT data already seeded" : "UAT data seeded",
        description: data.alreadyExists
          ? "All accounts already exist — no changes made."
          : `Created ${newCount} records across 4 UAT accounts.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    },
  });

  const allPresent = status?.patient1 && status?.patient2 && status?.physio && status?.physician;

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header card */}
      <Card className="border-emerald-300/50 dark:border-emerald-700/40 bg-emerald-50/40 dark:bg-emerald-950/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <CardTitle className="text-emerald-700 dark:text-emerald-400">Seed UAT Data</CardTitle>
          </div>
          <CardDescription>
            Populates the platform with 2 patient and 2 provider accounts, services, scheduled
            appointments, wallets, and reviews — ready for end-to-end UAT testing.
            Safe to run multiple times; existing accounts are never overwritten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Account status */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Seed account status
            </p>
            <StatusDot active={!!status?.patient1} label="Emma Kovács (patient)" />
            <StatusDot active={!!status?.patient2} label="Dávid Barros (patient)" />
            <StatusDot active={!!status?.physio}   label="Dr. Anna Szabó (rehabilitation)" />
            <StatusDot active={!!status?.physician} label="Dr. Bence Molnár (physician)" />
            {status && (
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-muted/40">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">Appointments seeded</span>
                <Badge variant="outline" className="ml-auto font-mono text-xs">
                  {status.appointments}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-seed-uat"
            >
              <Sprout className="h-4 w-4 mr-2" />
              {seedMutation.isPending
                ? "Seeding…"
                : allPresent
                  ? "Re-Seed (idempotent)"
                  : "Seed UAT Data"
              }
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchStatus()}
              disabled={statusLoading}
              data-testid="button-refresh-seed-status"
              title="Refresh status"
            >
              <RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Result — credentials */}
      {result && (
        <Card className="border-emerald-300 dark:border-emerald-700">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {result.alreadyExists ? "Existing Credentials" : "Seed Complete — Credentials"}
            </CardTitle>
            <CardDescription>
              {result.alreadyExists
                ? "All accounts already existed. No data was modified."
                : "Use these accounts to walk through the full booking, payment, and review workflows."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Created counts */}
            {!result.alreadyExists && (
              <>
                <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Records created
                  </p>
                  <CreatedCountRow label="Users"        value={result.created.users} />
                  <CreatedCountRow label="Providers"    value={result.created.providers} />
                  <CreatedCountRow label="Services"     value={result.created.services} />
                  <CreatedCountRow label="Office hours" value={result.created.officeHours} />
                  <CreatedCountRow label="Appointments" value={result.created.appointments} />
                  <CreatedCountRow label="Wallets"      value={result.created.wallets} />
                  <CreatedCountRow label="Payments"     value={result.created.payments} />
                  <CreatedCountRow label="Reviews"      value={result.created.reviews} />
                </div>
                <Separator />
              </>
            )}

            {/* Account cards */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Login credentials
              </p>
              {result.accounts.map((acct) => (
                <AccountCard key={acct.email} acct={acct} />
              ))}
            </div>

            {/* UAT scenario hints */}
            <div className="rounded-md border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                UAT scenarios covered
              </p>
              <ul className="text-xs text-blue-700/80 dark:text-blue-300/80 space-y-1 list-disc list-inside">
                <li>Patient booking flow (online, home, clinic)</li>
                <li>Provider dashboard — upcoming &amp; past appointments</li>
                <li>Review submission (2 completed appointments pre-seeded)</li>
                <li>Wallet balance — patients have $150 / $200 pre-loaded</li>
                <li>Provider profiles visible on /providers listing</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
