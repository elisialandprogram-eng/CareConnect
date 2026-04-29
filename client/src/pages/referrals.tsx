import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Share2, Check, Users, Sparkles } from "lucide-react";

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

export default function ReferralsPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const { data, isLoading } = useQuery<ReferralsResponse>({
    queryKey: ["/api/referrals/me"],
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
    if (navigator.share) {
      try {
        await navigator.share({
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
  const currency = data?.rewards.currency ?? "USD";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-referrals">
            <Gift className="h-7 w-7 text-primary" />
            Refer a friend, earn wallet credit
          </h1>
          <p className="text-muted-foreground">
            Share your code with a friend. When they finish their first appointment, you both
            earn {currency} {data?.rewards.referrer ?? "—"} in wallet credit.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card data-testid="card-stat-earned">
            <CardHeader className="pb-2">
              <CardDescription>Total earned</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-1">
                <Sparkles className="h-5 w-5 text-amber-500" />
                {isLoading ? <Skeleton className="h-7 w-20" /> : `${currency} ${(data?.totalEarned ?? 0).toFixed(2)}`}
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
              Friends use this code at signup. They get {currency} {data?.rewards.referred ?? "—"} as a
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
            ) : !data?.referrals.length ? (
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
                          +{r.rewardCurrency || currency} {Number(r.rewardAmount).toFixed(2)}
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
      </main>
      <Footer />
    </div>
  );
}
