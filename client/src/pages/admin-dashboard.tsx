import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Loader2, Shield, Users, Building, Trash2, Edit, Plus, Tag, DollarSign,
  Calendar, FileText, Settings, MessageSquare, Activity, BarChart3,
  Bell, HelpCircle, CheckCircle, XCircle, Clock, Eye
} from "lucide-react";
import type { User, ProviderWithUser, PromoCode, ProviderPricingOverride } from "@shared/schema";
import { useLocation } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const adminProviderSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  city: z.string().min(2),
  type: z.enum(["physiotherapist", "doctor", "nurse"]),
  specialization: z.string().min(3),
  bio: z.string().min(50),
  yearsExperience: z.coerce.number().min(0).max(50),
  education: z.string().min(3),
  consultationFee: z.coerce.number().min(1),
  homeVisitFee: z.coerce.number().optional(),
  languages: z.array(z.string()).min(1),
  availableDays: z.array(z.string()).min(1),
});

type AdminProviderData = z.infer<typeof adminProviderSchema>;

const languageOptions = [
  { value: "english", label: "English" },
  { value: "hungarian", label: "Hungarian" },
  { value: "german", label: "German" },
  { value: "french", label: "French" },
];

const dayOptions = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

// Analytics Overview Component
function AnalyticsOverview() {
  const { data: analytics, isLoading } = useQuery<{
    totalUsers: number;
    totalProviders: number;
    totalAppointments: number;
    totalRevenue: number;
    pendingAppointments: number;
    completedAppointments: number;
  }>({
    queryKey: ["/api/admin/analytics"],
  });

  const mockChartData = [
    { name: 'Jan', bookings: 40, revenue: 2400 },
    { name: 'Feb', bookings: 30, revenue: 1398 },
    { name: 'Mar', bookings: 50, revenue: 3800 },
    { name: 'Apr', bookings: 47, revenue: 3908 },
    { name: 'May', bookings: 65, revenue: 4800 },
    { name: 'Jun', bookings: 59, revenue: 3800 },
  ];

  const pieData = [
    { name: 'Completed', value: analytics?.completedAppointments || 0, color: '#22c55e' },
    { name: 'Pending', value: analytics?.pendingAppointments || 0, color: '#f59e0b' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">{analytics?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-providers">{analytics?.totalProviders || 0}</div>
            <p className="text-xs text-muted-foreground">Active providers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-bookings">{analytics?.totalAppointments || 0}</div>
            <p className="text-xs text-muted-foreground">All time bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">${Number(analytics?.totalRevenue || 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Platform earnings</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Booking Trends</CardTitle>
            <CardDescription>Monthly booking overview</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="bookings" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointment Status</CardTitle>
            <CardDescription>Current appointment distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-4">
              {pieData.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Bookings Management Component
function BookingsManagement() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: bookings, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/bookings"],
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/bookings/${id}`, { status });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to update booking");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Booking updated successfully" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredBookings = bookings?.filter((b: any) => 
    statusFilter === "all" || b.status === statusFilter
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="select-booking-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bookings</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Showing {filteredBookings.length} bookings
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <div className="divide-y">
              {filteredBookings.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No bookings found
                </div>
              ) : (
                filteredBookings.map((booking: any) => (
                  <div key={booking.id} className="p-4 flex items-center justify-between gap-4" data-testid={`row-booking-${booking.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">Booking #{String(booking.id).slice(0, 8)}</span>
                        <Badge variant={
                          booking.status === 'completed' ? 'default' :
                          booking.status === 'confirmed' ? 'secondary' :
                          booking.status === 'cancelled' ? 'destructive' : 'outline'
                        }>
                          {booking.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(booking.appointmentDate).toLocaleDateString()} at {booking.startTime}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Type: {booking.appointmentType} | Amount: ${Number(booking.totalAmount || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={booking.status}
                        onValueChange={(status) => updateBookingMutation.mutate({ id: booking.id, status })}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-booking-status-${booking.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// Financial Reports Component
function FinancialReports() {
  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const payments = analytics?.recentPayments || [];
  const totalRevenue = parseFloat(analytics?.totalRevenue || "0");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-financial-total">${totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Bookings</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-financial-completed">{analytics?.completedBookings || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-financial-users">{analytics?.totalUsers || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium">Date</th>
                  <th className="h-10 px-4 text-left font-medium">Amount</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No recent payments
                    </td>
                  </tr>
                ) : (
                  payments.map((payment: any) => (
                    <tr key={payment.id} className="border-b last:border-0">
                      <td className="p-4">{new Date(payment.createdAt).toLocaleDateString()}</td>
                      <td className="p-4">${Number(payment.amount).toFixed(2)}</td>
                      <td className="p-4">
                        <Badge variant={payment.status === "completed" ? "default" : "secondary"}>
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="p-4 capitalize">{payment.paymentMethod}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Provider Management Component
function ProvidersManagement() {
  const { toast } = useToast();
  const { data: providers, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
  });

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const { data: providerStats, isLoading: isLoadingStats } = useQuery<any>({
    queryKey: ["/api/admin/providers", selectedProviderId, "stats"],
    enabled: !!selectedProviderId,
  });

  const updateProviderMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await apiRequest("PATCH", `/api/admin/providers/${id}`, data);
      if (!response.ok) throw new Error("Failed to update provider");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Provider updated successfully" });
      refetch();
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Manage Providers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium">Provider</th>
                  <th className="h-10 px-4 text-left font-medium">Specialization</th>
                  <th className="h-10 px-4 text-left font-medium">Dates</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers?.map((provider: any) => (
                  <tr key={provider.id} className="border-b last:border-0">
                    <td className="p-4">
                      <div className="font-medium">{provider.user?.firstName} {provider.user?.lastName}</div>
                      <div className="text-sm text-muted-foreground">{provider.user?.email}</div>
                    </td>
                    <td className="p-4">{provider.specialization}</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="w-10 text-muted-foreground">Start:</span>
                          <Input 
                            type="date" 
                            className="h-7 py-0 px-1 w-28 text-[10px]" 
                            defaultValue={provider.startDate ? new Date(provider.startDate).toISOString().split('T')[0] : ""}
                            onBlur={(e) => {
                              if (e.target.value) {
                                updateProviderMutation.mutate({ id: provider.id, startDate: new Date(e.target.value) });
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="w-10 text-muted-foreground">End:</span>
                          <Input 
                            type="date" 
                            className="h-7 py-0 px-1 w-28 text-[10px]" 
                            defaultValue={provider.endDate ? new Date(provider.endDate).toISOString().split('T')[0] : ""}
                            onBlur={(e) => {
                              updateProviderMutation.mutate({ id: provider.id, endDate: e.target.value ? new Date(e.target.value) : null });
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={provider.status === 'active' ? 'default' : provider.status === 'suspended' ? 'destructive' : 'secondary'}>
                        {provider.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Select
                          value={provider.status}
                          onValueChange={(status) => updateProviderMutation.mutate({ id: provider.id, status })}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setSelectedProviderId(provider.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View Stats
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedProviderId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Booking Statistics</CardTitle>
              <CardDescription>Detailed overview for the selected provider</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProviderId(null)}>Close</Button>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <div className="text-sm font-medium text-muted-foreground">Total Bookings</div>
                    <div className="text-2xl font-bold">{providerStats?.total || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-orange-100 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/50">
                    <div className="text-sm font-medium text-orange-600 dark:text-orange-400">Pending</div>
                    <div className="text-2xl font-bold">{providerStats?.pending || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-100 border border-green-200 dark:bg-green-950/20 dark:border-green-900/50">
                    <div className="text-sm font-medium text-green-600 dark:text-green-400">Completed</div>
                    <div className="text-2xl font-bold">{providerStats?.completed || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-red-100 border border-red-200 dark:bg-red-950/20 dark:border-red-900/50">
                    <div className="text-sm font-medium text-red-600 dark:text-red-400">Cancelled</div>
                    <div className="text-2xl font-bold">{providerStats?.cancelled || 0}</div>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="h-10 px-4 text-left font-medium">Patient</th>
                        <th className="h-10 px-4 text-left font-medium">Date</th>
                        <th className="h-10 px-4 text-left font-medium">Amount</th>
                        <th className="h-10 px-4 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerStats?.bookings.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No bookings found</td></tr>
                      ) : (
                        providerStats?.bookings.map((booking: any) => (
                          <tr key={booking.id} className="border-b last:border-0">
                            <td className="p-4 font-medium">{booking.patientName}</td>
                            <td className="p-4">{new Date(booking.date).toLocaleDateString()} at {booking.startTime}</td>
                            <td className="p-4">${Number(booking.amount).toFixed(2)}</td>
                            <td className="p-4">
                              <Badge variant={
                                booking.status === 'completed' ? 'default' :
                                booking.status === 'pending' ? 'outline' :
                                booking.status === 'cancelled' ? 'destructive' : 'secondary'
                              }>
                                {booking.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Content Management Component
function ContentManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("faqs");

  // FAQs
  const { data: faqs, refetch: refetchFaqs } = useQuery<any[]>({
    queryKey: ["/api/admin/faqs"],
  });

  const faqForm = useForm({
    defaultValues: { question: "", answer: "", category: "", sortOrder: 0 },
  });

  const createFaqMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/faqs", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to create FAQ");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "FAQ created!" });
      faqForm.reset();
      refetchFaqs();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/faqs/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "FAQ deleted" });
      refetchFaqs();
    },
  });

  // Announcements
  const { data: announcements, refetch: refetchAnnouncements } = useQuery<any[]>({
    queryKey: ["/api/admin/announcements"],
  });

  const announcementForm = useForm({
    defaultValues: { 
      title: "", 
      content: "", 
      type: "info",
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/announcements", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to create announcement");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Announcement created!" });
      announcementForm.reset();
      refetchAnnouncements();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/announcements/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Announcement deleted" });
      refetchAnnouncements();
    },
  });

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="faqs" data-testid="tab-content-faqs">FAQs</TabsTrigger>
          <TabsTrigger value="announcements" data-testid="tab-content-announcements">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="faqs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create FAQ</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...faqForm}>
                <form onSubmit={faqForm.handleSubmit((data) => createFaqMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={faqForm.control}
                    name="question"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-faq-question" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={faqForm.control}
                    name="answer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Answer</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-faq-answer" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={faqForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Booking, Payment, General" data-testid="input-faq-category" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createFaqMutation.isPending} data-testid="button-create-faq">
                    {createFaqMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create FAQ
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All FAQs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {faqs?.map((faq: any) => (
                  <div key={faq.id} className="p-4 border rounded-lg" data-testid={`card-faq-${faq.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium">{faq.question}</p>
                        <p className="text-sm text-muted-foreground mt-1">{faq.answer}</p>
                        {faq.category && <Badge variant="outline" className="mt-2">{faq.category}</Badge>}
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => deleteFaqMutation.mutate(faq.id)}
                        data-testid={`button-delete-faq-${faq.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Announcement</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...announcementForm}>
                <form onSubmit={announcementForm.handleSubmit((data) => createAnnouncementMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={announcementForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-announcement-title" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={announcementForm.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Content</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-announcement-content" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={announcementForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-announcement-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="info">Info</SelectItem>
                              <SelectItem value="warning">Warning</SelectItem>
                              <SelectItem value="success">Success</SelectItem>
                              <SelectItem value="error">Error</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={announcementForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-announcement-start" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={announcementForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-announcement-end" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" disabled={createAnnouncementMutation.isPending} data-testid="button-create-announcement">
                    {createAnnouncementMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create Announcement
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements?.map((ann: any) => (
                  <div key={ann.id} className="p-4 border rounded-lg" data-testid={`card-announcement-${ann.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{ann.title}</p>
                          <Badge variant={
                            ann.type === 'warning' ? 'destructive' :
                            ann.type === 'success' ? 'default' : 'secondary'
                          }>{ann.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{ann.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(ann.startDate).toLocaleDateString()} - {new Date(ann.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => deleteAnnouncementMutation.mutate(ann.id)}
                        data-testid={`button-delete-announcement-${ann.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Platform Settings Component
function PlatformSettings() {
  const { toast } = useToast();

  const { data: settings, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/settings"],
  });

  const settingsForm = useForm({
    defaultValues: { key: "", value: "", category: "general", description: "" },
  });

  const createSettingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/settings", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to save setting");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Setting saved!" });
      settingsForm.reset();
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("POST", "/api/admin/settings", { key, value });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to update setting");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Setting updated!" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const groupedSettings = settings?.reduce((acc: any, setting: any) => {
    const category = setting.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(setting);
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add New Setting</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...settingsForm}>
            <form onSubmit={settingsForm.handleSubmit((data) => createSettingMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={settingsForm.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Setting Key</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., site_name" data-testid="input-setting-key" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={settingsForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-setting-category">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="booking">Booking</SelectItem>
                          <SelectItem value="payment">Payment</SelectItem>
                          <SelectItem value="notification">Notification</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={settingsForm.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-setting-value" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={settingsForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Description of this setting" data-testid="input-setting-description" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={createSettingMutation.isPending} data-testid="button-create-setting">
                {createSettingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Setting
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {Object.entries(groupedSettings).map(([category, catSettings]: [string, any]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="capitalize">{category} Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {catSettings.map((setting: any) => (
                <div key={setting.id} className="flex items-center gap-4 p-3 border rounded-lg" data-testid={`row-setting-${setting.key}`}>
                  <div className="flex-1">
                    <p className="font-medium font-mono text-sm">{setting.key}</p>
                    {setting.description && (
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    )}
                  </div>
                  <Input
                    defaultValue={setting.value}
                    className="w-64"
                    onBlur={(e) => {
                      if (e.target.value !== setting.value) {
                        updateSettingMutation.mutate({ key: setting.key, value: e.target.value });
                      }
                    }}
                    data-testid={`input-setting-value-${setting.key}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Audit Logs Component
function AuditLogs() {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logs</CardTitle>
        <CardDescription>Track all administrative actions</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <div className="divide-y">
            {logs?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No audit logs found
              </div>
            ) : (
              logs?.map((log: any) => (
                <div key={log.id} className="py-4 flex items-start gap-4" data-testid={`row-audit-${log.id}`}>
                  <div className="p-2 rounded-full bg-muted">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{log.action}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {log.entityType} - {log.entityId?.slice(0, 8)}
                      </span>
                    </div>
                    {log.details && (
                      <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.ipAddress && ` | IP: ${log.ipAddress}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Support Tickets Component
function SupportTickets() {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  const { data: tickets, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets"],
  });

  const { data: ticketMessages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets", selectedTicket?.id, "messages"],
    enabled: !!selectedTicket,
  });

  const messageForm = useForm({
    defaultValues: { message: "" },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, status, priority }: { id: string; status?: string; priority?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/support-tickets/${id}`, { status, priority });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to update ticket");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Ticket updated!" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      const response = await apiRequest("POST", `/api/admin/support-tickets/${ticketId}/messages`, { message });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to send message");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Message sent!" });
      messageForm.reset();
      refetchMessages();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Support Tickets</CardTitle>
          <CardDescription>Manage customer support requests</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {tickets?.map((ticket: any) => (
                <div
                  key={ticket.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTicket?.id === ticket.id ? 'border-primary bg-muted/50' : 'hover-elevate'
                  }`}
                  onClick={() => setSelectedTicket(ticket)}
                  data-testid={`card-ticket-${ticket.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ticket.subject}</p>
                      <p className="text-sm text-muted-foreground truncate">{ticket.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={
                        ticket.status === 'open' ? 'default' :
                        ticket.status === 'in_progress' ? 'secondary' :
                        ticket.status === 'resolved' ? 'outline' : 'destructive'
                      }>
                        {ticket.status?.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {ticket.priority}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedTicket ? `Ticket: ${selectedTicket.subject}` : 'Select a Ticket'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedTicket ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Select
                  value={selectedTicket.status}
                  onValueChange={(status) => {
                    updateTicketMutation.mutate({ id: selectedTicket.id, status });
                    setSelectedTicket({ ...selectedTicket, status });
                  }}
                >
                  <SelectTrigger className="w-36" data-testid="select-ticket-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={selectedTicket.priority}
                  onValueChange={(priority) => {
                    updateTicketMutation.mutate({ id: selectedTicket.id, priority });
                    setSelectedTicket({ ...selectedTicket, priority });
                  }}
                >
                  <SelectTrigger className="w-28" data-testid="select-ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">{selectedTicket.description}</p>
              </div>

              <ScrollArea className="h-[250px] border rounded-lg p-4">
                <div className="space-y-3">
                  {ticketMessages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${msg.isStaffReply ? 'bg-primary/10 ml-4' : 'bg-muted mr-4'}`}
                      data-testid={`message-${msg.id}`}
                    >
                      <p className="text-sm">{msg.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(msg.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Form {...messageForm}>
                <form onSubmit={messageForm.handleSubmit((data) => {
                  sendMessageMutation.mutate({ ticketId: selectedTicket.id, message: data.message });
                })} className="flex gap-2">
                  <FormField
                    control={messageForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} placeholder="Type your reply..." data-testid="input-ticket-reply" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={sendMessageMutation.isPending} data-testid="button-send-reply">
                    {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                  </Button>
                </form>
              </Form>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              Select a ticket to view details
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Pricing Management Component
function PricingManagement({ providers }: { providers: ProviderWithUser[] }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: pricingOverrides, refetch } = useQuery<ProviderPricingOverride[]>({
    queryKey: ["/api/admin/pricing-overrides"],
  });

  const pricingForm = useForm<{
    providerId: string;
    consultationFee?: number;
    homeVisitFee?: number;
    discountPercentage?: number;
    notes?: string;
  }>({
    defaultValues: {
      providerId: "",
      consultationFee: undefined,
      homeVisitFee: undefined,
      discountPercentage: undefined,
      notes: "",
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(editingId ? "PATCH" : "POST", 
        editingId ? `/api/admin/pricing-overrides/${editingId}` : "/api/admin/pricing-overrides", 
        data
      );
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || "Failed to save pricing override");
        return resData;
      } else {
        const text = await response.text();
        console.error("Non-JSON response:", text);
        throw new Error("Server returned an unexpected response format");
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Pricing updated!" : "Pricing override created!" });
      pricingForm.reset();
      setEditingId(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePricingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/pricing-overrides/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Pricing override deleted" });
      refetch();
    },
  });

  return (
    <div className="space-y-6">
      <Form {...pricingForm}>
        <form onSubmit={pricingForm.handleSubmit((data) => createPricingMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={pricingForm.control}
              name="providerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-pricing-provider">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.user.firstName} {p.user.lastName} - {p.specialization}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={pricingForm.control}
              name="consultationFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Consultation Fee ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-pricing-consultation" />
                  </FormControl>
                  <FormDescription>Leave empty to use provider's default</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={pricingForm.control}
              name="homeVisitFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Home Visit Fee ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-pricing-homevisit" />
                  </FormControl>
                  <FormDescription>Leave empty to use provider's default</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={pricingForm.control}
              name="discountPercentage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Percentage (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" max="100" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-pricing-discount" />
                  </FormControl>
                  <FormDescription>Applies to all provider's services</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={pricingForm.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} data-testid="input-pricing-notes" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={createPricingMutation.isPending} data-testid="button-save-pricing">
              {createPricingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">{editingId ? "Update" : "Create"} Override</span>
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={() => { setEditingId(null); pricingForm.reset(); }} data-testid="button-cancel-pricing">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Form>

      <div className="space-y-4">
        <h3 className="font-semibold">Active Pricing Overrides</h3>
        {pricingOverrides?.map((override) => {
          const provider = providers.find(p => p.id === override.providerId);
          return (
            <div key={override.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`row-pricing-${override.id}`}>
              <div>
                <p className="font-medium">{provider?.user.firstName} {provider?.user.lastName}</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  {override.consultationFee && <p>Consultation: ${Number(override.consultationFee).toFixed(2)}</p>}
                  {override.homeVisitFee && <p>Home Visit: ${Number(override.homeVisitFee).toFixed(2)}</p>}
                  {override.discountPercentage && <p>Discount: {Number(override.discountPercentage)}%</p>}
                  {override.notes && <p className="italic">{override.notes}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(override.id);
                    pricingForm.reset({
                      providerId: override.providerId,
                      consultationFee: override.consultationFee ? Number(override.consultationFee) : undefined,
                      homeVisitFee: override.homeVisitFee ? Number(override.homeVisitFee) : undefined,
                      discountPercentage: override.discountPercentage ? Number(override.discountPercentage) : undefined,
                      notes: override.notes || "",
                    });
                  }}
                  data-testid={`button-edit-pricing-${override.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deletePricingMutation.mutate(override.id)}
                  data-testid={`button-delete-pricing-${override.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Promo Code Management Component
function PromoCodeManagement({ providers }: { providers: ProviderWithUser[] }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: promoCodes, refetch } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const promoForm = useForm<{
    code: string;
    description: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    maxUses?: number;
    validFrom: string;
    validUntil: string;
    applicableProviders?: string[];
    minAmount?: number;
  }>({
    defaultValues: {
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 0,
      maxUses: undefined,
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      applicableProviders: [],
      minAmount: undefined,
    },
  });

  const createPromoMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(editingId ? "PATCH" : "POST",
        editingId ? `/api/admin/promo-codes/${editingId}` : "/api/admin/promo-codes",
        data
      );
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to save promo code");
      return resData;
    },
    onSuccess: () => {
      toast({ title: editingId ? "Promo code updated!" : "Promo code created!" });
      promoForm.reset();
      setEditingId(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePromoMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Promo code deleted" });
      refetch();
    },
  });

  return (
    <div className="space-y-6">
      <Form {...promoForm}>
        <form onSubmit={promoForm.handleSubmit((data) => createPromoMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={promoForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Promo Code</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="SUMMER2024" onChange={e => field.onChange(e.target.value.toUpperCase())} data-testid="input-promo-code" />
                  </FormControl>
                  <FormDescription>Will be converted to uppercase</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="discountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-promo-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="discountValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Value</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} data-testid="input-promo-value" />
                  </FormControl>
                  <FormDescription>
                    {promoForm.watch("discountType") === "percentage" ? "Percentage (0-100)" : "Dollar amount"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="maxUses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Uses (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} data-testid="input-promo-max-uses" />
                  </FormControl>
                  <FormDescription>Leave empty for unlimited</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="validFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valid From</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-promo-valid-from" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="validUntil"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valid Until</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-promo-valid-until" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="minAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Amount ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-promo-min-amount" />
                  </FormControl>
                  <FormDescription>Minimum booking amount required</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={promoForm.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} data-testid="input-promo-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={createPromoMutation.isPending} data-testid="button-save-promo">
              {createPromoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">{editingId ? "Update" : "Create"} Promo Code</span>
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={() => { setEditingId(null); promoForm.reset(); }} data-testid="button-cancel-promo">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Form>

      <div className="space-y-4">
        <h3 className="font-semibold">Active Promo Codes</h3>
        {promoCodes?.map((promo) => (
          <div key={promo.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`row-promo-${promo.id}`}>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono font-bold text-lg">{promo.code}</p>
                <Badge variant={promo.isActive ? 'default' : 'secondary'}>
                  {promo.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{promo.description}</p>
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                <p>
                  Discount: {promo.discountType === "percentage" 
                    ? `${Number(promo.discountValue)}%` 
                    : `$${Number(promo.discountValue)}`}
                </p>
                <p>Valid: {new Date(promo.validFrom).toLocaleDateString()} - {new Date(promo.validUntil).toLocaleDateString()}</p>
                {promo.maxUses && <p>Uses: {promo.usedCount || 0} / {promo.maxUses}</p>}
                {promo.minAmount && <p>Min Amount: ${Number(promo.minAmount)}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingId(promo.id);
                  promoForm.reset({
                    code: promo.code,
                    description: promo.description || "",
                    discountType: promo.discountType as "percentage" | "fixed",
                    discountValue: Number(promo.discountValue),
                    maxUses: promo.maxUses || undefined,
                    validFrom: new Date(promo.validFrom).toISOString().split('T')[0],
                    validUntil: new Date(promo.validUntil).toISOString().split('T')[0],
                    minAmount: promo.minAmount ? Number(promo.minAmount) : undefined,
                  });
                }}
                data-testid={`button-edit-promo-${promo.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deletePromoMutation.mutate(promo.id)}
                data-testid={`button-delete-promo-${promo.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: providers } = useQuery<ProviderWithUser[]>({
    queryKey: ["/api/providers"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: user?.role === "admin",
  });

  const form = useForm<AdminProviderData>({
    resolver: zodResolver(adminProviderSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      type: "physiotherapist",
      specialization: "",
      bio: "",
      yearsExperience: 0,
      education: "",
      consultationFee: 50,
      homeVisitFee: undefined,
      languages: ["english"],
      availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    },
  });

  const createProviderMutation = useMutation({
    mutationFn: async (data: AdminProviderData) => {
      const response = await apiRequest("POST", "/api/admin/providers", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create provider");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Provider created!",
        description: "The provider has been successfully added.",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create provider",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardHeader className="text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Admin Access Required</CardTitle>
              <CardDescription>
                You don't have permission to access this page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/")} className="w-full" data-testid="button-go-home">
                Go to Home
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-admin-title">
            <Shield className="h-8 w-8" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">Manage your healthcare platform</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="bookings" data-testid="tab-bookings">
              <Calendar className="h-4 w-4 mr-2" />
              Bookings
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="providers" data-testid="tab-providers">
              <Building className="h-4 w-4 mr-2" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="financial" data-testid="tab-financial">
              <DollarSign className="h-4 w-4 mr-2" />
              Financial
            </TabsTrigger>
            <TabsTrigger value="content" data-testid="tab-content">
              <FileText className="h-4 w-4 mr-2" />
              Content
            </TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">
              <Tag className="h-4 w-4 mr-2" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="promos" data-testid="tab-promos">
              <Tag className="h-4 w-4 mr-2" />
              Promos
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <Plus className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">
              <Activity className="h-4 w-4 mr-2" />
              Audit
            </TabsTrigger>
            <TabsTrigger value="support" data-testid="tab-support">
              <MessageSquare className="h-4 w-4 mr-2" />
              Support
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <AnalyticsOverview />
          </TabsContent>

          <TabsContent value="bookings">
            <BookingsManagement />
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Manage registered users on the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {users?.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`row-user-${u.id}`}>
                      <div>
                        <p className="font-medium">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                        <p className="text-xs text-muted-foreground">{u.city}</p>
                      </div>
                      <Badge variant={u.role === 'admin' ? 'default' : u.role === 'provider' ? 'secondary' : 'outline'}>
                        {u.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="providers">
            <ProvidersManagement />
          </TabsContent>

          <TabsContent value="financial">
            <FinancialReports />
          </TabsContent>

          <TabsContent value="content">
            <ContentManagement />
          </TabsContent>

          <TabsContent value="pricing">
            <Card>
              <CardHeader>
                <CardTitle>Pricing Overrides</CardTitle>
                <CardDescription>Manage custom pricing for providers</CardDescription>
              </CardHeader>
              <CardContent>
                <PricingManagement providers={providers || []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promos">
            <Card>
              <CardHeader>
                <CardTitle>Promo Codes</CardTitle>
                <CardDescription>Create and manage promotional codes</CardDescription>
              </CardHeader>
              <CardContent>
                <PromoCodeManagement providers={providers || []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <PlatformSettings />
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>External Integrations</CardTitle>
                <CardDescription>Manage API keys and credentials for third-party services</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="google" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="google">Google APIs</TabsTrigger>
                    <TabsTrigger value="payments">Payments</TabsTrigger>
                    <TabsTrigger value="messaging">Messaging</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="google" className="space-y-4 py-4">
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="google-api-key">Google Maps API Key</Label>
                        <Input id="google-api-key" placeholder="Enter API Key" type="password" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="google-client-id">Google Client ID (OAuth)</Label>
                        <Input id="google-client-id" placeholder="Enter Client ID" />
                      </div>
                      <Button onClick={() => toast({ title: "Settings saved" })}>Save Google Settings</Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="payments" className="space-y-4 py-4">
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="stripe-key">Stripe Secret Key</Label>
                        <Input id="stripe-key" placeholder="sk_test_..." type="password" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="stripe-webhook">Stripe Webhook Secret</Label>
                        <Input id="stripe-webhook" placeholder="whsec_..." type="password" />
                      </div>
                      <Button onClick={() => toast({ title: "Settings saved" })}>Save Payment Settings</Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="messaging" className="space-y-4 py-4">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>WhatsApp (Twilio SID)</Label>
                          <Input placeholder="AC..." type="password" />
                        </div>
                        <div className="space-y-2">
                          <Label>Telegram Bot Token</Label>
                          <Input placeholder="123456:ABC..." type="password" />
                        </div>
                        <div className="space-y-2">
                          <Label>Viber Auth Token</Label>
                          <Input placeholder="Enter token" type="password" />
                        </div>
                      </div>
                      <Button onClick={() => toast({ title: "Settings saved" })}>Save Messaging Settings</Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogs />
          </TabsContent>

          <TabsContent value="support">
            <SupportTickets />
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}
