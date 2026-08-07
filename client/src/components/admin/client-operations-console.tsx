import { useState, useMemo, useCallback } from "react";
import { useAdminCurrency } from "@/lib/currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Search, Users, Mail, Phone, MapPin, Globe, Calendar,
  DollarSign, Activity, RefreshCw, Send, Lock, Unlock,
  Loader2, User as UserIcon, Filter, ChevronRight, Ban,
  CheckCircle, XCircle, Bell, Wallet, Receipt, Clock,
  TrendingUp, AlertCircle, Shield, Trash2, Heart,
  ClipboardList, ArrowUpRight, ArrowDownRight, Hash,
  Languages, Stethoscope, CreditCard, Package, ShieldOff,
} from "lucide-react";
import { format } from "date-fns";
import type { User } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClientListItem extends Omit<User, 'isSuspended'> {
  isSuspended?: boolean;
}

interface WalletData {
  id: string;
  userId: string;
  balance: string;
  currency: string;
  isFrozen: boolean;
}

interface WalletTx {
  id: string;
  type: string;
  status: string;
  amount: string;
  balanceAfter: string;
  description?: string;
  createdAt: string;
}

interface BookingItem {
  id: string;
  status: string;
  date: string;
  startTime?: string;
  totalPrice?: string;
  currency?: string;
  notes?: string;
  createdAt: string;
}

