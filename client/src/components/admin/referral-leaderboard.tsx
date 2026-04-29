import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal } from "lucide-react";

type LeaderboardRow = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  qualifiedCount: number;
  pendingCount: number;
  totalCredits: number;
  currency: string;
};

const rankIcon = (idx: number) => {
  if (idx === 0) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (idx === 1) return <Medal className="h-5 w-5 text-slate-400" />;
  if (idx === 2) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="text-sm font-mono text-muted-foreground w-5 text-center">{idx + 1}</span>;
};

export function ReferralLeaderboard() {
  const { data, isLoading } = useQuery<LeaderboardRow[]>({
    queryKey: ["/api/admin/referrals/leaderboard"],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Referral leaderboard
        </CardTitle>
        <CardDescription>
          Top patients by qualified referrals. Use this to spot power-users and consider boosted rewards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-referrers">
            No referrals yet. Once patients start sharing their code, they'll show up here.
          </p>
        ) : (
          <div className="divide-y">
            {data.map((row, idx) => {
              const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email;
              return (
                <div
                  key={row.userId}
                  className="flex items-center justify-between gap-4 py-3"
                  data-testid={`row-leaderboard-${row.userId}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center">{rankIcon(idx)}</div>
                    <div className="min-w-0">
                      <div className="font-medium truncate" data-testid={`text-name-${row.userId}`}>{name}</div>
                      <div className="text-xs text-muted-foreground truncate">{row.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <Badge variant="secondary" data-testid={`badge-qualified-${row.userId}`}>
                      {row.qualifiedCount} qualified
                    </Badge>
                    {row.pendingCount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        +{row.pendingCount} pending
                      </Badge>
                    )}
                    <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400 ml-2 whitespace-nowrap">
                      {row.currency} {row.totalCredits.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
