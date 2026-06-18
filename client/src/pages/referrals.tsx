import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { QK } from "@/lib/query-keys";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { Gift, Copy, Share2, Check, Users, Sparkles, Trophy, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";


type ReferralRow = {
  id: string;
  status: "pending" | "qualified";
  rewardAmount: string | null;
  rewardCurrency: string | null;
  qualifiedAt: string | null;
  createdAt: string;
  referredUser: { firstName: string; lastName: string } | null;
};

type ReferralsResponse = {
  code: string;
  shareUrl: string;
  rewards: { referrer: number; referred: number; currency: string };
  totalEarned: number;
  referrals: ReferralRow[];
};

type LeaderboardRow = {
  rank: number;
  name: string;
  referralCount: number;
  totalEarned: number;
};

export default function ReferralsPage() {
  usePageTitle("Refer a Friend | Golden Life");
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const { data: leaderboard, isLoading: lbLoading } = useQuery<LeaderboardRow[]>({
    queryKey: ["/api/referrals/leaderboard"],
    enabled: showLeaderboard,
  });

  const { data, isLoading, isError } = useQuery<ReferralsResponse>({
    queryKey: QK.referrals(),
  });

  const handleCopy = async (text: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!data?.shareUrl) return;
    /* analytics */
    apiRequest("POST", "/api/analytics/track", {
      event: "referral_shared",
      properties: { method: "share" in navigator ? "native_share" : "copy_link" },
    }).catch(() => {});
    if ("share" in navigator) {
      try {
        await (navigator as any).share({
          title: "Join me on Golden Life",
          text: `Get a wallet bonus when you book your first appointment with my referral code.`,
          url: data.shareUrl,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      handleCopy(data.shareUrl, "link");
    }
  };

  const qualified = data?.referrals.filter((r) => r.status === "qualified").length ?? 0;
  const pending = data?.referrals.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <PageBreadcrumbs items={[{ label: "Referrals" }]} />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-referrals">
            <Gift className="h-7 w-7 text-primary" />
            Refer a friend, earn wallet credit
          </h1>
          <p className="text-muted-foreground">
            Share your code with a friend. When they finish their first appointment, you both
            earn {fmtMoney(data?.rewards.referrer ?? 0)} in wallet credit.
          </p>
        </div>

        {/* Error state */}
        {isError && (
          <Card data-testid="card-referrals-error">
            <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-10 w-10 text-destructive opacity-60" />
              <p className="font-semibold text-destructive">Failed to load your referral data</p>
              <p className="text-sm text-muted-foreground">Please check your connection and try again.</p>
              <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QK.referrals() })} data-testid="button-retry-referrals">
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card data-testid="card-stat-earned">
            <CardHeader className="pb-2">
              <CardDescription>Total earned</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-1">
                <Sparkles className="h-5 w-5 text-amber-500" />
                {isLoading ? <Skeleton className="h-7 w-20" /> : fmtMoney(data?.totalEarned ?? 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card data-testid="card-stat-qualified">
            <CardHeader className="pb-2">
              <CardDescription>Successful referrals</CardDescription>
              <CardTitle className="text-2xl">
                {isLoading ? <Skeleton className="h-7 w-12" /> : qualified}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card data-testid="card-stat-pending">
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-2xl">
                {isLoading ? <Skeleton className="h-7 w-12" /> : pending}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Code + share */}
        <Card>
          <CardHeader>
            <CardTitle>Your referral code</CardTitle>
            <CardDescription>
              Friends use this code at signup. They get {fmtMoney(data?.rewards.referred ?? 0)} as a
              welcome bonus.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  readOnly
                  value={data?.code ?? ""}
                  className="font-mono text-lg tracking-widest text-center"
                  data-testid="input-referral-code"
                />
                <Button
                  variant="outline"
                  onClick={() => data?.code && handleCopy(data.code, "code")}
                  data-testid="button-copy-code"
                >
                  {copied === "code" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copy code
                </Button>
              </div>
            )}

            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  readOnly
                  value={data?.shareUrl ?? ""}
                  className="text-sm"
                  data-testid="input-referral-link"
                />
                <Button
                  variant="outline"
                  onClick={() => data?.shareUrl && handleCopy(data.shareUrl, "link")}
                  data-testid="button-copy-link"
                >
                  {copied === "link" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copy link
                </Button>
                <Button onClick={handleShare} data-testid="button-share-link">
                  <Share2 className="h-4 w-4 mr-1" />
                  Share
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Friends you've referred
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !data?.referrals?.length ? (
              <p className="text-muted-foreground text-sm py-6 text-center" data-testid="text-no-referrals">
                You haven't referred anyone yet. Share your code above to get started.
              </p>
            ) : (
              <div className="divide-y">
                {data.referrals.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-3"
                    data-testid={`row-referral-${r.id}`}
                  >
                    <div>
                      <div className="font-medium">
                        {r.referredUser
                          ? `${r.referredUser.firstName} ${r.referredUser.lastName}`
                          : "A friend"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Joined {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.status === "qualified" && r.rewardAmount && (
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          +{fmtMoney(r.rewardAmount ?? 0)}
                        </span>
                      )}
                      <Badge
                        variant={r.status === "qualified" ? "default" : "secondary"}
                        data-testid={`badge-status-${r.id}`}
                      >
                        {r.status === "qualified" ? "Rewarded" : "Pending first visit"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {/* Leaderboard */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Referral Leaderboard
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLeaderboard(v => !v)}
                data-testid="button-toggle-leaderboard"
              >
                {showLeaderboard ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                {showLeaderboard ? "Hide" : "Show top referrers"}
              </Button>
            </div>
            {!showLeaderboard && (
              <p className="text-sm text-muted-foreground mt-1">See who's referred the most friends on Golden Life.</p>
            )}
          </CardHeader>
          {showLeaderboard && (
            <CardContent>
              {lbLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !leaderboard?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-leaderboard-empty">No data yet — be the first to refer!</p>
              ) : (
                <div className="divide-y">
                  {leaderboard.map((row) => (
                    <div key={row.rank} className="flex items-center gap-3 py-3" data-testid={`row-leaderboard-${row.rank}`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        row.rank === 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                        row.rank === 2 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" :
                        row.rank === 3 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {row.rank <= 3 ? ["🥇","🥈","🥉"][row.rank - 1] : row.rank}
                      </span>
                      <span className="flex-1 font-medium text-sm">{row.name}</span>
                      <span className="text-sm text-muted-foreground">{row.referralCount} referral{row.referralCount !== 1 ? "s" : ""}</span>
                      {row.totalEarned > 0 && (
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmtMoney(row.totalEarned)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