interface UserPackageItem {
  id: string;
  user_id: string;
  package_id: string;
  status: string;
  price_paid: string;
  purchased_at: string;
  activated_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  package_name: string;
  package_price: string;
  user_name: string;
  email: string;
  auto_renew: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clientName(u: ClientListItem) {
  return `${u.firstName || ""} ${u.lastName || ""}`.trim() || "—";
}

function roleColor(role: string) {
  if (role === "global_admin") return "bg-purple-100 text-purple-700";
  if (role === "admin") return "bg-blue-100 text-blue-700";
  if (role === "provider") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}


function txIcon(type: string) {
  if (type === "topup" || type === "adjustment_credit" || type === "refund") return ArrowUpRight;
  return ArrowDownRight;
}

function txColor(type: string) {
  if (type === "topup" || type === "adjustment_credit" || type === "refund") return "text-green-600";
  return "text-red-600";
}

// ─── Left Panel: Client Directory ────────────────────────────────────────────
function ClientDirectory({
  clients,
  selectedId,
  onSelect,
}: {
  clients: ClientListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (roleFilter !== "all" && c.role !== roleFilter) return false;
      if (countryFilter !== "all" && c.countryCode !== countryFilter) return false;
      if (statusFilter === "suspended" && !c.isSuspended) return false;
      if (statusFilter === "active" && c.isSuspended) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        clientName(c).toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    });
  }, [clients, search, roleFilter, countryFilter, statusFilter]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            Clients <span className="text-slate-400 font-normal">({filtered.length})</span>
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setShowFilters(!showFilters)} className="h-7 w-7 p-0" data-testid="button-toggle-client-filters">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-client-search"
          />
        </div>
        {showFilters && (
          <div className="space-y-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-7 text-xs" data-testid="select-client-role-filter">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="patient">Client</SelectItem>
                <SelectItem value="provider">Provider</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="global_admin">Global Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="h-7 text-xs" data-testid="select-client-country-filter">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                <SelectItem value="HU">Hungary</SelectItem>
                <SelectItem value="IR">Iran</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 text-xs" data-testid="select-client-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">No clients match</div>
          )}
          {filtered.map((c) => {
            const isSelected = selectedId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                data-testid={`button-select-client-${c.id}`}
                className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-950/30 border-r-2 border-blue-500" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarImage src={c.avatarUrl || ""} />
                    <AvatarFallback className="text-xs font-medium bg-gradient-to-br from-teal-100 to-blue-100 dark:from-teal-900 dark:to-blue-900 text-teal-700 dark:text-teal-300">
                      {c.firstName?.[0] || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {clientName(c)}
                      </span>
                      {c.isSuspended && (
                        <Ban className="h-3 w-3 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor(c.role)}`}>
                        {c.role}
                      </span>
                      {c.countryCode && (
                        <span className="text-[10px] text-slate-400">{c.countryCode}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">{c.email}</div>
                  </div>
                  <ChevronRight className={`h-3.5 w-3.5 text-slate-300 flex-shrink-0 ${isSelected ? "text-blue-400" : ""}`} />
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Center Panel: Client Workspace ──────────────────────────────────────────
function ClientWorkspace({
  client,
  onRefresh,
}: {
  client: ClientListItem;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const { format: fmtUSD } = useAdminCurrency();
  const fullName = clientName(client);

  const { data: walletData, isLoading: walletLoading } = useQuery<WalletData>({
    queryKey: ["/api/wallet", client.id],
    queryFn: () =>
      apiRequest("GET", `/api/admin/wallets/${client.id}`).then((r) => r.json()),
    enabled: !!client.id,
  });

  const { data: txData, isLoading: txLoading } = useQuery<WalletTx[]>({
    queryKey: ["/api/admin/wallets", client.id, "transactions"],
    queryFn: () =>
      apiRequest("GET", `/api/admin/wallets/${client.id}/transactions`).then((r) => r.json()),
    enabled: !!client.id,
  });

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery<BookingItem[]>({
    queryKey: ["/api/admin/bookings", client.id],
    queryFn: () =>
      apiRequest("GET", `/api/admin/bookings?userId=${client.id}&limit=50`).then((r) => r.json()),
    enabled: !!client.id,
  });

  const { data: packagesData, isLoading: packagesLoading, refetch: refetchPackages } = useQuery<{ purchases: UserPackageItem[]; total: number }>({
    queryKey: ["/api/admin/user-packages", client.id],
    queryFn: () =>
      apiRequest("GET", `/api/admin/user-packages?userId=${client.id}&limit=100`).then((r) => r.json()),
    enabled: !!client.id,
  });

  const disablePackageMutation = useMutation({
    mutationFn: async (pkgId: string) => {
      const r = await apiRequest("PATCH", `/api/admin/user-packages/${pkgId}/disable`, {});
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).message || "Failed to disable package");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Package disabled", description: "The package has been cancelled for this user." });
      refetchPackages();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const bookings: BookingItem[] = Array.isArray(bookingsData) ? bookingsData : [];
  const transactions: WalletTx[] = Array.isArray(txData) ? txData : [];

  const completedCount = bookings.filter((b) => b.status === "completed").length;
  const cancelledCount = bookings.filter((b) =>
    ["cancelled", "cancelled_by_patient", "cancelled_by_provider"].includes(b.status)
  ).length;
  const activeCount = bookings.filter((b) =>
    ["confirmed", "in_progress", "approved"].includes(b.status)
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Workspace Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 flex-shrink-0">
            <AvatarImage src={client.avatarUrl || ""} />
            <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-teal-100 to-blue-100 dark:from-teal-900 dark:to-blue-900 text-teal-700 dark:text-teal-300">
              {client.firstName?.[0] || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{fullName}</h2>
              {client.isEmailVerified && <CheckCircle className="h-4 w-4 text-green-500" />}
              {client.isSuspended && <Badge variant="destructive" className="text-xs">Suspended</Badge>}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(client.role)}`}>
                {client.role}
              </span>
              {client.countryCode && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Globe className="h-3 w-3" />{client.countryCode}
                </span>
              )}
              <span className="text-xs text-slate-400">ID: {client.id?.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {client.email && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Mail className="h-3 w-3" />{client.email}
                </span>
              )}
              {client.createdAt && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />Joined {format(new Date(client.createdAt), "MMM yyyy")}
                </span>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-8 flex-shrink-0" onClick={onRefresh} data-testid="button-refresh-workspace">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-4 gap-3 lg:grid-cols-6">
          {[
            { icon: Calendar, label: "Bookings", value: bookings.length },
            { icon: CheckCircle, label: "Completed", value: completedCount },
            { icon: Activity, label: "Active", value: activeCount },
            { icon: XCircle, label: "Cancelled", value: cancelledCount },
            { icon: Wallet, label: "Balance", value: walletData ? fmtUSD(walletData.balance) : "—" },
            { icon: Receipt, label: "Transactions", value: transactions.length },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2.5 text-center">
              <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1" />
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none truncate">{value}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 bg-white dark:bg-slate-950">
          <TabsList className="h-auto bg-transparent border-0 p-0 gap-0 overflow-x-auto flex">
            {["overview", "bookings", "wallet", "health", "packages"].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                data-testid={`tab-client-${tab}`}
                className="text-xs capitalize px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-teal-500 data-[state=active]:bg-transparent data-[state=active]:text-teal-600 dark:data-[state=active]:text-teal-400"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {/* OVERVIEW */}
          <TabsContent value="overview" className="p-5 space-y-5 mt-0">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Contact</h3>
                <div className="space-y-2 text-sm">
                  {[
                    { icon: Mail, label: "Email", value: client.email },
                    { icon: Phone, label: "Phone", value: client.phone },
                    { icon: MapPin, label: "City", value: client.city },
                    { icon: Globe, label: "Country", value: client.countryCode },
                    { icon: Hash, label: "ID", value: client.id },
                  ].map(({ icon: Icon, label, value }) => value ? (
                    <div key={label} className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-slate-400 text-xs w-16 flex-shrink-0">{label}</span>
                      <span className="text-sm truncate">{value}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Account</h3>
                <div className="space-y-2 text-sm">
                  {[
                    { label: "Role", value: client.role },
                    { label: "Status", value: client.isSuspended ? "Suspended" : "Active" },
                    { label: "Email verified", value: client.isEmailVerified ? "Yes" : "No" },
                    { label: "Language", value: client.languagePreference },
                    { label: "Currency", value: client.preferredCurrency },
                    { label: "Timezone", value: client.timezone },
                    { label: "Suspension reason", value: client.suspensionReason },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex items-start gap-2">
                      <span className="text-slate-400 text-xs w-28 flex-shrink-0 pt-0.5">{label}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{value}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            </div>
            {/* Address */}
            {(client.address || client.zipCode) && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Address</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {[client.address, client.zipCode, client.state, client.city].filter(Boolean).join(", ")}
                </p>
              </div>
            )}
          </TabsContent>

          {/* BOOKINGS */}
          <TabsContent value="bookings" className="p-5 space-y-4 mt-0">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total", value: bookings.length, color: "text-slate-900 dark:text-slate-100" },
                { label: "Completed", value: completedCount, color: "text-green-600" },
                { label: "Active", value: activeCount, color: "text-blue-600" },
                { label: "Cancelled", value: cancelledCount, color: "text-red-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 text-center">
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-slate-400 mt-1">{label}</div>
                </div>
              ))}
            </div>

            {bookingsLoading && (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            )}

            {!bookingsLoading && bookings.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">No bookings found</div>
            )}

            <div className="space-y-2">
              {bookings.slice(0, 30).map((b) => (
                <div key={b.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.status} className="text-[10px] px-1.5 py-0.5" />
                      <span className="text-xs text-slate-500">{b.date}</span>
                      {b.startTime && <span className="text-xs text-slate-400">{b.startTime}</span>}
                    </div>
                    {b.notes && (
                      <p className="text-xs text-slate-400 mt-1 truncate">{b.notes}</p>
                    )}
                  </div>
                  {b.totalPrice && (
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-shrink-0">
                      {b.totalPrice} {b.currency}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* WALLET */}
          <TabsContent value="wallet" className="p-5 space-y-4 mt-0">
            {walletLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : walletData ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-teal-50 to-blue-50 dark:from-teal-950/30 dark:to-blue-950/30 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Wallet Balance</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {fmtUSD(walletData.balance)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Wallet className="h-8 w-8 text-teal-400" />
                    {walletData.isFrozen && (
                      <Badge variant="destructive" className="text-xs">Frozen</Badge>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-sm">No wallet found</div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Recent Transactions ({transactions.length})
              </h3>
              {txLoading && (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              )}
              {!txLoading && transactions.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-sm">No transactions</div>
              )}
              <div className="space-y-2">
                {transactions.slice(0, 20).map((tx) => {
                  const Icon = txIcon(tx.type);
                  const color = txColor(tx.type);
                  return (
                    <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                      <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 capitalize">
                            {tx.type.replace(/_/g, " ")}
                          </span>
                          <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                            tx.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {tx.status}
                          </span>
                        </div>
                        {tx.description && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{tx.description}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-bold ${color}`}>{tx.amount}</div>
                        {tx.createdAt && (
                          <div className="text-[10px] text-slate-400">{format(new Date(tx.createdAt), "MMM d")}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* HEALTH */}
          <TabsContent value="health" className="p-5 space-y-5 mt-0">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" />Basic Health Info
                </h3>
                <div className="space-y-2">
                  {[
                    { label: "Blood group", value: (client as any).bloodGroup },
                    { label: "Height", value: (client as any).heightCm ? `${(client as any).heightCm} cm` : null },
                    { label: "Weight", value: (client as any).weightKg ? `${(client as any).weightKg} kg` : null },
                    { label: "Date of birth", value: (client as any).dateOfBirth },
                    { label: "Gender", value: (client as any).gender },
                    { label: "Occupation", value: (client as any).occupation },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex items-start gap-2">
                      <span className="text-slate-400 text-xs w-28 flex-shrink-0 pt-0.5">{label}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{value}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />Medical History
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Known allergies", value: (client as any).knownAllergies },
                    { label: "Medical conditions", value: (client as any).medicalConditions },
                    { label: "Current medications", value: (client as any).currentMedications },
                    { label: "Past surgeries", value: (client as any).pastSurgeries },
                  ].map(({ label, value }) => value ? (
                    <div key={label}>
                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 rounded p-2">{value}</p>
                    </div>
                  ) : null)}
                  {!(client as any).knownAllergies && !(client as any).medicalConditions && !(client as any).currentMedications && !(client as any).pastSurgeries && (
                    <p className="text-sm text-slate-400">No medical history recorded</p>
                  )}
                </div>
              </div>
            </div>
            {/* Emergency contact */}
            {(client as any).emergencyContactName && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Emergency Contact</h3>
                <div className="space-y-1.5">
                  {[
                    { label: "Name", value: (client as any).emergencyContactName },
                    { label: "Phone", value: (client as any).emergencyContactPhone },
                    { label: "Relation", value: (client as any).emergencyContactRelation },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400 text-xs w-20 flex-shrink-0">{label}</span>
                      <span className="text-slate-700 dark:text-slate-300">{value}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}
          </TabsContent>

          {/* PACKAGES */}
          <TabsContent value="packages" className="p-5 space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Packages &amp; Memberships
              </h3>
              <span className="text-xs text-slate-400">
                {packagesData?.total ?? 0} total
              </span>
            </div>

            {packagesLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}

            {!packagesLoading && (!packagesData?.purchases?.length) && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                <Package className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                <p className="text-sm">No packages found for this user</p>
              </div>
            )}

            <div className="space-y-3">
              {(packagesData?.purchases ?? []).map((pkg) => {
                const isDisableable = ["active", "pending", "paused"].includes(pkg.status);
                const statusColors: Record<string, string> = {
                  active:    "bg-green-50 text-green-700 border-green-200",
                  pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
                  paused:    "bg-blue-50 text-blue-700 border-blue-200",
                  expired:   "bg-slate-50 text-slate-500 border-slate-200",
                  cancelled: "bg-red-50 text-red-600 border-red-200",
                };
                const statusClass = statusColors[pkg.status] ?? "bg-slate-50 text-slate-500 border-slate-200";
                return (
                  <div
                    key={pkg.id}
                    data-testid={`card-user-package-${pkg.id}`}
                    className={`rounded-lg border p-4 space-y-2 ${isDisableable ? "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700" : "bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-70"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {pkg.package_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${statusClass}`}>
                            {pkg.status}
                          </span>
                          {pkg.auto_renew && (
                            <span className="text-[10px] text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                              Auto-renew
                            </span>
                          )}
                        </div>
                      </div>
                      {isDisableable && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs flex-shrink-0"
                          disabled={disablePackageMutation.isPending}
                          onClick={() => disablePackageMutation.mutate(pkg.id)}
                          data-testid={`button-disable-package-${pkg.id}`}
                        >
                          {disablePackageMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <ShieldOff className="h-3 w-3 mr-1" />
                          )}
                          Disable
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Paid:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">${pkg.price_paid}</span>
                      </div>
                      {pkg.purchased_at && (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Purchased:</span>
                          <span>{format(new Date(pkg.purchased_at), "MMM d, yyyy")}</span>
                        </div>
                      )}
                      {pkg.activated_at && (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Activated:</span>
                          <span>{format(new Date(pkg.activated_at), "MMM d, yyyy")}</span>
                        </div>
                      )}
                      {pkg.expires_at && (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Expires:</span>
                          <span className={new Date(pkg.expires_at) < new Date() ? "text-red-500 font-medium" : ""}>
                            {format(new Date(pkg.expires_at), "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                      {pkg.cancelled_at && (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-slate-400">Cancelled:</span>
                          <span>{format(new Date(pkg.cancelled_at), "MMM d, yyyy")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// ─── Right Panel: Actions ─────────────────────────────────────────────────────
function ClientActionsPanel({
  client,
  onActionDone,
}: {
  client: ClientListItem;
  onActionDone: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [suspendReason, setSuspendReason] = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletNote, setWalletNote] = useState("");
  const [migrateTarget, setMigrateTarget] = useState("HU");
  const [migrateReason, setMigrateReason] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    onActionDone();
  }, [qc, onActionDone]);

  const suspendMutation = useMutation({
    mutationFn: async (vars: { suspend: boolean }) => {
      const r = await apiRequest("PATCH", `/api/admin/users/${client.id}/suspend`, {
        isSuspended: vars.suspend,
        suspensionReason: vars.suspend ? suspendReason : undefined,
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.suspend ? "User suspended" : "User unsuspended" });
      setSuspendReason("");
      invalidate();
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const notifMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/users/${client.id}/notify`, {
        title: notifTitle,
        body: notifBody,
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Notification sent" });
      setNotifTitle("");
      setNotifBody("");
      setActiveSection(null);
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const walletMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(walletAmount);
      if (isNaN(amount) || amount === 0) throw new Error("Invalid amount");
      const r = await apiRequest("POST", `/api/admin/wallets/${client.id}/adjust`, {
        amount,
        reason: walletNote || "Admin adjustment",
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Wallet adjusted" });
      setWalletAmount("");
      setWalletNote("");
      setActiveSection(null);
      qc.invalidateQueries({ queryKey: ["/api/wallet", client.id] });
      qc.invalidateQueries({ queryKey: ["/api/admin/wallets", client.id, "transactions"] });
    },
    onError: (e: Error) => toast({ title: e.message || "Failed", variant: "destructive" }),
  });

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/users/${client.id}/migrate-country`, {
        targetCountryCode: migrateTarget,
        reason: migrateReason,
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: `Migrated to ${migrateTarget}` });
      setMigrateReason("");
      setActiveSection(null);
      invalidate();
    },
    onError: () => toast({ title: "Migration failed", variant: "destructive" }),
  });

  const toggleSection = (s: string) => setActiveSection((cur) => cur === s ? null : s);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-semibold text-sm text-slate-900 dark:text-slate-100">Actions</h2>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{clientName(client)}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">

          {/* Suspend / Unsuspend */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 text-sm font-medium"
              onClick={() => toggleSection("suspend")}
              data-testid="button-toggle-suspend-section"
            >
              {client.isSuspended ? (
                <><Unlock className="h-4 w-4 text-green-600" /><span className="text-green-700 dark:text-green-500">Unsuspend account</span></>
              ) : (
                <><Ban className="h-4 w-4 text-red-500" /><span className="text-red-600">Suspend account</span></>
              )}
            </button>
            {activeSection === "suspend" && (
              <div className="px-3 pb-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                {!client.isSuspended && (
                  <Textarea
                    placeholder="Reason for suspension…"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    className="text-xs h-20 resize-none"
                    data-testid="textarea-suspend-reason"
                  />
                )}
                <Button
                  size="sm"
                  variant={client.isSuspended ? "outline" : "destructive"}
                  className="w-full h-8 text-xs"
                  disabled={suspendMutation.isPending}
                  onClick={() => suspendMutation.mutate({ suspend: !client.isSuspended })}
                  data-testid="button-confirm-suspend"
                >
                  {suspendMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  {client.isSuspended ? "Confirm Unsuspend" : "Confirm Suspend"}
                </Button>
              </div>
            )}
          </div>

          {/* Send Notification */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300"
              onClick={() => toggleSection("notify")}
              data-testid="button-toggle-notify-section"
            >
              <Bell className="h-4 w-4 text-blue-500" />
              Send notification
            </button>
            {activeSection === "notify" && (
              <div className="px-3 pb-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                <Input
                  placeholder="Title"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  className="h-7 text-xs"
                  data-testid="input-notify-title"
                />
                <Textarea
                  placeholder="Message body…"
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  className="text-xs h-16 resize-none"
                  data-testid="textarea-notify-body"
                />
                <Button
                  size="sm"
                  className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={notifMutation.isPending || !notifTitle.trim() || !notifBody.trim()}
                  onClick={() => notifMutation.mutate()}
                  data-testid="button-send-notify"
                >
                  {notifMutation.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Send className="h-3 w-3 mr-1.5" />}
                  Send
                </Button>
              </div>
            )}
          </div>

          {/* Wallet Adjustment */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300"
              onClick={() => toggleSection("wallet")}
              data-testid="button-toggle-wallet-section"
            >
              <Wallet className="h-4 w-4 text-emerald-500" />
              Adjust wallet
            </button>
            {activeSection === "wallet" && (
              <div className="px-3 pb-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                <div>
                  <Label className="text-[10px] text-slate-400 uppercase tracking-wide">Amount (+ credit / − debit)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 50 or -20"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    className="h-7 text-xs mt-1"
                    data-testid="input-wallet-amount"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400 uppercase tracking-wide">Note</Label>
                  <Input
                    placeholder="Reason…"
                    value={walletNote}
                    onChange={(e) => setWalletNote(e.target.value)}
                    className="h-7 text-xs mt-1"
                    data-testid="input-wallet-note"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={walletMutation.isPending || !walletAmount}
                  onClick={() => walletMutation.mutate()}
                  data-testid="button-apply-wallet-adjustment"
                >
                  {walletMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  Apply adjustment
                </Button>
              </div>
            )}
          </div>

          {/* Country Migration */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300"
              onClick={() => toggleSection("migrate")}
              data-testid="button-toggle-migrate-section"
            >
              <Globe className="h-4 w-4 text-purple-500" />
              Migrate country
            </button>
            {activeSection === "migrate" && (
              <div className="px-3 pb-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                <p className="text-[10px] text-slate-400">Currently: <strong>{client.countryCode || "—"}</strong></p>
                <Select value={migrateTarget} onValueChange={setMigrateTarget}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-migrate-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HU">Hungary (HU)</SelectItem>
                    <SelectItem value="IR">Iran (IR)</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Migration reason…"
                  value={migrateReason}
                  onChange={(e) => setMigrateReason(e.target.value)}
                  className="text-xs h-14 resize-none"
                  data-testid="textarea-migrate-reason"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                  disabled={migrateMutation.isPending || !migrateReason.trim() || migrateTarget === client.countryCode}
                  onClick={() => migrateMutation.mutate()}
                  data-testid="button-confirm-migrate"
                >
                  {migrateMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  Migrate to {migrateTarget}
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Quick Info */}
          <div className="space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-slate-400" />
              <span>Role: <strong>{client.role}</strong></span>
            </div>
            {client.referralCode && (
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-slate-400" />
                <span>Referral: <strong>{client.referralCode}</strong></span>
              </div>
            )}
            {client.insuranceProvider && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                <span className="truncate">Insurance: {client.insuranceProvider}</span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Main: Client Operations Console ─────────────────────────────────────────
export function ClientOperationsConsole() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: usersData, isLoading } = useQuery<{ users: ClientListItem[] } | ClientListItem[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () =>
      fetch("/api/admin/users?limit=50&role=patient", { credentials: "include" }).then((r) => r.json()),
  });

  const clients: ClientListItem[] = Array.isArray(usersData)
    ? usersData
    : (usersData as { users: ClientListItem[] })?.users ?? [];

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const handleRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    if (selectedClientId) {
      qc.invalidateQueries({ queryKey: ["/api/wallet", selectedClientId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/wallets", selectedClientId, "transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/bookings", selectedClientId] });
    }
  }, [qc, selectedClientId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div
      className="flex border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
      style={{ height: "calc(100vh - 220px)", minHeight: "600px" }}
      data-testid="client-operations-console"
    >
      {/* Left — directory */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <ClientDirectory
          clients={clients}
          selectedId={selectedClientId}
          onSelect={setSelectedClientId}
        />
      </div>

      {/* Center — workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900">
        {selectedClient ? (
          <ClientWorkspace
            key={selectedClient.id}
            client={selectedClient}
            onRefresh={handleRefresh}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Users className="h-12 w-12 text-slate-200 dark:text-slate-700" />
            <p className="text-sm">Select a client to view their workspace</p>
            <p className="text-xs">{clients.length} clients loaded</p>
          </div>
        )}
      </div>

      {/* Right — actions */}
      <div className="w-64 flex-shrink-0 flex flex-col">
        {selectedClient ? (
          <ClientActionsPanel
            key={selectedClient.id}
            client={selectedClient}
            onActionDone={handleRefresh}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-300 p-4 text-center">Select a client to see actions</p>
          </div>
        )}
      </div>
    </div>
  );
}
