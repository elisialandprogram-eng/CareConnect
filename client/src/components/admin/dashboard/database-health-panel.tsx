import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  Activity,
  RefreshCw,
  Server,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface DbHealthResponse {
  pool: {
    total: number;
    idle: number;
    waiting: number;
    max: number;
  };
  connections: {
    byState: Array<{
      state: string;
      count: number;
      waitEventType: string | null;
    }>;
  };
  topTables: Array<{
    table: string;
    liveRows: number;
    deadRows: number;
    lastAutovacuum: string | null;
    lastAnalyze: string | null;
  }>;
  cacheHitRate: {
    heap: number;
    index: number;
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function CacheGauge({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 95 ? "text-emerald-600" : pct >= 85 ? "text-amber-500" : "text-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${color}`}>{pct.toFixed(1)}%</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

export function DatabaseHealthPanel() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<DbHealthResponse>({
    queryKey: ["/api/admin/health/database", refreshKey],
    refetchInterval: 30_000,
  });

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const poolUtil = data
    ? Math.round(((data.pool.total - data.pool.idle) / data.pool.max) * 100)
    : 0;

  const poolColor =
    poolUtil >= 80 ? "text-red-600" : poolUtil >= 60 ? "text-amber-500" : "text-emerald-600";

  return (
    <div className="space-y-5" data-testid="database-health-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Database Health
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live pool stats, table metrics, and cache hit rates
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Updated {timeAgo(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            data-testid="button-refresh-db-health"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load database health. Check server logs.
        </div>
      )}

      {/* ── Pool Stats ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total Connections", value: data?.pool.total ?? "—", sub: `of ${data?.pool.max ?? 5} max` },
          { label: "Idle", value: data?.pool.idle ?? "—", sub: "available immediately" },
          { label: "Active", value: data ? data.pool.total - data.pool.idle : "—", sub: `${poolUtil}% utilization` },
          { label: "Waiting", value: data?.pool.waiting ?? "—", sub: "queue depth" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-muted/40">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Server className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <div className={`text-2xl font-bold ${stat.label === "Active" ? poolColor : ""}`}>
                {stat.value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Pool Utilization Bar ── */}
      {data && (
        <Card className="bg-muted/40">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">Pool Utilization</span>
              <span className={`font-semibold ${poolColor}`}>{poolUtil}%</span>
            </div>
            <Progress value={poolUtil} className="h-3" />
          </CardContent>
        </Card>
      )}

      {/* ── Cache Hit Rates ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Buffer Cache Hit Rates
            {data && data.cacheHitRate.heap >= 95 && data.cacheHitRate.index >= 95 && (
              <Badge variant="outline" className="ml-auto text-emerald-600 border-emerald-300 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Optimal
              </Badge>
            )}
            {data && (data.cacheHitRate.heap < 85 || data.cacheHitRate.index < 85) && (
              <Badge variant="outline" className="ml-auto text-amber-600 border-amber-300 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Degraded
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-4 bg-muted rounded animate-pulse" />
            </div>
          ) : (
            <>
              <CacheGauge label="Heap (table) cache hit rate" value={data?.cacheHitRate.heap ?? 0} />
              <CacheGauge label="Index cache hit rate" value={data?.cacheHitRate.index ?? 0} />
              <p className="text-xs text-muted-foreground">
                Target ≥ 95%. Values below 85% indicate memory pressure — consider increasing
                shared_buffers or upgrading the Supabase plan.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Active Connections by State ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Active PG Connections (pg_stat_activity)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-20 bg-muted rounded animate-pulse" />
          ) : !data?.connections.byState.length ? (
            <p className="text-sm text-muted-foreground">No active connections visible.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.connections.byState.map((row, i) => (
                <div
                  key={i}
                  className="rounded-md border px-3 py-2 text-sm bg-muted/40"
                  data-testid={`badge-conn-state-${row.state}`}
                >
                  <span className="font-medium capitalize">{row.state}</span>
                  <span className="ml-2 text-muted-foreground">×{row.count}</span>
                  {row.waitEventType && (
                    <span className="ml-1 text-xs text-amber-600">({row.waitEventType})</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Top Tables ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Top Tables by Row Count
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-40 bg-muted rounded animate-pulse m-4" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">Live Rows</TableHead>
                  <TableHead className="text-right">Dead Rows</TableHead>
                  <TableHead className="text-right">Bloat %</TableHead>
                  <TableHead className="text-right">Last Autovacuum</TableHead>
                  <TableHead className="text-right">Last Analyze</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.topTables.map((t) => {
                  const total = t.liveRows + t.deadRows;
                  const bloatPct = total > 0 ? Math.round((t.deadRows / total) * 100) : 0;
                  return (
                    <TableRow key={t.table} data-testid={`row-table-${t.table}`}>
                      <TableCell className="font-mono text-xs">{t.table}</TableCell>
                      <TableCell className="text-right text-sm">{formatNumber(t.liveRows)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={t.deadRows > 1000 ? "text-amber-600 font-medium" : ""}>
                          {formatNumber(t.deadRows)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={bloatPct > 20 ? "text-red-600 font-medium" : bloatPct > 10 ? "text-amber-600" : ""}>
                          {bloatPct}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {timeAgo(t.lastAutovacuum)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {timeAgo(t.lastAnalyze)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
